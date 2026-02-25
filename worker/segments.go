package main

import (
	"fmt"
	"math"
)

// haversineM computes distance in meters between two lat/lon points
func haversineM(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// SegmentDef defines a route segment
type SegmentDef struct {
	ID           string
	Route        string
	DirectionID  int
	SegmentIndex int
	StartLat     float64
	StartLon     float64
	EndLat       float64
	EndLon       float64
	MidLat       float64
	MidLon       float64
	LengthM      float64
	Geometry     SegmentGeometry
}

type SegmentGeometry struct {
	Type        string       `json:"type"`
	Coordinates [][2]float64 `json:"coordinates"`
}

func splitIntoSegments(route string, directionID int, coordinates [][2]float64, targetLengthM float64) []SegmentDef {
	if len(coordinates) < 2 {
		return nil
	}

	var segments []SegmentDef
	segmentIndex := 0
	segCoords := [][2]float64{coordinates[0]}
	var segLength float64

	for i := 1; i < len(coordinates); i++ {
		prev := coordinates[i-1]
		curr := coordinates[i]
		dist := haversineM(prev[1], prev[0], curr[1], curr[0])

		segCoords = append(segCoords, curr)
		segLength += dist

		if segLength >= targetLengthM || i == len(coordinates)-1 {
			start := segCoords[0]
			end := segCoords[len(segCoords)-1]
			midIdx := len(segCoords) / 2
			mid := segCoords[midIdx]

			geomCoords := make([][2]float64, len(segCoords))
			copy(geomCoords, segCoords)

			segments = append(segments, SegmentDef{
				ID:           fmt.Sprintf("%s:%d:%d", route, directionID, segmentIndex),
				Route:        route,
				DirectionID:  directionID,
				SegmentIndex: segmentIndex,
				StartLat:     start[1],
				StartLon:     start[0],
				EndLat:       end[1],
				EndLon:       end[0],
				MidLat:       mid[1],
				MidLon:       mid[0],
				LengthM:      segLength,
				Geometry: SegmentGeometry{
					Type:        "LineString",
					Coordinates: geomCoords,
				},
			})

			segmentIndex++
			segCoords = [][2]float64{curr}
			segLength = 0
		}
	}

	return segments
}

func snapToSegment(lat, lon float64, route string, directionID *int16, segments []SegmentDef, maxDistM float64) string {
	bestID := ""
	bestDist := math.Inf(1)

	for i := range segments {
		seg := &segments[i]
		if seg.Route != route {
			continue
		}
		if directionID != nil && seg.DirectionID != int(*directionID) {
			continue
		}

		dist := haversineM(lat, lon, seg.MidLat, seg.MidLon)
		if dist < bestDist && dist <= maxDistM {
			bestDist = dist
			bestID = seg.ID
		}
	}

	return bestID
}
