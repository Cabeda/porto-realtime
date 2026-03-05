package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
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

// SnapshotPosition is the JSON shape written to R2 per position.
type SnapshotPosition struct {
	VehicleID   string   `json:"vehicleId"`
	VehicleNum  string   `json:"vehicleNum,omitempty"`
	Route       string   `json:"route,omitempty"`
	TripID      string   `json:"tripId,omitempty"`
	DirectionID *int16   `json:"directionId,omitempty"`
	Lat         float64  `json:"lat"`
	Lon         float64  `json:"lon"`
	Speed       *float32 `json:"speed,omitempty"`
	Heading     *float32 `json:"heading,omitempty"`
}

// SnapshotFile is the JSON written to snapshots/YYYY/MM/DD/HHMMSS.json
type SnapshotFile struct {
	RecordedAt string             `json:"recordedAt"`
	Positions  []SnapshotPosition `json:"positions"`
}

// TodaySummary is the JSON written to snapshots/today.json
type TodaySummary struct {
	UpdatedAt          string           `json:"updatedAt"`
	Date               string           `json:"date"`
	PositionsCollected int64            `json:"positionsCollected"`
	ActiveVehicles     int              `json:"activeVehicles"`
	ActiveRoutes       int              `json:"activeRoutes"`
	AvgSpeed           *float64         `json:"avgSpeed"`
	HourlySpeed        []HourlySpeedBkt `json:"hourlySpeed"`
	HourlyFleet        []HourlyFleetBkt `json:"hourlyFleet"`
}

type HourlySpeedBkt struct {
	Hour     int      `json:"hour"`
	AvgSpeed *float64 `json:"avgSpeed"`
	Samples  int      `json:"samples"`
}

type HourlyFleetBkt struct {
	Hour     int `json:"hour"`
	Vehicles int `json:"vehicles"`
	Routes   int `json:"routes"`
}

// rollingState accumulates stats across collection cycles for today.json
type rollingState struct {
	mu                 sync.Mutex
	date               string
	positionsCollected int64
	vehicles           map[string]struct{}
	routes             map[string]struct{}
	speedSum           float64
	speedCount         int64
	hourlySpeedSum     [24]float64
	hourlySpeedCount   [24]int64
	hourlyVehicles     [24]map[string]struct{}
	hourlyRoutes       [24]map[string]struct{}
}

var state = &rollingState{}

func (s *rollingState) reset(date string) {
	s.date = date
	s.positionsCollected = 0
	s.vehicles = make(map[string]struct{})
	s.routes = make(map[string]struct{})
	s.speedSum = 0
	s.speedCount = 0
	s.hourlySpeedSum = [24]float64{}
	s.hourlySpeedCount = [24]int64{}
	for i := range s.hourlyVehicles {
		s.hourlyVehicles[i] = make(map[string]struct{})
		s.hourlyRoutes[i] = make(map[string]struct{})
	}
}

func (s *rollingState) ingest(rows []*positionRow, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()

	today := now.UTC().Format("2006-01-02")
	if s.date != today {
		s.reset(today)
	}

	h := now.UTC().Hour()
	s.positionsCollected += int64(len(rows))

	for _, r := range rows {
		s.vehicles[r.vehicleID] = struct{}{}
		if r.route != nil {
			s.routes[*r.route] = struct{}{}
		}
		if r.speed != nil && *r.speed > 0 {
			s.speedSum += float64(*r.speed)
			s.speedCount++
			s.hourlySpeedSum[h] += float64(*r.speed)
			s.hourlySpeedCount[h]++
		}
		s.hourlyVehicles[h][r.vehicleID] = struct{}{}
		if r.route != nil {
			s.hourlyRoutes[h][*r.route] = struct{}{}
		}
	}
}

