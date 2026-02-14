import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use process.env with a placeholder fallback so `prisma generate` works
    // in CI/build environments where DATABASE_URL may not be set.
    // The real URL is required at runtime (migrations, queries), not at generation time.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
