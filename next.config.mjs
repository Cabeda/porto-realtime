import withPWA from "@ducanh2912/next-pwa";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { version } = require("./package.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  // Explicitly configure Turbopack to silence webpack warning
  turbopack: {},
  // Security headers (GDPR, OWASP)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=(), interest-cohort=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
              "style-src 'self' 'unsafe-inline' https://unpkg.com",
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.google.com https://*.googleapis.com https://*.arcgisonline.com https://*.basemaps.cartocdn.com",
              "font-src 'self'",
              "connect-src 'self' https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.arcgisonline.com https://*.basemaps.cartocdn.com https://otp.services.porto.digital https://opendata.porto.digital https://accounts.google.com https://*.neon.tech",
              "frame-src https://accounts.google.com",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // Prevent caching of API responses that contain personal data
        source: "/api/checkin",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/api/account",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/api/feedback/report",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // Never cache API routes that contain personal or session-specific data
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        // Exclude personal API routes from any caching
        urlPattern: /\/api\/(checkin|account|feedback\/report|feedback\/vote)/,
        handler: "NetworkOnly",
      },
      {
        urlPattern: /^https:\/\/otp\.services\.porto\.digital\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "otp-api-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
          networkTimeoutSeconds: 10,
        },
      },
      {
        urlPattern: /^https:\/\/opendata\.porto\.digital\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "fiware-api-cache",
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 5 * 60, // 5 minutes
          },
          networkTimeoutSeconds: 10,
        },
      },
      {
        urlPattern: /^https:\/\/.+\.tile\.openstreetmap\.org\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "osm-tiles",
          expiration: {
            maxEntries: 500,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
    ],
  },
})(nextConfig);
