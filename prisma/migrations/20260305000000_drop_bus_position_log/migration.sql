-- DropTable: BusPositionLog
-- Raw GPS positions are now written to Cloudflare R2 snapshots by the Go worker.
-- This table is no longer needed — Neon can idle between user interactions.

DROP TABLE IF EXISTS "BusPositionLog";
