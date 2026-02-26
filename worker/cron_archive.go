package main

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/parquet-go/parquet-go"
)

// ParquetPosition is the schema for the Parquet file
type ParquetPosition struct {
	RecordedAt  string  `parquet:"recorded_at"`
	VehicleID   string  `parquet:"vehicle_id"`
	VehicleNum  string  `parquet:"vehicle_num"`
	Route       string  `parquet:"route"`
	TripID      string  `parquet:"trip_id"`
	DirectionID int32   `parquet:"direction_id"`
	Lat         float64 `parquet:"lat"`
	Lon         float64 `parquet:"lon"`
	Speed       float32 `parquet:"speed"`
	Heading     float32 `parquet:"heading"`
}

func getR2Client() (*s3.Client, string) {
	endpoint := os.Getenv("R2_ENDPOINT")
	accessKeyID := os.Getenv("R2_ACCESS_KEY_ID")
	secretAccessKey := os.Getenv("R2_SECRET_ACCESS_KEY")

	if endpoint == "" || accessKeyID == "" || secretAccessKey == "" {
		return nil, ""
	}

	bucket := os.Getenv("R2_BUCKET")
	if bucket == "" {
		bucket = "porto-move"
	}

	client := s3.New(s3.Options{
		BaseEndpoint: &endpoint,
		Region:       "auto",
		Credentials:  credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, ""),
	})

	return client, bucket
}

func runArchivePositions(ctx context.Context, pool *pgxpool.Pool) error {
	startTime := time.Now()

	r2, bucket := getR2Client()
	if r2 == nil {
		log.Println("[archive] R2 not configured — skipping archive")
		return nil
	}

	now := time.Now().UTC()
	yesterday := time.Date(now.Year(), now.Month(), now.Day()-1, 0, 0, 0, 0, time.UTC)
	today := yesterday.AddDate(0, 0, 1)

	key := fmt.Sprintf("positions/%04d/%02d/%02d.parquet",
		yesterday.Year(), yesterday.Month(), yesterday.Day())

	// Check if already archived (idempotent)
	_, err := r2.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: &bucket,
		Key:    &key,
	})
	if err == nil {
		log.Printf("[archive] %s already exists — skipping", key)
		return nil
	}

	// Fetch positions in batches and write Parquet rows
	const batchSize = 50000
	var offset int
	var rows []ParquetPosition

	for {
		dbRows, err := pool.Query(ctx,
			`SELECT "recordedAt", "vehicleId", "vehicleNum", route, "tripId", "directionId", lat, lon, speed, heading
			 FROM "BusPositionLog"
			 WHERE "recordedAt" >= $1 AND "recordedAt" < $2
			 ORDER BY "recordedAt" ASC
			 OFFSET $3 LIMIT $4`,
			yesterday, today, offset, batchSize)
		if err != nil {
			return fmt.Errorf("query positions: %w", err)
		}

		batchCount := 0
		for dbRows.Next() {
			var recordedAt time.Time
			var vehicleID string
			var vehicleNum, route, tripID *string
			var directionID *int16
			var lat, lon float64
			var speed, heading *float32

			if err := dbRows.Scan(&recordedAt, &vehicleID, &vehicleNum, &route, &tripID, &directionID, &lat, &lon, &speed, &heading); err != nil {
				dbRows.Close()
				return fmt.Errorf("scan position: %w", err)
			}

			row := ParquetPosition{
				RecordedAt: recordedAt.Format(time.RFC3339),
				VehicleID:  vehicleID,
				Lat:        lat,
				Lon:        lon,
			}
			if vehicleNum != nil {
				row.VehicleNum = *vehicleNum
			}
			if route != nil {
				row.Route = *route
			}
			if tripID != nil {
				row.TripID = *tripID
			}
			if directionID != nil {
				row.DirectionID = int32(*directionID)
			} else {
				row.DirectionID = -1
			}
			if speed != nil {
				row.Speed = *speed
			} else {
				row.Speed = -1
			}
			if heading != nil {
				row.Heading = *heading
			} else {
				row.Heading = -1
			}

			rows = append(rows, row)
			batchCount++
		}
		dbRows.Close()

		offset += batchCount
		if batchCount < batchSize {
			break
		}
	}

	if len(rows) == 0 {
		log.Printf("[archive] No positions for %s", yesterday.Format("2006-01-02"))
		return nil
	}

	log.Printf("[archive] Writing %d positions to %s", len(rows), key)

	// Write Parquet to buffer
	var buf bytes.Buffer
	writer := parquet.NewGenericWriter[ParquetPosition](&buf)
	if _, err := writer.Write(rows); err != nil {
		return fmt.Errorf("write parquet rows: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close parquet writer: %w", err)
	}

	// Upload to R2
	body := buf.Bytes()
	contentType := "application/vnd.apache.parquet"
	_, err = r2.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &bucket,
		Key:         &key,
		Body:        bytes.NewReader(body),
		ContentType: &contentType,
		Metadata: map[string]string{
			"rows": fmt.Sprintf("%d", len(rows)),
			"date": yesterday.Format("2006-01-02"),
		},
	})
	if err != nil {
		return fmt.Errorf("upload to R2: %w", err)
	}

	// Free rows memory
	rows = nil
	_ = rows

	elapsed := time.Since(startTime)
	sizeMB := float64(len(body)) / 1024 / 1024
	log.Printf("[archive] Archived %d positions (%.2f MB) to %s in %s", offset, sizeMB, key, elapsed)
	return nil
}
