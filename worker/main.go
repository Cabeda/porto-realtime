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

// jobRegistry maps job names to their run functions (populated after pool init)
type jobEntry struct {
	name string
	fn   func(ctx context.Context) error
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("FATAL: DATABASE_URL environment variable is not set")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := newPool(ctx, dbURL)
	if err != nil {
		log.Fatalf("FATAL: Database connection failed: %v", err)
	}
	defer pool.Close()

	// Verify DB connectivity
	var ok int
	if err := pool.QueryRow(ctx, "SELECT 1 as ok").Scan(&ok); err != nil {
		log.Fatalf("FATAL: Database connection failed: %v", err)
	}
	log.Println("Database connection: OK")

	var count int64
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM "BusPositionLog" LIMIT 1`).Scan(&count); err != nil {
		log.Fatalf("FATAL: BusPositionLog table check failed: %v", err)
	}
	log.Println("BusPositionLog table: OK")

	// Define scheduled jobs
	monday := time.Monday
	jobs := []scheduledJob{
		{name: "aggregate-daily", hour: 3, dayOfWeek: nil, fn: func(ctx context.Context) error { return runAggregateDaily(ctx, pool) }},
		{name: "archive-positions", hour: 3, dayOfWeek: nil, fn: func(ctx context.Context) error { return runArchivePositions(ctx, pool) }},
		{name: "cleanup-positions", hour: 4, dayOfWeek: nil, fn: func(ctx context.Context) error { return runCleanupPositions(ctx, pool) }},
		{name: "refresh-segments", hour: 5, dayOfWeek: &monday, fn: func(ctx context.Context) error { return runRefreshSegments(ctx, pool) }},
	}

	// --- CLI mode: run a specific job and exit ---
	// Usage: worker run <job-name>
	//   e.g. worker run aggregate-daily
	//        worker run cleanup-positions
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

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	var totalCollected int64
	var totalCycles int64
	var totalErrors int64

	jobLastRun := make(map[string]string)

	ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
	defer ticker.Stop()

	// Run first collection immediately
	collected, err := collectPositions(ctx, pool)
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
			collected, err := collectPositions(ctx, pool)
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
	// Mask password in postgres://user:password@host/db
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
