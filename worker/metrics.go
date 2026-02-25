package main

import (
	"math"
	"sort"
	"time"
)

// PositionPoint represents a single bus position for trip reconstruction
type PositionPoint struct {
	RecordedAt  time.Time
	VehicleID   string
	VehicleNum  *string
	Route       string
	TripID      *string
	DirectionID *int16
	Lat         float64
	Lon         float64
	Speed       *float32
}

// ReconstructedTrip represents a reconstructed bus trip
type ReconstructedTrip struct {
	VehicleID   string
	VehicleNum  *string
	Route       string
	TripID      *string
	DirectionID *int16
	StartedAt   time.Time
	EndedAt     time.Time
	RuntimeSecs int
	Positions   int
	AvgSpeed    float64
}

func reconstructTrips(points []PositionPoint, maxGapMinutes float64) []ReconstructedTrip {
	if len(points) < 2 {
		return nil
	}

	var trips []ReconstructedTrip
	tripPoints := []PositionPoint{points[0]}

	for i := 1; i < len(points); i++ {
		prev := points[i-1]
		curr := points[i]
		gapMs := curr.RecordedAt.Sub(prev.RecordedAt).Milliseconds()
		gapMinutes := float64(gapMs) / 60000.0

		tripChanged := curr.TripID != nil && prev.TripID != nil && *curr.TripID != *prev.TripID
		gapTooLarge := gapMinutes > maxGapMinutes

		if tripChanged || gapTooLarge {
			if len(tripPoints) >= 3 {
				trips = append(trips, finalizeTrip(tripPoints))
			}
			tripPoints = []PositionPoint{curr}
		} else {
			tripPoints = append(tripPoints, curr)
		}
	}

	if len(tripPoints) >= 3 {
		trips = append(trips, finalizeTrip(tripPoints))
	}

	return trips
}

func finalizeTrip(points []PositionPoint) ReconstructedTrip {
	first := points[0]
	last := points[len(points)-1]
	runtimeSecs := int(math.Round(last.RecordedAt.Sub(first.RecordedAt).Seconds()))

	var speedSum float64
	var speedCount int
	for _, p := range points {
		if p.Speed != nil && *p.Speed >= 0 {
			speedSum += float64(*p.Speed)
			speedCount++
		}
	}
	var avgSpeed float64
	if speedCount > 0 {
		avgSpeed = speedSum / float64(speedCount)
	}

	return ReconstructedTrip{
		VehicleID:   first.VehicleID,
		VehicleNum:  first.VehicleNum,
		Route:       first.Route,
		TripID:      first.TripID,
		DirectionID: first.DirectionID,
		StartedAt:   first.RecordedAt,
		EndedAt:     last.RecordedAt,
		RuntimeSecs: runtimeSecs,
		Positions:   len(points),
		AvgSpeed:    math.Round(avgSpeed*10) / 10,
	}
}

// HeadwayMetrics holds computed headway statistics
type HeadwayMetrics struct {
	AvgHeadwaySecs      int
	HeadwayAdherencePct float64
	ExcessWaitTimeSecs  int
	BunchingPct         float64
	GappingPct          float64
}

func computeHeadwayMetrics(observedStartTimes []int64, scheduledHeadwaySecs *float64) *HeadwayMetrics {
	if len(observedStartTimes) < 2 {
		return nil
	}

	headways := make([]float64, 0, len(observedStartTimes)-1)
	for i := 1; i < len(observedStartTimes); i++ {
		headways = append(headways, float64(observedStartTimes[i]-observedStartTimes[i-1])/1000.0)
	}

	var sumH float64
	for _, h := range headways {
		sumH += h
	}
	avgHeadway := sumH / float64(len(headways))

	var sumH2 float64
	for _, h := range headways {
		sumH2 += h * h
	}
	awt := sumH2 / (2 * sumH)

	var ewt float64
	var headwayAdherence float64 = 100
	var bunchingPct, gappingPct float64

	if scheduledHeadwaySecs != nil && *scheduledHeadwaySecs > 0 {
		swt := *scheduledHeadwaySecs / 2
		ewt = math.Max(0, awt-swt)

		threshold := *scheduledHeadwaySecs + 180
		adherent := 0
		bunched := 0
		gapped := 0
		for _, h := range headways {
			if h <= threshold {
				adherent++
			}
			if h < *scheduledHeadwaySecs*0.5 {
				bunched++
			}
			if h > *scheduledHeadwaySecs*1.5 {
				gapped++
			}
		}
		headwayAdherence = float64(adherent) / float64(len(headways)) * 100
		bunchingPct = float64(bunched) / float64(len(headways)) * 100
		gappingPct = float64(gapped) / float64(len(headways)) * 100
	} else {
		sorted := make([]float64, len(headways))
		copy(sorted, headways)
		sort.Float64s(sorted)
		median := sorted[len(sorted)/2]
		swt := median / 2
		ewt = math.Max(0, awt-swt)

		threshold := median + 180
		adherent := 0
		bunched := 0
		gapped := 0
		for _, h := range headways {
			if h <= threshold {
				adherent++
			}
			if h < median*0.5 {
				bunched++
			}
			if h > median*1.5 {
				gapped++
			}
		}
		headwayAdherence = float64(adherent) / float64(len(headways)) * 100
		bunchingPct = float64(bunched) / float64(len(headways)) * 100
		gappingPct = float64(gapped) / float64(len(headways)) * 100
	}

	return &HeadwayMetrics{
		AvgHeadwaySecs:      int(math.Round(avgHeadway)),
		HeadwayAdherencePct: math.Round(headwayAdherence*10) / 10,
		ExcessWaitTimeSecs:  int(math.Round(ewt)),
		BunchingPct:         math.Round(bunchingPct*10) / 10,
		GappingPct:          math.Round(gappingPct*10) / 10,
	}
}

func percentile(arr []float64, p float64) float64 {
	if len(arr) == 0 {
		return 0
	}
	sorted := make([]float64, len(arr))
	copy(sorted, arr)
	sort.Float64s(sorted)
	idx := (p / 100) * float64(len(sorted)-1)
	lower := int(math.Floor(idx))
	upper := int(math.Ceil(idx))
	if lower == upper {
		return sorted[lower]
	}
	return sorted[lower] + (sorted[upper]-sorted[lower])*(idx-float64(lower))
}
