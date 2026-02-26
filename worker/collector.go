package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FIWARE entity types

type fiwareEntity struct {
	ID                     string          `json:"id"`
	Type                   string          `json:"type"`
	Location               json.RawMessage `json:"location"`
	RouteShortName         json.RawMessage `json:"routeShortName"`
	Route                  json.RawMessage `json:"route"`
	LineID                 json.RawMessage `json:"lineId"`
	Line                   json.RawMessage `json:"line"`
	VehiclePlateIdentifier json.RawMessage `json:"vehiclePlateIdentifier"`
	VehicleNumber          json.RawMessage `json:"vehicleNumber"`
	LicensePlate           json.RawMessage `json:"license_plate"`
	Name                   json.RawMessage `json:"name"`
	Heading                json.RawMessage `json:"heading"`
	Bearing                json.RawMessage `json:"bearing"`
	Speed                  json.RawMessage `json:"speed"`
	Annotations            json.RawMessage `json:"annotations"`
}

type positionRow struct {
	vehicleID   string
	vehicleNum  *string
	route       *string
	tripID      *string
	directionID *int16
	lat         float64
	lon         float64
	speed       *float32
	heading     *float32
}

// unwrapString extracts a string from either "value" or a raw string JSON value
func unwrapString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	// Try {"value": "..."} first
	var obj struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil && obj.Value != "" {
		return obj.Value
	}
	// Try raw string
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	return ""
}