func (s *rollingState) summary(now time.Time) TodaySummary {
	s.mu.Lock()
	defer s.mu.Unlock()

	var avgSpeed *float64
	if s.speedCount > 0 {
		v := float64(int(s.speedSum/float64(s.speedCount)*10)) / 10
		avgSpeed = &v
	}

	hourlySpeed := make([]HourlySpeedBkt, 24)
	hourlyFleet := make([]HourlyFleetBkt, 24)
	for h := 0; h < 24; h++ {
		bkt := HourlySpeedBkt{Hour: h}
		if s.hourlySpeedCount[h] > 0 {
			v := float64(int(s.hourlySpeedSum[h]/float64(s.hourlySpeedCount[h])*10)) / 10
			bkt.AvgSpeed = &v
			bkt.Samples = int(s.hourlySpeedCount[h])
		}
		hourlySpeed[h] = bkt
		hourlyFleet[h] = HourlyFleetBkt{
			Hour:     h,
			Vehicles: len(s.hourlyVehicles[h]),
			Routes:   len(s.hourlyRoutes[h]),
		}
	}

	return TodaySummary{
		UpdatedAt:          now.UTC().Format(time.RFC3339),
		Date:               s.date,
		PositionsCollected: s.positionsCollected,
		ActiveVehicles:     len(s.vehicles),
		ActiveRoutes:       len(s.routes),
		AvgSpeed:           avgSpeed,
		HourlySpeed:        hourlySpeed,
		HourlyFleet:        hourlyFleet,
	}
}

// unwrapString extracts a string from either "value" or a raw string JSON value
func unwrapString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var obj struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil && obj.Value != "" {
		return obj.Value
	}
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
	var nested struct {
		Value struct {
			Coordinates [2]float64 `json:"coordinates"`
		} `json:"value"`
	}
	if err := json.Unmarshal(raw, &nested); err == nil && (nested.Value.Coordinates[0] != 0 || nested.Value.Coordinates[1] != 0) {
		return nested.Value.Coordinates[0], nested.Value.Coordinates[1], true
	}
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
	var obj struct {
		Value []string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil && len(obj.Value) > 0 {
		return obj.Value
	}
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

func collectPositions(ctx context.Context, r2 *s3.Client, bucket string) (int, error) {
	now := time.Now().UTC()

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

	// Build snapshot positions
	positions := make([]SnapshotPosition, 0, len(rows))
	for _, r := range rows {
		sp := SnapshotPosition{
			VehicleID:   r.vehicleID,
			DirectionID: r.directionID,
			Lat:         r.lat,
			Lon:         r.lon,
			Speed:       r.speed,
			Heading:     r.heading,
		}
		if r.vehicleNum != nil {
			sp.VehicleNum = *r.vehicleNum
		}
		if r.route != nil {
			sp.Route = *r.route
		}
		if r.tripID != nil {
			sp.TripID = *r.tripID
		}
		positions = append(positions, sp)
	}

	snapshot := SnapshotFile{
		RecordedAt: now.Format(time.RFC3339),
		Positions:  positions,
	}

	snapshotJSON, err := json.Marshal(snapshot)
	if err != nil {
		return 0, fmt.Errorf("marshal snapshot: %w", err)
	}

	// Write per-cycle snapshot: snapshots/YYYY/MM/DD/HHMMSS.json
	snapshotKey := fmt.Sprintf("snapshots/%04d/%02d/%02d/%s.json",
		now.Year(), now.Month(), now.Day(), now.Format("150405"))
	contentType := "application/json"
	if _, err := r2.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &bucket,
		Key:         &snapshotKey,
		Body:        bytes.NewReader(snapshotJSON),
		ContentType: &contentType,
	}); err != nil {
		return 0, fmt.Errorf("write snapshot to R2: %w", err)
	}

	// Update rolling state and overwrite today.json
	state.ingest(rows, now)
	summary := state.summary(now)

	summaryJSON, err := json.Marshal(summary)
	if err != nil {
		return len(rows), fmt.Errorf("marshal today summary: %w", err)
	}

	todayKey := "snapshots/today.json"
	if _, err := r2.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &bucket,
		Key:         &todayKey,
		Body:        bytes.NewReader(summaryJSON),
		ContentType: &contentType,
	}); err != nil {
		// Non-fatal: snapshot was written, today.json is best-effort
		log.Printf("[collect] WARNING: failed to update today.json: %v", err)
	}

	return len(rows), nil
}
