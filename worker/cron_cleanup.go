package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// runCleanupPositions deletes R2 snapshot objects older than 2 days.
// The Parquet archive (positions/YYYY/MM/DD.parquet) is kept permanently.
func runCleanupPositions(ctx context.Context, r2 *s3.Client, bucket string) error {
	startTime := time.Now()

	// Keep 2 days of snapshots (today + yesterday) so aggregate can still run
	cutoff := time.Now().UTC().AddDate(0, 0, -2)
	cutoff = time.Date(cutoff.Year(), cutoff.Month(), cutoff.Day(), 0, 0, 0, 0, time.UTC)

	keys, err := listSnapshotKeysForCleanup(ctx, r2, bucket, cutoff)
	if err != nil {
		return fmt.Errorf("list old snapshots: %w", err)
	}

	if len(keys) == 0 {
		log.Printf("[cleanup] No snapshots older than %s to delete", cutoff.Format("2006-01-02"))
		return nil
	}

	// Delete in batches (S3 DeleteObjects supports up to 1000 per call,
	// but we'll do one-by-one for simplicity since this runs once/day)
	deleted := 0
	for _, key := range keys {
		k := key
		_, err := r2.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: &bucket,
			Key:    &k,
		})
		if err != nil {
			log.Printf("[cleanup] WARNING: failed to delete %s: %v", key, err)
			continue
		}
		deleted++
	}

	elapsed := time.Since(startTime)
	log.Printf("[cleanup] Deleted %d snapshot objects older than %s in %s",
		deleted, cutoff.Format("2006-01-02"), elapsed)
	return nil
}
