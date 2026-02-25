/* eslint-disable no-console */
// Environment-aware structured logging utility
//
// Server-side (API routes, cron jobs): always logs — these run in Node.js
// where stdout is captured by the platform (Vercel, Docker, etc.).
//
// Client-side (components): only logs in development to keep the browser
// console clean in production.

const isServer = typeof window === "undefined";

export const logger = {
  log: (...args: unknown[]) => {
    if (isServer || process.env.NODE_ENV === "development") {
      console.log(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (isServer || process.env.NODE_ENV === "development") {
      console.info(...args);
    }
  },
  error: (...args: unknown[]) => {
    // Always log errors
    console.error(...args);
  },
  warn: (...args: unknown[]) => {
    if (isServer || process.env.NODE_ENV === "development") {
      console.warn(...args);
    }
  },
};
