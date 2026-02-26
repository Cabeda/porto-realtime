/**
 * Prisma client for the worker (Neon serverless adapter)
 */

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString });
export const prisma = new PrismaClient({ adapter });
