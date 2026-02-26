package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func runCleanupPositions(ctx context.Context, pool *pgxpool.Pool) error {
	startTime := time.Now()
	cutoff := time.Now().Add(-24 * time.Hour)

	result, err := pool.Exec(ctx,
		`DELETE FROM "BusPositionLog" WHERE "recordedAt" < $1`, cutoff)
	if err != nil {
		return fmt.Errorf("delete old positions: %w", err)
	}

	elapsed := time.Since(startTime)
	log.Printf("[cleanup] Deleted %d positions older than %s in %s",
		result.RowsAffected(), cutoff.Format(time.RFC3339), elapsed)
	return nil
}
