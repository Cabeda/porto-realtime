package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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

// runArchivePositions reads yesterday's R2 snapshot files and writes a single
// Parquet archive to positions/YYYY/MM/DD.parquet. No database access needed.
func runArchivePositions(ctx context.Context, r2 *s3.Client, bucket string) error {
	startTime := time.Now()

	now := time.Now().UTC()
	yesterday := time.Date(now.Year(), now.Month(), now.Day()-1, 0, 0, 0, 0, time.UTC)
	dateStr := yesterday.Format("2006-01-02")

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

	// List snapshot files for yesterday from R2
	keys, err := listSnapshotKeys(ctx, r2, bucket, dateStr)
	if err != nil {
		return fmt.Errorf("list snapshots: %w", err)
	}
	if len(keys) == 0 {
		log.Printf("[archive] No snapshots for %s", dateStr)
		return nil
	}
	log.Printf("[archive] Reading %d snapshot files for %s", len(keys), dateStr)

	// Read all snapshots and convert to Parquet rows
	var rows []ParquetPosition
	for _, snapKey := range keys {
		out, err := r2.GetObject(ctx, &s3.GetObjectInput{Bucket: &bucket, Key: &snapKey})
		if err != nil {
			log.Printf("[archive] WARNING: failed to fetch %s: %v", snapKey, err)
			continue
		}
		body, err := io.ReadAll(out.Body)
		out.Body.Close()
		if err != nil {
			log.Printf("[archive] WARNING: failed to read %s: %v", snapKey, err)
			continue
		}
		var snap SnapshotFile
		if err := json.Unmarshal(body, &snap); err != nil {
			log.Printf("[archive] WARNING: failed to parse %s: %v", snapKey, err)
			continue
		}
		for _, p := range snap.Positions {
			row := ParquetPosition{
				RecordedAt: snap.RecordedAt,
				VehicleID:  p.VehicleID,
				VehicleNum: p.VehicleNum,
				Route:      p.Route,
				TripID:     p.TripID,
				Lat:        p.Lat,
				Lon:        p.Lon,
			}
			if p.DirectionID != nil {
				row.DirectionID = int32(*p.DirectionID)
			} else {
				row.DirectionID = -1
			}
			if p.Speed != nil {
				row.Speed = float32(*p.Speed)
			} else {
				row.Speed = -1
			}
			// Heading not available in snapshots
			row.Heading = -1
			rows = append(rows, row)
		}
	}

	if len(rows) == 0 {
		log.Printf("[archive] No positions in snapshots for %s", dateStr)
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
			"date": dateStr,
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
	log.Printf("[archive] Archived %d positions (%.2f MB) to %s in %s",
		len(body), sizeMB, key, elapsed)
	return nil
}

// listSnapshotKeysForCleanup returns snapshot object keys older than the cutoff.
// It lists all snapshots/ prefixed objects and filters by date directory.
func listSnapshotKeysForCleanup(ctx context.Context, r2 *s3.Client, bucket string, beforeDate time.Time) ([]string, error) {
	prefix := "snapshots/"
	var keys []string
	var continuationToken *string

	for {
		out, err := r2.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            &bucket,
			Prefix:            &prefix,
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return nil, fmt.Errorf("list R2 objects: %w", err)
		}
		for _, obj := range out.Contents {
			if obj.Key == nil {
				continue
			}
			k := *obj.Key
			// Skip today.json
			if k == "snapshots/today.json" {
				continue
			}
			// Keys look like snapshots/YYYY/MM/DD/HHMMSS.json
			// Extract date from path
			parts := strings.Split(strings.TrimPrefix(k, "snapshots/"), "/")
			if len(parts) < 3 {
				continue
			}
			dateStr := parts[0] + "-" + parts[1] + "-" + parts[2]
			t, err := time.Parse("2006-01-02", dateStr)
			if err != nil {
				continue
			}
			if t.Before(beforeDate) {
				keys = append(keys, k)
			}
		}
		if out.IsTruncated == nil || !*out.IsTruncated {
			break
		}
		continuationToken = out.NextContinuationToken
	}
	return keys, nil
}
