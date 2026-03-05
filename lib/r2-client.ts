/**
 * R2 client for reading analytics snapshots written by the worker.
 * Uses the same env vars as the worker: R2_ENDPOINT, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

let _client: S3Client | null = null;
let _bucket: string | null = null;

function getClient(): { client: S3Client; bucket: string } | null {
  if (_client && _bucket) return { client: _client, bucket: _bucket };

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET ?? "porto-move";

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  _client = new S3Client({
    endpoint,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  _bucket = bucket;
  return { client: _client, bucket: _bucket };
}

/** Fetch and parse a JSON object from R2. Returns null if R2 is not configured or key not found. */
export async function getR2Json<T = unknown>(key: string): Promise<T | null> {
  const r2 = getClient();
  if (!r2) return null;

  try {
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    const body = await res.Body?.transformToString("utf-8");
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
