#!/usr/bin/env node

/**
 * Reset all check-ins in development.
 *
 * Usage:
 *   node scripts/reset-checkins.mjs [baseUrl]
 *
 * Examples:
 *   node scripts/reset-checkins.mjs                    # localhost:3000
 *   node scripts/reset-checkins.mjs http://localhost:3001
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";

async function main() {
  console.log(`\n🗑️  Resetting all check-ins on ${BASE_URL}\n`);

  try {
    const res = await fetch(`${BASE_URL}/api/checkin/reset`, { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      console.log(`✅ Deleted ${data.deleted} check-ins`);
    } else {
      console.log(`✗ ${data.error || res.status}`);
    }
  } catch (err) {
    console.log(`✗ ${err.message}`);
  }

  // Verify
  try {
    const statsRes = await fetch(`${BASE_URL}/api/checkin/stats`);
    const stats = await statsRes.json();
    console.log(`\n📊 Current stats:`);
    console.log(`   Active: ${stats.total} check-ins`);
    console.log(`   By mode:`, stats.byMode);
  } catch {
    console.log("\n⚠️  Could not fetch stats");
  }
}

main();
