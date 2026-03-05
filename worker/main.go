package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const (
	fiwareURL  = "https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000"
	intervalMs = 30_000
	batchSize  = 100
)

// Scheduled job definition
type scheduledJob struct {
	name      string
	hour      int
	dayOfWeek *time.Weekday // nil = daily
	fn        func(ctx context.Context) error
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// R2 is required for collection
	r2, bucket := getR2Client()
	if r2 == nil {
		log.Fatal("FATAL: R2 not configured — set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
	}

	// DB pool is only needed for scheduled jobs (aggregate, archive, cleanup, segments, snapshot)
	// Collection loop does not touch the DB.
	var jobs []scheduledJob
	if dbURL != "" {
		pool, err := newPool(ctx, dbURL)
		if err != nil {
			log.Fatalf("FATAL: Database connection failed: %v", err)
		}
		defer pool.Close()

		var ok int
		if err := pool.QueryRow(ctx, "SELECT 1 as ok").Scan(&ok); err != nil {
			log.Fatalf("FATAL: Database ping failed: %v", err)
		}
		log.Println("Database connection: OK")

		monday := time.Monday
		jobs = []scheduledJob{
			{name: "snapshot-schedule", hour: 1, dayOfWeek: nil, fn: func(ctx context.Context) error {
				return runSnapshotSchedule(ctx, pool)
			}},
			{name: "aggregate-daily", hour: 3, dayOfWeek: nil, fn: func(ctx context.Context) error {
				return runAggregateDaily(ctx, pool, r2, bucket)
			}},
			{name: "archive-positions", hour: 3, dayOfWeek: nil, fn: func(ctx context.Context) error {
				return runArchivePositions(ctx, r2, bucket)
			}},
			{name: "cleanup-positions", hour: 4, dayOfWeek: nil, fn: func(ctx context.Context) error {
				return runCleanupPositions(ctx, r2, bucket)
			}},
			{name: "refresh-segments", hour: 5, dayOfWeek: &monday, fn: func(ctx context.Context) error {
				return runRefreshSegments(ctx, pool)
			}},
		}
	} else {
		log.Println("WARNING: DATABASE_URL not set — scheduled jobs (aggregate, archive, cleanup) disabled")
	}

	// --- CLI mode: run a specific job and exit ---
	if len(os.Args) >= 3 && os.Args[1] == "run" {
		jobName := os.Args[2]
		var target *scheduledJob
		for i := range jobs {
			if jobs[i].name == jobName {
				target = &jobs[i]
				break
			}
		}
		if target == nil {
			log.Printf("Unknown job: %s", jobName)
			log.Printf("Available jobs:")
			for _, j := range jobs {
				log.Printf("  - %s", j.name)
			}
			os.Exit(1)
		}
		log.Printf("[run] Executing %s...", target.name)
		if err := target.fn(ctx); err != nil {
			log.Fatalf("[run] %s failed: %v", target.name, err)
		}
		log.Printf("[run] %s completed successfully", target.name)
		return
	}

	maskedURL := maskDatabaseURL(dbURL)
	log.Println("=== PortoMove Worker (Go) ===")
	log.Printf("Collection interval: %ds", intervalMs/1000)
	log.Printf("Database: %s", maskedURL)
	log.Printf("FIWARE:   %s", fiwareURL)
	log.Println("Scheduled jobs:")
	dayNames := []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
	for _, job := range jobs {
		dayStr := "daily"
		if job.dayOfWeek != nil {
			dayStr = dayNames[int(*job.dayOfWeek)]
		}
		log.Printf("  - %s: %02d:00 UTC (%s)", job.name, job.hour, dayStr)
	}
	log.Println("")
	log.Println("Starting main loop...")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	var totalCollected int64
	var totalCycles int64
	var totalErrors int64

	jobLastRun := make(map[string]string)

	ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
	defer ticker.Stop()

	// Run first collection immediately
	collected, err := collectPositions(ctx, r2, bucket)
	if err != nil {
		totalErrors++
		log.Printf("[collect] Failed: %v", err)
	} else {
		totalCollected += int64(collected)
		totalCycles++
		log.Printf("[collect] %d positions", collected)
	}
	checkScheduledJobs(ctx, jobs, jobLastRun)

	for {
		select {
		case <-sigCh:
			log.Printf("Shutting down. Total: %d positions in %d cycles, %d errors.",
				totalCollected, totalCycles, totalErrors)
			cancel()
			return
		case <-ticker.C:
			collected, err := collectPositions(ctx, r2, bucket)
			if err != nil {
				totalErrors++
				log.Printf("[collect] Failed: %v", err)
			} else {
				totalCollected += int64(collected)
				totalCycles++
				if totalCycles%10 == 0 {
					log.Printf("[collect] cycle %d: %d positions | total: %d, errors: %d",
						totalCycles, collected, totalCollected, totalErrors)
				} else {
					log.Printf("[collect] %d positions", collected)
				}
			}
			checkScheduledJobs(ctx, jobs, jobLastRun)
		}
	}
}

func checkScheduledJobs(ctx context.Context, jobs []scheduledJob, lastRun map[string]string) {
	now := time.Now().UTC()
	utcHour := now.Hour()
	utcDay := now.Weekday()
	todayKey := now.Format("2006-01-02")

	for _, job := range jobs {
		if utcHour != job.hour {
			continue
		}
		if job.dayOfWeek != nil && utcDay != *job.dayOfWeek {
			continue
		}
		runKey := todayKey + ":" + job.name
		if lastRun[job.name] == runKey {
			continue
		}
		lastRun[job.name] = runKey

		log.Printf("[scheduler] Starting %s...", job.name)
		if err := job.fn(ctx); err != nil {
			log.Printf("[scheduler] %s failed: %v", job.name, err)
		} else {
			log.Printf("[scheduler] %s completed successfully", job.name)
		}
	}
}

func maskDatabaseURL(url string) string {
	if url == "" {
		return "(not set)"
	}
	atIdx := strings.Index(url, "@")
	if atIdx == -1 {
		return url
	}
	prefix := url[:strings.Index(url, "://")+3]
	rest := url[len(prefix):]
	colonIdx := strings.Index(rest, ":")
	if colonIdx == -1 || colonIdx > strings.Index(rest, "@") {
		return url
	}
	return fmt.Sprintf("%s%s:***@%s", prefix, rest[:colonIdx], rest[strings.Index(rest, "@")+1:])
}
