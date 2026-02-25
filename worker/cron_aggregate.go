package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const aggregateChunkSize = 5000

func runAggregateDaily(ctx context.Context, pool *pgxpool.Pool) error {
	startTime := time.Now()

	now := time.Now().UTC()
	yesterday := time.Date(now.Year(), now.Month(), now.Day()-1, 0, 0, 0, 0, time.UTC)
	today := yesterday.AddDate(0, 0, 1)
	dateStr := yesterday.Format("2006-01-02")

	log.Printf("[aggregate] Starting for %s", dateStr)

	// Count positions
	var totalCount int64
	err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM "BusPositionLog" WHERE "recordedAt" >= $1 AND "recordedAt" < $2 AND route IS NOT NULL`,
		yesterday, today,
	).Scan(&totalCount)
	if err != nil {
		return fmt.Errorf("count positions: %w", err)
	}

	if totalCount == 0 {
		log.Printf("[aggregate] No positions found for %s", dateStr)
		return nil
	}

	log.Printf("[aggregate] Processing %d positions in chunks of %d", totalCount, aggregateChunkSize)

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

	// Pre-load route stops, indexed by route
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

	// Accumulators
	vehicleGroups := make(map[string][]PositionPoint)
	hourlySegmentSpeeds := make(map[string][]float64)
	stopArrivals := make(map[string][]int64)
	lastSeenAt := make(map[string]int64)

	var totalPositions int64
	var cursorID int64

	// Stream positions in chunks
	for {
		query := `SELECT id, "recordedAt", "vehicleId", "vehicleNum", route, "tripId", "directionId", lat, lon, speed
			FROM "BusPositionLog"
			WHERE "recordedAt" >= $1 AND "recordedAt" < $2 AND route IS NOT NULL AND id > $3
			ORDER BY "recordedAt" ASC, id ASC
			LIMIT $4`

		rows, err := pool.Query(ctx, query, yesterday, today, cursorID, aggregateChunkSize)
		if err != nil {
			return fmt.Errorf("query positions: %w", err)
		}

		chunkCount := 0
		for rows.Next() {
			var id int64
			var recordedAt time.Time
			var vehicleID string
			var vehicleNum, route, tripID *string
			var directionID *int16
			var lat, lon float64
			var speed *float32

			if err := rows.Scan(&id, &recordedAt, &vehicleID, &vehicleNum, &route, &tripID, &directionID, &lat, &lon, &speed); err != nil {
				rows.Close()
				return fmt.Errorf("scan position: %w", err)
			}

			cursorID = id
			chunkCount++
			totalPositions++

			r := *route // route IS NOT NULL guaranteed by WHERE

			// Vehicle grouping
			dirStr := "x"
			if directionID != nil {
				dirStr = fmt.Sprintf("%d", *directionID)
			}
			vKey := vehicleID + ":" + r + ":" + dirStr
			vehicleGroups[vKey] = append(vehicleGroups[vKey], PositionPoint{
				RecordedAt:  recordedAt,
				VehicleID:   vehicleID,
				VehicleNum:  vehicleNum,
				Route:       r,
				TripID:      tripID,
				DirectionID: directionID,
				Lat:         lat,
				Lon:         lon,
				Speed:       speed,
			})

			// Segment speed accumulation
			if speed != nil && *speed > 0 && len(segDefs) > 0 {
				segID := snapToSegment(lat, lon, r, directionID, segDefs, 150)
				if segID != "" {
					hour := time.Date(recordedAt.Year(), recordedAt.Month(), recordedAt.Day(), recordedAt.Hour(), 0, 0, 0, time.UTC)
					key := segID + ":" + hour.Format(time.RFC3339)
					hourlySegmentSpeeds[key] = append(hourlySegmentSpeeds[key], float64(*speed))
				}
			}

			// Stop headway accumulation
			stopsForRoute := stopsByRoute[r]
			if len(stopsForRoute) > 0 {
				var bestStop *routeStop
				bestDist := math.Inf(1)
				for i := range stopsForRoute {
					rs := &stopsForRoute[i]
					if directionID != nil && rs.DirectionID != int(*directionID) {
						continue
					}
					dist := haversineM(lat, lon, rs.Lat, rs.Lon)
					if dist < bestDist && dist <= 80 {
						bestDist = dist
						bestStop = rs
					}
				}
				if bestStop != nil {
					stopKey := r + ":" + dirStr + ":" + bestStop.StopID
					dedupeKey := vehicleID + ":" + stopKey
					ts := recordedAt.UnixMilli()
					last, exists := lastSeenAt[dedupeKey]
					if !exists || ts-last >= 3*60*1000 {
						lastSeenAt[dedupeKey] = ts
						stopArrivals[stopKey] = append(stopArrivals[stopKey], ts)
					}
				}
			}
		}
		rows.Close()

		if chunkCount == 0 {
			break
		}
		if chunkCount < aggregateChunkSize {
			break
		}
		log.Printf("[aggregate] Processed %d/%d positions...", totalPositions, totalCount)
	}

	log.Printf("[aggregate] Streamed %d positions", totalPositions)

	// Free lastSeenAt
	lastSeenAt = nil

	// Trip reconstruction
	var allTrips []ReconstructedTrip
	for _, groupPositions := range vehicleGroups {
		allTrips = append(allTrips, reconstructTrips(groupPositions, 10)...)
	}
	// Free vehicle groups
	vehicleGroups = nil

	// Store trip logs (idempotent)
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
	log.Printf("[aggregate] Reconstructed %d trips", len(allTrips))

	// Segment speed aggregation
	if len(segDefs) > 0 && len(hourlySegmentSpeeds) > 0 {
		_, err := pool.Exec(ctx,
			`DELETE FROM "SegmentSpeedHourly" WHERE "hourStart" >= $1 AND "hourStart" < $2`,
			yesterday, today)
		if err != nil {
			return fmt.Errorf("delete old segment speeds: %w", err)
		}

		// Build segment lookup
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
			// key format: "segId:hourISO"
			// segId can contain colons (route:dir:idx), so find the ISO timestamp at the end
			// ISO timestamps start with a digit after the last colon-separated segment ID
			// Actually the format is "route:dir:idx:2024-01-01T00:00:00Z"
			// Find the segment ID by looking up in our map
			var segID, hourISO string
			// Try progressively longer prefixes
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

	// Stop headway irregularity
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

			// Parse stopKey: "route:dir:stopId"
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

			// Find stop name and sequence
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
