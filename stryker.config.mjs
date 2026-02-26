/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  mutate: [
    "lib/**/*.ts",
    "!lib/**/*.test.ts",
    "!lib/hooks/**",
    "!lib/i18n.tsx",
    "!lib/auth.ts",
    "!lib/auth-client.ts",
    "!lib/prisma.ts",
  ],
  reporters: ["clear-text", "html"],
  htmlReporter: { fileName: "reports/mutation.html" },
  thresholds: { high: 80, low: 60, break: 50 },
  timeoutMS: 10000,
  concurrency: 4,
};
