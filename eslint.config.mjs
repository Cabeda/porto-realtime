import nextConfig from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextConfig,
  ...coreWebVitals,
  {
    // TypeScript-specific overrides (plugin registered by eslint-config-next for TS files)
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // General rules for all files
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // React compiler rules — downgrade to warn for imperative code (Leaflet maps, etc.)
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    // Relax rules for test files
    files: ["__tests__/**/*", "tests/**/*"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
