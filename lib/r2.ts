/**
 * Cloudflare R2 client for the Next.js app.
 * Used to generate presigned URLs for Parquet file downloads.
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "porto-move";

let _client: S3Client | null = null;

function getClient(): S3Client | null {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

/**
 * List available position archive dates from R2.
 * Returns dates in YYYY-MM-DD format, sorted descending.
 */
export async function listArchiveDates(): Promise<string[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: "positions/",
      })
    );

    const dates: string[] = [];
    for (const obj of result.Contents ?? []) {
      // Key format: positions/YYYY/MM/DD.parquet
      const match = obj.Key?.match(
        /^positions\/(\d{4})\/(\d{2})\/(\d{2})\.parquet$/
      );
      if (match) {
        dates.push(`${match[1]}-${match[2]}-${match[3]}`);
      }
    }

    return dates.sort().reverse();
  } catch (error) {
    console.error("R2 list error:", error);
    return [];
  }
}

/**
 * Generate a presigned URL for a position archive Parquet file.
 * URL is valid for 1 hour. Zero egress cost on R2.
 */
export async function getArchiveUrl(
  date: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const [year, month, day] = date.split("-");
  const key = `positions/${year}/${month}/${day}.parquet`;

  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
      { expiresIn: 3600 }
    );
    return url;
  } catch (error) {
    console.error("R2 presign error:", error);
    return null;
  }
}

/**
 * Check if R2 is configured.
 */
export function isR2Configured(): boolean {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}
