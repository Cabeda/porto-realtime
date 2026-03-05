package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OTP GraphQL response types for timetable snapshot
type otpSnapshotResponse struct {
	Data struct {
		Routes []otpSnapshotRoute `json:"routes"`
	} `json:"data"`
}

type otpSnapshotRoute struct {
	GtfsID    string               `json:"gtfsId"`
	ShortName string               `json:"shortName"`
	Patterns  []otpSnapshotPattern `json:"patterns"`
}

type otpSnapshotPattern struct {
	ID          string            `json:"id"`
	DirectionID int               `json:"directionId"`
	Trips       []otpSnapshotTrip `json:"trips"`
}

type otpSnapshotTrip struct {
	GtfsID      string  `json:"gtfsId"`
	ActiveDates []int64 `json:"activeDates"`
}

// runSnapshotSchedule queries OTP for today's scheduled trips and stores them in ScheduledTripDaily.
// Runs at 01:00 UTC — before Porto service starts in both WET (UTC+0) and WEST (UTC+1).
//
// canceledPct computed from this data is an upper bound: GPS gaps (vehicle with no FIWARE signal)
// are indistinguishable from true cancellations.
func runSnapshotSchedule(ctx context.Context, pool *pgxpool.Pool) error {
	startTime := time.Now()

	// Compute today's local midnight in Porto timezone (Europe/Lisbon)
	loc, err := time.LoadLocation("Europe/Lisbon")
	if err != nil {
		// Fallback to UTC+0 (WET) if tz data unavailable
		log.Printf("[snapshot] WARNING: could not load Europe/Lisbon tz: %v — falling back to UTC", err)
		loc = time.UTC
	}
	localNow := time.Now().In(loc)
	localMidnight := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc)
	targetEpoch := localMidnight.Unix()
	dateStr := localMidnight.Format("2006-01-02")

	log.Printf("[snapshot] Fetching OTP timetable for %s (epoch %d)", dateStr, targetEpoch)

	// Query OTP for all routes with their patterns and trips
	query := `{
		routes {
			gtfsId
			shortName
			patterns {
				id
				directionId
				trips {
					gtfsId
					activeDates
				}
			}
		}
	}`

	reqBody, _ := json.Marshal(map[string]string{"query": query})
	req, err := http.NewRequestWithContext(ctx, "POST", otpURL, bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("build OTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://explore.porto.pt")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("OTP request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read OTP response: %w", err)
	}

	var otpResp otpSnapshotResponse
	if err := json.Unmarshal(body, &otpResp); err != nil {
		return fmt.Errorf("parse OTP response: %w", err)
	}

	if len(otpResp.Data.Routes) == 0 {
		log.Printf("[snapshot] No routes returned from OTP")
		return nil
	}

	// Filter trips active today
	type tripRow struct {
		route       string
		directionID *int16
		tripID      string
	}
	var rows []tripRow

	for _, route := range otpResp.Data.Routes {
		shortName := route.ShortName
		for _, pattern := range route.Patterns {
			var dir int16 = int16(pattern.DirectionID)
			dirPtr := &dir
			for _, trip := range pattern.Trips {
				for _, epoch := range trip.ActiveDates {
					if epoch == targetEpoch {
						rows = append(rows, tripRow{
							route:       shortName,
							directionID: dirPtr,
							tripID:      trip.GtfsID,
						})
						break
					}
				}
			}
		}
	}

	log.Printf("[snapshot] Found %d scheduled trips for %s across %d routes", len(rows), dateStr, len(otpResp.Data.Routes))

	if len(rows) == 0 {
		log.Printf("[snapshot] No active trips found for %s — skipping insert", dateStr)
		return nil
	}

	// Idempotent: delete existing rows for today
	targetDate := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, time.UTC)
	_, err = pool.Exec(ctx, `DELETE FROM "ScheduledTripDaily" WHERE date = $1`, targetDate)
	if err != nil {
		return fmt.Errorf("delete existing snapshot: %w", err)
	}

	// Batch insert
	for i := 0; i < len(rows); i += 500 {
		end := i + 500
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[i:end]

		sqlQuery := `INSERT INTO "ScheduledTripDaily" (date, route, "directionId", "tripId") VALUES `
		var args []interface{}
		var placeholders []string
		for j, r := range batch {
			base := j * 4
			placeholders = append(placeholders, fmt.Sprintf("($%d,$%d,$%d,$%d)", base+1, base+2, base+3, base+4))
			args = append(args, targetDate, r.route, r.directionID, r.tripID)
		}
		sqlQuery += strings.Join(placeholders, ",")
		sqlQuery += ` ON CONFLICT ("date", "tripId") DO NOTHING`

		if _, err := pool.Exec(ctx, sqlQuery, args...); err != nil {
			return fmt.Errorf("insert scheduled trips batch %d: %w", i/500, err)
		}
	}

	elapsed := time.Since(startTime)
	log.Printf("[snapshot] Complete for %s: %d trips stored in %s", dateStr, len(rows), elapsed)
	return nil
}
