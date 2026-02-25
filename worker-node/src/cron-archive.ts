/**
 * Cron: Archive yesterday's raw positions as Parquet to Cloudflare R2
 *
 * Runs at 03:30 UTC daily (after aggregation at 03:00).
 * Writes a single Parquet file per day: positions/YYYY/MM/DD.parquet
 * Then the cleanup job (04:00) can safely delete old raw data from Neon.
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { parquetWriteBuffer } from "hyparquet-writer";
import { prisma } from "./prisma.js";

// ---------------------------------------------------------------------------
// R2 client (S3-compatible)
// ---------------------------------------------------------------------------

function getR2Client(): S3Client | null {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.warn("[archive] R2 not configured — skipping archive");
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const R2_BUCKET = process.env.R2_BUCKET || "porto-move";

// ---------------------------------------------------------------------------
// Archive pipeline
// ---------------------------------------------------------------------------

export async function runArchivePositions(): Promise<void> {
  const startTime = Date.now();

  const r2 = getR2Client();
  if (!r2) return;

  // Archive yesterday's data
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  const year = yesterday.getUTCFullYear();
  const month = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getUTCDate()).padStart(2, "0");
  const key = `positions/${year}/${month}/${day}.parquet`;

  // Check if already archived (idempotent)
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    console.log(`[archive] ${key} already exists — skipping`);
    return;
  } catch {
    // Object doesn't exist — proceed with archive
  }

  // Fetch all positions for yesterday in batches to limit memory
  const BATCH_SIZE = 50_000;
  let offset = 0;
  const allRecordedAt: string[] = [];
  const allVehicleId: string[] = [];
  const allVehicleNum: (string | null)[] = [];
  const allRoute: (string | null)[] = [];
  const allTripId: (string | null)[] = [];
  const allDirectionId: (number | null)[] = [];
  const allLat: number[] = [];
  const allLon: number[] = [];
  const allSpeed: (number | null)[] = [];
  const allHeading: (number | null)[] = [];

  while (true) {
    const batch = await prisma.busPositionLog.findMany({
      where: { recordedAt: { gte: yesterday, lt: today } },
      orderBy: { recordedAt: "asc" },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const p of batch) {
      allRecordedAt.push(p.recordedAt.toISOString());
      allVehicleId.push(p.vehicleId);
      allVehicleNum.push(p.vehicleNum);
      allRoute.push(p.route);
      allTripId.push(p.tripId);
      allDirectionId.push(p.directionId);
      allLat.push(p.lat);
      allLon.push(p.lon);
      allSpeed.push(p.speed);
      allHeading.push(p.heading);
    }

    offset += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }

  const totalRows = allRecordedAt.length;
  if (totalRows === 0) {
    console.log(`[archive] No positions for ${year}-${month}-${day}`);
    return;
  }

  console.log(`[archive] Writing ${totalRows} positions to ${key}`);

  // Write Parquet in memory
  const parquetBytes = parquetWriteBuffer({
    columnData: [
      { name: "recorded_at", data: allRecordedAt, type: "STRING" },
      { name: "vehicle_id", data: allVehicleId, type: "STRING" },
      {
        name: "vehicle_num",
        data: allVehicleNum.map((v) => v ?? ""),
        type: "STRING",
      },
      {
        name: "route",
        data: allRoute.map((v) => v ?? ""),
        type: "STRING",
      },
      {
        name: "trip_id",
        data: allTripId.map((v) => v ?? ""),
        type: "STRING",
      },
      {
        name: "direction_id",
        data: allDirectionId.map((v) => v ?? -1),
        type: "INT32",
      },
      { name: "lat", data: allLat, type: "DOUBLE" },
      { name: "lon", data: allLon, type: "DOUBLE" },
      {
        name: "speed",
        data: allSpeed.map((v) => v ?? -1),
        type: "FLOAT",
      },
      {
        name: "heading",
        data: allHeading.map((v) => v ?? -1),
        type: "FLOAT",
      },
    ],
  });

  // Upload to R2
  const body = Buffer.from(parquetBytes);
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/vnd.apache.parquet",
      Metadata: {
        rows: String(totalRows),
        date: `${year}-${month}-${day}`,
      },
    })
  );

  const elapsed = Date.now() - startTime;
  const sizeMB = (body.byteLength / 1024 / 1024).toFixed(2);
  console.log(
    `[archive] Archived ${totalRows} positions (${sizeMB} MB) to ${key} in ${elapsed}ms`
  );
}
