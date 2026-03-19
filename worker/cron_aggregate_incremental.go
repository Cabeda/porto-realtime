package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgxpool"
)

const snapshotBatchSize = 500

func runAggregateDailyIncremental(ctx context.Context, pool *pgxpool.Pool, r2 *s3.Client, bucket string, overrideDate time.Time) error {
	startTime := time.Now()

	now := time.Now().UTC()
	var yesterday, today time.Time
	var dateStr string

	if !overrideDate.IsZero() {
		yesterday = time.Date(overrideDate.Year(), overrideDate.Month(), overrideDate.Day(), 0, 0, 0, 0, time.UTC)
		today = yesterday.AddDate(0, 0, 1)
		dateStr = yesterday.Format("2006-01-02")
	} else {
		yesterday = time.Date(now.Year(), now.Month(), now.Day()-1, 0, 0, 0, 0, time.UTC)
		today = yesterday.AddDate(0, 0, 1)
		dateStr = yesterday.Format("2006-01-02")
	}

	log.Printf("[aggregate] Starting incremental aggregation for %s", dateStr)

	// Create temporary staging table for positions
	_, err := pool.Exec(ctx, `
		CREATE UNLOGGED TABLE IF NOT EXISTS "PositionStagingTemp" (
			id BIGSERIAL PRIMARY KEY,
			"recordedAt" TIMESTAMPTZ NOT NULL,
			"vehicleId" TEXT NOT NULL,
			"vehicleNum" TEXT,
			route TEXT NOT NULL,
			"directionId" SMALLINT,
			lat DOUBLE PRECISION NOT NULL,
			lon DOUBLE PRECISION NOT NULL,
			speed REAL,
			"tripId" TEXT
		)
	`)
	if err != nil {
		return fmt.Errorf("create staging table: %w", err)
	}
	defer pool.Exec(ctx, `DROP TABLE IF EXISTS "PositionStagingTemp"`)

	// Clear staging table
	_, err = pool.Exec(ctx, `TRUNCATE TABLE "PositionStagingTemp"`)
	if err != nil {
		return fmt.Errorf("truncate staging: %w", err)
	}

	// List snapshot files
	keys, err := listSnapshotKeys(ctx, r2, bucket, dateStr)
	if err != nil {
		return fmt.Errorf("list snapshots: %w", err)
	}
	if len(keys) == 0 {
		log.Printf("[aggregate] No snapshots found for %s", dateStr)
		return nil
	}
	log.Printf("[aggregate] Found %d snapshot files", len(keys))

	// Pre-load segments
	segRows, err := pool.Query(ctx, `SELECT id, route, "directionId", "segmentIndex", "startLat", "startLon", "endLat", "endLon", "midLat", "midLon", "lengthM", geometry FROM "RouteSegment"`)
	if err != nil {
		return fmt.Errorf("load segments: %w", err)
	}
	var segDefs []SegmentDef
	for segRows.Next() {
		var s SegmentDef
		var geomJSON []byte
		err := segRows.Scan(&s.ID, &s.Route, &s.DirectionID, &s.SegmentIndex,
			&s.StartLat, &s.StartLon, &s.EndLat, &s.EndLon,
			&s.MidLat, &s.MidLon, &s.LengthM, &geomJSON)
		if err != nil {
			segRows.Close()
			return fmt.Errorf("scan segment: %w", err)
		}
		json.Unmarshal(geomJSON, &s.Geometry)
		segDefs = append(segDefs, s)
	}
	segRows.Close()

	// Pre-load route stops
	type routeStop struct {
		Route       string
		DirectionID int
		StopSeq     int
		StopID      string
		StopName    *string
		Lat         float64
		Lon         float64
	}
	stopsByRoute := make(map[string][]routeStop)
	rsRows, err := pool.Query(ctx, `SELECT route, "directionId", "stopSequence", "stopId", "stopName", lat, lon FROM "RouteStop"`)
	if err != nil {
		return fmt.Errorf("load route stops: %w", err)
	}
	for rsRows.Next() {
		var rs routeStop
		if err := rsRows.Scan(&rs.Route, &rs.DirectionID, &rs.StopSeq, &rs.StopID, &rs.StopName, &rs.Lat, &rs.Lon); err != nil {
			rsRows.Close()
			return fmt.Errorf("scan route stop: %w", err)
		}
		stopsByRoute[rs.Route] = append(stopsByRoute[rs.Route], rs)
	}
	rsRows.Close()

	// Process snapshots in batches
	var totalPositions int64
	hourlySegmentSpeeds := make(map[string][]float64)
	stopArrivals := make(map[string][]int64)
	lastSeenAt := make(map[string]int64)

	batchNum := 0
	for batchStart := 0; batchStart < len(keys); batchStart += snapshotBatchSize {
		batchEnd := batchStart + snapshotBatchSize
		if batchEnd > len(keys) {
			batchEnd = len(keys)
		}
		batchNum++

		// Process each snapshot in this batch
		var batchPositions []PositionPoint
		for _, key := range keys[batchStart:batchEnd] {
			out, err := r2.GetObject(ctx, &s3.GetObjectInput{Bucket: &bucket, Key: &key})
			if err != nil {
				log.Printf("[aggregate] WARNING: failed to fetch %s: %v", key, err)
				continue
			}
			body, err := io.ReadAll(out.Body)
			out.Body.Close()
			if err != nil {
				log.Printf("[aggregate] WARNING: failed to read %s: %v", key, err)
				continue
			}

			var snap SnapshotFile
			if err := json.Unmarshal(body, &snap); err != nil {
				log.Printf("[aggregate] WARNING: failed to parse %s: %v", key, err)
				continue
			}

			recordedAt, err := time.Parse(time.RFC3339, snap.RecordedAt)
			if err != nil {
				continue
			}

			for _, p := range snap.Positions {
				if p.Route == "" {
					continue
				}
				pp := PositionPoint{
					RecordedAt: recordedAt,
					VehicleID:  p.VehicleID,
					Route:      p.Route,
					Lat:        p.Lat,
					Lon:        p.Lon,
					Speed:      p.Speed,
				}
				if p.VehicleNum != "" {
					pp.VehicleNum = &p.VehicleNum
				}
				if p.TripID != "" {
					pp.TripID = &p.TripID
				}
				pp.DirectionID = p.DirectionID

				batchPositions = append(batchPositions, pp)

				// Segment speeds (keep in memory - small)
				if pp.Speed != nil && *pp.Speed > 0 && len(segDefs) > 0 {
					segID := snapToSegment(pp.Lat, pp.Lon, pp.Route, pp.DirectionID, segDefs, 150)
					if segID != "" {
						hour := time.Date(pp.RecordedAt.Year(), pp.RecordedAt.Month(), pp.RecordedAt.Day(), pp.RecordedAt.Hour(), 0, 0, 0, time.UTC)
						key := segID + ":" + hour.Format(time.RFC3339)
						hourlySegmentSpeeds[key] = append(hourlySegmentSpeeds[key], float64(*pp.Speed))
					}
				}

				// Stop arrivals (keep in memory - small)
				stopsForRoute := stopsByRoute[pp.Route]
				if len(stopsForRoute) > 0 {
					var bestStop *routeStop
					bestDist := math.Inf(1)
					for i := range stopsForRoute {
						rs := &stopsForRoute[i]
						if pp.DirectionID != nil && rs.DirectionID != int(*pp.DirectionID) {
							continue
						}
						dist := haversineM(pp.Lat, pp.Lon, rs.Lat, rs.Lon)
						if dist < bestDist && dist <= 80 {
							bestDist = dist
							bestStop = rs
						}
					}
					if bestStop != nil {
						dirStr := "x"
						if pp.DirectionID != nil {
							dirStr = fmt.Sprintf("%d", *pp.DirectionID)
						}
						stopKey := pp.Route + ":" + dirStr + ":" + bestStop.StopID
						dedupeKey := pp.VehicleID + ":" + stopKey
						ts := pp.RecordedAt.UnixMilli()
						last, exists := lastSeenAt[dedupeKey]
						if !exists || ts-last >= 3*60*1000 {
							lastSeenAt[dedupeKey] = ts
							stopArrivals[stopKey] = append(stopArrivals[stopKey], ts)
						}
					}
				}

				totalPositions++
			}

			// Free memory immediately
			body = nil
			snap.Positions = nil
		}

		// Write batch positions to staging table
		if len(batchPositions) > 0 {
			for i := 0; i < len(batchPositions); i += 1000 {
				end := i + 1000
				if end > len(batchPositions) {
					end = len(batchPositions)
				}
				chunk := batchPositions[i:end]

				query := `INSERT INTO "PositionStagingTemp" ("recordedAt", "vehicleId", "vehicleNum", route, "directionId", lat, lon, speed, "tripId") VALUES `
				var args []interface{}
				var placeholders []string
				for j, p := range chunk {
					base := j * 9
					placeholders = append(placeholders, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
						base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9))
					args = append(args, p.RecordedAt, p.VehicleID, p.VehicleNum, p.Route, p.DirectionID, p.Lat, p.Lon, p.Speed, p.TripID)
				}
				query += strings.Join(placeholders, ",")
				if _, err := pool.Exec(ctx, query, args...); err != nil {
					return fmt.Errorf("insert positions batch: %w", err)
				}
			}
		}

		log.Printf("[aggregate] Batch %d/%d: %d positions loaded", batchNum, (len(keys)+snapshotBatchSize-1)/snapshotBatchSize, len(batchPositions))

		// Clear batch positions to free memory
		batchPositions = nil
	}

	log.Printf("[aggregate] Processed %d positions from %d files in %d batches", totalPositions, len(keys), batchNum)

	// Trip reconstruction from staging table (stream by vehicle)
	log.Printf("[aggregate] Reconstructing trips from staging table...")

	// Get all unique vehicles
	vehicleRows, err := pool.Query(ctx, `SELECT DISTINCT "vehicleId" FROM "PositionStagingTemp" ORDER BY "vehicleId"`)
	if err != nil {
		return fmt.Errorf("get vehicles: %w", err)
	}
	var vehicles []string
	for vehicleRows.Next() {
		var v string
		if err := vehicleRows.Scan(&v); err != nil {
			vehicleRows.Close()
			return fmt.Errorf("scan vehicle: %w", err)
		}
		vehicles = append(vehicles, v)
	}
	vehicleRows.Close()

	var allTrips []ReconstructedTrip
	processedVehicles := 0

	// Process vehicles in batches of 50 to avoid loading all at once
	for batchStart := 0; batchStart < len(vehicles); batchStart += 50 {
		batchEnd := batchStart + 50
		if batchEnd > len(vehicles) {
			batchEnd = len(vehicles)
		}

		for _, vehicleID := range vehicles[batchStart:batchEnd] {
			// Stream positions for this vehicle from staging table
			posRows, err := pool.Query(ctx, `
				SELECT "recordedAt", "vehicleId", "vehicleNum", route, "directionId", lat, lon, speed, "tripId"
				FROM "PositionStagingTemp"
				WHERE "vehicleId" = $1
				ORDER BY "recordedAt"
			`, vehicleID)
			if err != nil {
				return fmt.Errorf("get positions for vehicle %s: %w", vehicleID, err)
			}

			var positions []PositionPoint
			for posRows.Next() {
				var p PositionPoint
				if err := posRows.Scan(&p.RecordedAt, &p.VehicleID, &p.VehicleNum, &p.Route, &p.DirectionID, &p.Lat, &p.Lon, &p.Speed, &p.TripID); err != nil {
					posRows.Close()
					return fmt.Errorf("scan position: %w", err)
				}
				positions = append(positions, p)
			}
			posRows.Close()

			// Group by route+direction and reconstruct trips
			byRouteDir := make(map[string][]PositionPoint)
			for _, p := range positions {
				r := p.Route
				dirStr := "x"
				if p.DirectionID != nil {
					dirStr = fmt.Sprintf("%d", *p.DirectionID)
				}
				key := p.VehicleID + ":" + r + ":" + dirStr
				byRouteDir[key] = append(byRouteDir[key], p)
			}

			for _, groupPositions := range byRouteDir {
				allTrips = append(allTrips, reconstructTrips(groupPositions, 10)...)
			}

			processedVehicles++
			if processedVehicles%100 == 0 {
				log.Printf("[aggregate] Reconstructed trips for %d/%d vehicles", processedVehicles, len(vehicles))
			}

			// Free memory for this vehicle
			positions = nil
		}
	}

	log.Printf("[aggregate] Reconstructed %d trips from %d vehicles", len(allTrips), len(vehicles))

	// Store trip logs
	if len(allTrips) > 0 {
		_, err := pool.Exec(ctx, `DELETE FROM "TripLog" WHERE date = $1`, yesterday)
		if err != nil {
			return fmt.Errorf("delete old trips: %w", err)
		}
		for i := 0; i < len(allTrips); i += 500 {
			end := i + 500
			if end > len(allTrips) {
				end = len(allTrips)
			}
			batch := allTrips[i:end]
			query := `INSERT INTO "TripLog" (date, "vehicleId", "vehicleNum", route, "tripId", "directionId", "startedAt", "endedAt", "runtimeSecs", positions, "avgSpeed") VALUES `
			var args []interface{}
			var placeholders []string
			for j, t := range batch {
				base := j * 11
				placeholders = append(placeholders, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
					base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10, base+11))
				var avgSpeed *float64
				if t.AvgSpeed > 0 {
					v := t.AvgSpeed
					avgSpeed = &v
				}
				args = append(args, yesterday, t.VehicleID, t.VehicleNum, t.Route, t.TripID, t.DirectionID, t.StartedAt, t.EndedAt, t.RuntimeSecs, t.Positions, avgSpeed)
			}
			query += strings.Join(placeholders, ",")
			if _, err := pool.Exec(ctx, query, args...); err != nil {
				return fmt.Errorf("insert trips: %w", err)
			}
		}
	}

	// Segment speed aggregation (from memory - small)
	if len(segDefs) > 0 && len(hourlySegmentSpeeds) > 0 {
		_, err := pool.Exec(ctx,
			`DELETE FROM "SegmentSpeedHourly" WHERE "hourStart" >= $1 AND "hourStart" < $2`,
			yesterday, today)
		if err != nil {
			return fmt.Errorf("delete old segment speeds: %w", err)
		}
		segByID := make(map[string]*SegmentDef, len(segDefs))
		for i := range segDefs {
			segByID[segDefs[i].ID] = &segDefs[i]
		}
		type segSpeedRow struct {
			segmentID   string
			route       string
			directionID int
			hourStart   time.Time
			avgSpeed    float64
			medianSpeed float64
			p10Speed    float64
			p90Speed    float64
			sampleCount int
		}
		var segSpeedRows []segSpeedRow
		for key, speeds := range hourlySegmentSpeeds {
			if len(speeds) < 2 {
				continue
			}
			var segID, hourISO string
			for i := len(key) - 1; i >= 0; i-- {
				if key[i] == ':' {
					candidate := key[:i]
					if _, ok := segByID[candidate]; ok {
						segID = candidate
						hourISO = key[i+1:]
						break
					}
				}
			}
			if segID == "" {
				continue
			}
			seg := segByID[segID]
			hourStart, err := time.Parse(time.RFC3339, hourISO)
			if err != nil {
				continue
			}
			avg := 0.0
			for _, s := range speeds {
				avg += s
			}
			avg /= float64(len(speeds))
			segSpeedRows = append(segSpeedRows, segSpeedRow{
				segmentID:   segID,
				route:       seg.Route,
				directionID: seg.DirectionID,
				hourStart:   hourStart,
				avgSpeed:    math.Round(avg*10) / 10,
				medianSpeed: math.Round(percentile(speeds, 50)*10) / 10,
				p10Speed:    math.Round(percentile(speeds, 10)*10) / 10,
				p90Speed:    math.Round(percentile(speeds, 90)*10) / 10,
				sampleCount: len(speeds),
			})
		}
		hourlySegmentSpeeds = nil
		for i := 0; i < len(segSpeedRows); i += 500 {
			end := i + 500
			if end > len(segSpeedRows) {
				end = len(segSpeedRows)
			}
			batch := segSpeedRows[i:end]
			query := `INSERT INTO "SegmentSpeedHourly" ("segmentId", route, "directionId", "hourStart", "avgSpeed", "medianSpeed", "p10Speed", "p90Speed", "sampleCount") VALUES `
			var args []interface{}
			var placeholders []string
			for j, r := range batch {
				base := j * 9
				placeholders = append(placeholders, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
					base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9))
				args = append(args, r.segmentID, r.route, r.directionID, r.hourStart, r.avgSpeed, r.medianSpeed, r.p10Speed, r.p90Speed, r.sampleCount)
			}
			query += strings.Join(placeholders, ",")
			if _, err := pool.Exec(ctx, query, args...); err != nil {
				return fmt.Errorf("insert segment speeds: %w", err)
			}
		}
		log.Printf("[aggregate] Computed %d segment speed aggregates", len(segSpeedRows))
	}

	// Route performance daily
	routeTrips := make(map[string][]ReconstructedTrip)
	for _, trip := range allTrips {
		dirStr := "x"
		if trip.DirectionID != nil {
			dirStr = fmt.Sprintf("%d", *trip.DirectionID)
		}
		key := trip.Route + ":" + dirStr
		routeTrips[key] = append(routeTrips[key], trip)
	}
	_, err = pool.Exec(ctx, `DELETE FROM "RoutePerformanceDaily" WHERE date = $1`, yesterday)
	if err != nil {
		return fmt.Errorf("delete old route perf: %w", err)
	}
	type routePerfRow struct {
		route               string
		directionID         *int16
		tripsObserved       int
		avgHeadwaySecs      *float64
		headwayAdherencePct *float64
		excessWaitTimeSecs  *float64
		avgRuntimeSecs      *int
		avgCommercialSpeed  *float64
		bunchingPct         *float64
		gappingPct          *float64
	}
	var routePerfRows []routePerfRow
	for key, trips := range routeTrips {
		parts := strings.SplitN(key, ":", 2)
		route := parts[0]
		var directionID *int16
		if parts[1] != "x" {
			var d int16
			fmt.Sscanf(parts[1], "%d", &d)
			directionID = &d
		}
		startTimes := make([]int64, len(trips))
		for i, t := range trips {
			startTimes[i] = t.StartedAt.UnixMilli()
		}
		sort.Slice(startTimes, func(i, j int) bool { return startTimes[i] < startTimes[j] })
		headwayMetrics := computeHeadwayMetrics(startTimes, nil)
		var runtimes []float64
		for _, t := range trips {
			if t.RuntimeSecs > 60 {
				runtimes = append(runtimes, float64(t.RuntimeSecs))
			}
		}
		var avgRuntime *int
		if len(runtimes) > 0 {
			sum := 0.0
			for _, r := range runtimes {
				sum += r
			}
			v := int(math.Round(sum / float64(len(runtimes))))
			avgRuntime = &v
		}
		var speeds []float64
		for _, t := range trips {
			if t.AvgSpeed > 0 {
				speeds = append(speeds, t.AvgSpeed)
			}
		}
		var avgCommercialSpeed *float64
		if len(speeds) > 0 {
			sum := 0.0
			for _, s := range speeds {
				sum += s
			}
			v := math.Round(sum/float64(len(speeds))*10) / 10
			avgCommercialSpeed = &v
		}
		rp := routePerfRow{
			route:              route,
			directionID:        directionID,
			tripsObserved:      len(trips),
			avgRuntimeSecs:     avgRuntime,
			avgCommercialSpeed: avgCommercialSpeed,
		}
		if headwayMetrics != nil {
			ahs := float64(headwayMetrics.AvgHeadwaySecs)
			rp.avgHeadwaySecs = &ahs
			rp.headwayAdherencePct = &headwayMetrics.HeadwayAdherencePct
			ewt := float64(headwayMetrics.ExcessWaitTimeSecs)
			rp.excessWaitTimeSecs = &ewt
			rp.bunchingPct = &headwayMetrics.BunchingPct
			rp.gappingPct = &headwayMetrics.GappingPct
		}
		routePerfRows = append(routePerfRows, rp)
	}
	if len(routePerfRows) > 0 {
		for i := 0; i < len(routePerfRows); i += 500 {
			end := i + 500
			if end > len(routePerfRows) {
				end = len(routePerfRows)
			}
			batch := routePerfRows[i:end]
			query := `INSERT INTO "RoutePerformanceDaily" (date, route, "directionId", "tripsObserved", "avgHeadwaySecs", "headwayAdherencePct", "excessWaitTimeSecs", "avgRuntimeSecs", "avgCommercialSpeed", "bunchingPct", "gappingPct") VALUES `
			var args []interface{}
			var placeholders []string
			for j, r := range batch {
				base := j * 11
				placeholders = append(placeholders, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
					base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10, base+11))
				args = append(args, yesterday, r.route, r.directionID, r.tripsObserved, r.avgHeadwaySecs, r.headwayAdherencePct, r.excessWaitTimeSecs, r.avgRuntimeSecs, r.avgCommercialSpeed, r.bunchingPct, r.gappingPct)
			}
			query += strings.Join(placeholders, ",")
			if _, err := pool.Exec(ctx, query, args...); err != nil {
				return fmt.Errorf("insert route perf: %w", err)
			}
		}
	}
	log.Printf("[aggregate] Computed performance for %d route-directions", len(routePerfRows))

	// Stop headway irregularity (from memory - small)
	if len(stopArrivals) > 0 {
		_, err := pool.Exec(ctx, `DELETE FROM "StopHeadwayDaily" WHERE date = $1`, yesterday)
		if err != nil {
			return fmt.Errorf("delete old stop headway: %w", err)
		}
		type headwayRow struct {
			route          string
			directionID    *int16
			stopID         string
			stopName       *string
			stopSequence   int
			avgHeadwaySecs int
			headwayStdDev  float64
			observations   int
		}
		var headwayRows []headwayRow
		for stopKey, arrivals := range stopArrivals {
			if len(arrivals) < 3 {
				continue
			}
			sort.Slice(arrivals, func(i, j int) bool { return arrivals[i] < arrivals[j] })
			headways := make([]float64, 0, len(arrivals)-1)
			for i := 1; i < len(arrivals); i++ {
				headways = append(headways, float64(arrivals[i]-arrivals[i-1])/1000.0)
			}
			avg := 0.0
			for _, h := range headways {
				avg += h
			}
			avg /= float64(len(headways))
			variance := 0.0
			for _, h := range headways {
				variance += (h - avg) * (h - avg)
			}
			variance /= float64(len(headways))
			stdDev := math.Sqrt(variance)
			firstColon := strings.Index(stopKey, ":")
			secondColon := strings.Index(stopKey[firstColon+1:], ":") + firstColon + 1
			route := stopKey[:firstColon]
			dirStr := stopKey[firstColon+1 : secondColon]
			stopID := stopKey[secondColon+1:]
			var directionID *int16
			if dirStr != "x" {
				var d int16
				fmt.Sscanf(dirStr, "%d", &d)
				directionID = &d
			}
			var stopName *string
			stopSeq := 0
			stopsForRoute := stopsByRoute[route]
			for _, rs := range stopsForRoute {
				if rs.StopID == stopID && (directionID == nil || rs.DirectionID == int(*directionID)) {
					stopName = rs.StopName
					stopSeq = rs.StopSeq
					break
				}
			}
			headwayRows = append(headwayRows, headwayRow{
				route:          route,
				directionID:    directionID,
				stopID:         stopID,
				stopName:       stopName,
				stopSequence:   stopSeq,
				avgHeadwaySecs: int(math.Round(avg)),
				headwayStdDev:  math.Round(stdDev*10) / 10,
				observations:   len(arrivals),
			})
		}
		for i := 0; i < len(headwayRows); i += 500 {
			end := i + 500
			if end > len(headwayRows) {
				end = len(headwayRows)
			}
			batch := headwayRows[i:end]
			query := `INSERT INTO "StopHeadwayDaily" (date, route, "directionId", "stopId", "stopName", "stopSequence", "avgHeadwaySecs", "headwayStdDev", observations) VALUES `
			var args []interface{}
			var placeholders []string
			for j, r := range batch {
				base := j * 9
				placeholders = append(placeholders, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
					base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9))
				args = append(args, yesterday, r.route, r.directionID, r.stopID, r.stopName, r.stopSequence, r.avgHeadwaySecs, r.headwayStdDev, r.observations)
			}
			query += strings.Join(placeholders, ",")
			if _, err := pool.Exec(ctx, query, args...); err != nil {
				return fmt.Errorf("insert stop headway: %w", err)
			}
		}
		log.Printf("[aggregate] Computed headway irregularity for %d stops", len(headwayRows))
	}

	// Network summary
	uniqueVehicles := make(map[string]struct{})
	for _, t := range allTrips {
		uniqueVehicles[t.VehicleID] = struct{}{}
	}
	var allSpeeds []float64
	var allEwt []float64
	for _, r := range routePerfRows {
		if r.avgCommercialSpeed != nil {
			allSpeeds = append(allSpeeds, *r.avgCommercialSpeed)
		}
		if r.excessWaitTimeSecs != nil {
			allEwt = append(allEwt, *r.excessWaitTimeSecs)
		}
	}
	var networkAvgSpeed, networkAvgEwt *float64
	if len(allSpeeds) > 0 {
		sum := 0.0
		for _, s := range allSpeeds {
			sum += s
		}
		v := math.Round(sum/float64(len(allSpeeds))*10) / 10
		networkAvgSpeed = &v
	}
	if len(allEwt) > 0 {
		sum := 0.0
		for _, e := range allEwt {
			sum += e
		}
		v := math.Round(sum / float64(len(allEwt)))
		networkAvgEwt = &v
	}
	var worstRoute *string
	var worstEwt *float64
	for _, r := range routePerfRows {
		if r.excessWaitTimeSecs != nil && (worstEwt == nil || *r.excessWaitTimeSecs > *worstEwt) {
			worstEwt = r.excessWaitTimeSecs
			worstRoute = &r.route
		}
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO "NetworkSummaryDaily" (date, "activeVehicles", "totalTrips", "avgCommercialSpeed", "avgExcessWaitTime", "worstRoute", "worstRouteEwt", "positionsCollected")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (date) DO UPDATE SET
			"activeVehicles" = EXCLUDED."activeVehicles",
			"totalTrips" = EXCLUDED."totalTrips",
			"avgCommercialSpeed" = EXCLUDED."avgCommercialSpeed",
			"avgExcessWaitTime" = EXCLUDED."avgExcessWaitTime",
			"worstRoute" = EXCLUDED."worstRoute",
			"worstRouteEwt" = EXCLUDED."worstRouteEwt",
			"positionsCollected" = EXCLUDED."positionsCollected"
	`, yesterday, len(uniqueVehicles), len(allTrips), networkAvgSpeed, networkAvgEwt, worstRoute, worstEwt, totalPositions)
	if err != nil {
		return fmt.Errorf("upsert network summary: %w", err)
	}

	elapsed := time.Since(startTime)
	log.Printf("[aggregate] Complete for %s: %d positions, %d trips in %s", dateStr, totalPositions, len(allTrips), elapsed)
	return nil
}
