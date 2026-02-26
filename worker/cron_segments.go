package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	polyline "github.com/twpayne/go-polyline"
)

const otpURL = "https://otp.portodigital.pt/otp/routers/default/index/graphql"

func fetchWithRetry(ctx context.Context, url string, body []byte, maxRetries int, timeoutMs int) ([]byte, error) {
	client := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond}

	for attempt := 0; attempt < maxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://explore.porto.pt")

		resp, err := client.Do(req)
		if err != nil {
			if attempt == maxRetries-1 {
				return nil, err
			}
			backoff := time.Duration(math.Min(float64(1000*int(math.Pow(2, float64(attempt)))), 10000)) * time.Millisecond
			time.Sleep(backoff)
			continue
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return respBody, err
		}

		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			return nil, fmt.Errorf("API returned %d", resp.StatusCode)
		}

		if attempt < maxRetries-1 {
			backoff := time.Duration(math.Min(float64(1000*int(math.Pow(2, float64(attempt)))), 10000)) * time.Millisecond
			time.Sleep(backoff)
			continue
		}
		return nil, fmt.Errorf("API returned %d after %d attempts", resp.StatusCode, maxRetries)
	}
	return nil, fmt.Errorf("max retries exceeded")
}

func runRefreshSegments(ctx context.Context, pool *pgxpool.Pool) error {
	startTime := time.Now()
	log.Println("[segments] Refreshing route segments from OTP...")

	query := `query {
		routes {
			shortName
			patterns {
				directionId
				patternGeometry { points }
				stops { gtfsId name lat lon }
			}
		}
	}`

	reqBody, _ := json.Marshal(map[string]string{"query": query})
	respBody, err := fetchWithRetry(ctx, otpURL, reqBody, 3, 30000)
	if err != nil {
		return fmt.Errorf("fetch OTP routes: %w", err)
	}

	var raw struct {
		Data struct {
			Routes []struct {
				ShortName string `json:"shortName"`
				Patterns  []struct {
					DirectionID     int `json:"directionId"`
					PatternGeometry *struct {
						Points string `json:"points"`
					} `json:"patternGeometry"`
					Stops []struct {
						GtfsID string  `json:"gtfsId"`
						Name   string  `json:"name"`
						Lat    float64 `json:"lat"`
						Lon    float64 `json:"lon"`
					} `json:"stops"`
				} `json:"patterns"`
			} `json:"routes"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &raw); err != nil {
		return fmt.Errorf("parse OTP response: %w", err)
	}

	routes := raw.Data.Routes
	if len(routes) == 0 {
		return fmt.Errorf("invalid OTP response: no routes")
	}

	totalSegments := 0

	for _, route := range routes {
		if route.ShortName == "" {
			continue
		}

		for _, pattern := range route.Patterns {
			if pattern.PatternGeometry == nil || pattern.PatternGeometry.Points == "" {
				continue
			}

			// Decode polyline
			coords, _, err := polyline.DecodeCoords([]byte(pattern.PatternGeometry.Points))
			if err != nil {
				log.Printf("[segments] Failed to decode polyline for %s:%d: %v", route.ShortName, pattern.DirectionID, err)
				continue
			}

			// Convert from [lat, lon] to [lon, lat] for our segment functions
			lonLatCoords := make([][2]float64, len(coords))
			for i, c := range coords {
				lonLatCoords[i] = [2]float64{c[1], c[0]}
			}

			segments := splitIntoSegments(route.ShortName, pattern.DirectionID, lonLatCoords, 200)

			for _, seg := range segments {
				geomJSON, _ := json.Marshal(seg.Geometry)

				_, err := pool.Exec(ctx, `
					INSERT INTO "RouteSegment" (id, route, "directionId", "segmentIndex", "startLat", "startLon", "endLat", "endLon", "midLat", "midLon", "lengthM", geometry)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
					ON CONFLICT (id) DO UPDATE SET
						"startLat" = EXCLUDED."startLat", "startLon" = EXCLUDED."startLon",
						"endLat" = EXCLUDED."endLat", "endLon" = EXCLUDED."endLon",
						"midLat" = EXCLUDED."midLat", "midLon" = EXCLUDED."midLon",
						"lengthM" = EXCLUDED."lengthM", geometry = EXCLUDED.geometry
				`, seg.ID, seg.Route, seg.DirectionID, seg.SegmentIndex,
					seg.StartLat, seg.StartLon, seg.EndLat, seg.EndLon,
					seg.MidLat, seg.MidLon, seg.LengthM, string(geomJSON))
				if err != nil {
					log.Printf("[segments] Failed to upsert segment %s: %v", seg.ID, err)
					continue
				}
			}

			totalSegments += len(segments)

			// Upsert RouteStop records
			for seq, stop := range pattern.Stops {
				if stop.GtfsID == "" {
					continue
				}
				stopID := fmt.Sprintf("%s:%d:%d", route.ShortName, pattern.DirectionID, seq)
				var stopName *string
				if stop.Name != "" {
					stopName = &stop.Name
				}

				_, err := pool.Exec(ctx, `
					INSERT INTO "RouteStop" (id, route, "directionId", "stopSequence", "stopId", "stopName", lat, lon)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					ON CONFLICT (id) DO UPDATE SET
						"stopId" = EXCLUDED."stopId", "stopName" = EXCLUDED."stopName",
						lat = EXCLUDED.lat, lon = EXCLUDED.lon
				`, stopID, route.ShortName, pattern.DirectionID, seq, stop.GtfsID, stopName, stop.Lat, stop.Lon)
				if err != nil {
					log.Printf("[segments] Failed to upsert stop %s: %v", stopID, err)
				}
			}
		}
	}

	elapsed := time.Since(startTime)
	log.Printf("[segments] Refreshed %d segments from %d routes in %s", totalSegments, len(routes), elapsed)
	return nil
}