// unwrapFloat64 extracts a float64 from either {"value": N} or raw number
func unwrapFloat64(raw json.RawMessage) (float64, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	var obj struct {
		Value *float64 `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil && obj.Value != nil {
		return *obj.Value, true
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return f, true
	}
	return 0, false
}

// unwrapLocation extracts [lon, lat] coordinates from FIWARE location
func unwrapLocation(raw json.RawMessage) (lon, lat float64, ok bool) {
	if len(raw) == 0 {
		return 0, 0, false
	}

	// Try {"value": {"coordinates": [lon, lat]}}
	var nested struct {
		Value struct {
			Coordinates [2]float64 `json:"coordinates"`
		} `json:"value"`
	}
	if err := json.Unmarshal(raw, &nested); err == nil && (nested.Value.Coordinates[0] != 0 || nested.Value.Coordinates[1] != 0) {
		return nested.Value.Coordinates[0], nested.Value.Coordinates[1], true
	}

	// Try {"coordinates": [lon, lat]}
	var direct struct {
		Coordinates [2]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(raw, &direct); err == nil && (direct.Coordinates[0] != 0 || direct.Coordinates[1] != 0) {
		return direct.Coordinates[0], direct.Coordinates[1], true
	}

	return 0, 0, false
}

// unwrapAnnotations extracts string array from FIWARE annotations
func unwrapAnnotations(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	// Try {"value": [...]}
	var obj struct {
		Value []string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil && len(obj.Value) > 0 {
		return obj.Value
	}
	// Try raw array
	var arr []string
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr
	}
	return nil
}

var routePartRegex = regexp.MustCompile(`^[A-Za-z0-9]{1,4}$`)
var stcpRegex = regexp.MustCompile(`(?i)STCP\s+(\d+)`)

func parseEntity(entity *fiwareEntity) *positionRow {
	lon, lat, ok := unwrapLocation(entity.Location)
	if !ok {
		return nil
	}

	// Determine route
	var route string
	if rsn := unwrapString(entity.RouteShortName); rsn != "" {
		route = rsn
	} else if rte := unwrapString(entity.Route); rte != "" {
		route = rte
	} else if lid := unwrapString(entity.LineID); lid != "" {
		route = lid
	} else if lin := unwrapString(entity.Line); lin != "" {
		route = lin
	} else {
		vehicleID := unwrapString(entity.VehiclePlateIdentifier)
		if vehicleID == "" {
			vehicleID = unwrapString(entity.VehicleNumber)
		}
		if vehicleID == "" {
			vehicleID = unwrapString(entity.LicensePlate)
		}
		if vehicleID == "" {
			vehicleID = unwrapString(entity.Name)
		}

		if vehicleID != "" {
			if m := stcpRegex.FindStringSubmatch(vehicleID); len(m) > 1 {
				route = m[1]
			}
		}

		if route == "" && entity.ID != "" {
			parts := strings.Split(entity.ID, ":")
			for i := 2; i < len(parts)-1; i++ {
				p := parts[i]
				if p != "" && p != "Vehicle" && p != "porto" && p != "stcp" && routePartRegex.MatchString(p) {
					route = p
					break
				}
			}
			if route == "" && len(parts) >= 4 {
				candidate := parts[len(parts)-2]
				if candidate != "" && candidate != "Vehicle" && candidate != "stcp" {
					route = candidate
				}
			}
		}
	}

	// Parse annotations for directionId and tripId
	var directionID *int16
	var tripID *string
	annotations := unwrapAnnotations(entity.Annotations)
	for _, ann := range annotations {
		if strings.HasPrefix(ann, "stcp:sentido:") {
			var d int16
			if _, err := fmt.Sscanf(ann, "stcp:sentido:%d", &d); err == nil {
				directionID = &d
			}
		} else if strings.HasPrefix(ann, "stcp:nr_viagem:") {
			t := strings.TrimPrefix(ann, "stcp:nr_viagem:")
			tripID = &t
		}
	}

	// Parse vehicle number
	var vehicleNum *string
	rawVehicleNum := unwrapString(entity.VehiclePlateIdentifier)
	if rawVehicleNum == "" {
		rawVehicleNum = unwrapString(entity.VehicleNumber)
	}
	if rawVehicleNum == "" {
		rawVehicleNum = unwrapString(entity.LicensePlate)
	}
	if rawVehicleNum == "" {
		rawVehicleNum = unwrapString(entity.Name)
	}
	if rawVehicleNum == "" {
		parts := strings.Split(entity.ID, ":")
		if len(parts) > 0 {
			rawVehicleNum = parts[len(parts)-1]
		}
	}
	if rawVehicleNum != "" {
		parts := strings.Fields(rawVehicleNum)
		last := parts[len(parts)-1]
		isDigits := true
		for _, c := range last {
			if c < '0' || c > '9' {
				isDigits = false
				break
			}
		}
		if isDigits && last != "" {
			vehicleNum = &last
		} else {
			vehicleNum = &rawVehicleNum
		}
	}

	// Parse speed and heading
	var speed *float32
	if s, ok := unwrapFloat64(entity.Speed); ok {
		f := float32(s)
		speed = &f
	}
	var heading *float32
	if h, ok := unwrapFloat64(entity.Heading); ok {
		f := float32(h)
		heading = &f
	} else if b, ok := unwrapFloat64(entity.Bearing); ok {
		f := float32(b)
		heading = &f
	}

	var routePtr *string
	if route != "" {
		routePtr = &route
	}

	return &positionRow{
		vehicleID:   entity.ID,
		vehicleNum:  vehicleNum,
		route:       routePtr,
		tripID:      tripID,
		directionID: directionID,
		lat:         lat,
		lon:         lon,
		speed:       speed,
		heading:     heading,
	}
}

func collectPositions(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	start := time.Now()

	req, err := http.NewRequestWithContext(ctx, "GET", fiwareURL, nil)
	if err != nil {
		return 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "PortoMove-Collector/2.0")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-cache")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("FIWARE fetch: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("FIWARE HTTP %d %s", resp.StatusCode, resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("read response: %w", err)
	}

	var entities []fiwareEntity
	if err := json.Unmarshal(body, &entities); err != nil {
		return 0, fmt.Errorf("parse FIWARE JSON: %w", err)
	}

	if len(entities) == 0 {
		return 0, fmt.Errorf("FIWARE returned empty response")
	}

	// Parse entities into rows
	rows := make([]*positionRow, 0, len(entities))
	for i := range entities {
		if entities[i].ID == "" {
			continue
		}
		if row := parseEntity(&entities[i]); row != nil {
			rows = append(rows, row)
		}
	}

	if len(rows) == 0 {
		log.Println("[collect] No valid positions parsed from FIWARE response")
		return 0, nil
	}

	// Insert in batches using COPY for speed
	for i := 0; i < len(rows); i += batchSize {
		end := i + batchSize
		if end > len(rows) {
			end = len(rows)
		}
		batch := rows[i:end]

		copyRows := make([][]interface{}, len(batch))
		for j, r := range batch {
			copyRows[j] = []interface{}{
				time.Now(), r.vehicleID, r.vehicleNum, r.route,
				r.tripID, r.directionID, r.lat, r.lon, r.speed, r.heading,
			}
		}

		_, err := pool.CopyFrom(ctx,
			pgx.Identifier{"BusPositionLog"},
			[]string{"recordedAt", "vehicleId", "vehicleNum", "route", "tripId", "directionId", "lat", "lon", "speed", "heading"},
			pgx.CopyFromRows(copyRows),
		)
		if err != nil {
			return 0, fmt.Errorf("insert batch: %w", err)
		}
	}

	elapsed := time.Since(start)
	_ = elapsed // logged by caller
	return len(rows), nil
}
