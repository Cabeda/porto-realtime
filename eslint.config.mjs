import nextConfig from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const eslintConfig = [
  ...nextConfig,
  ...coreWebVitals,
  // Enable all React Compiler rules (Rules of React) at error level
  {
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/void-use-memo": "error",
      "react-hooks/component-hook-factories": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/immutability": "error",
      "react-hooks/globals": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/purity": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/unsupported-syntax": "warn",
      "react-hooks/config": "error",
      "react-hooks/gating": "error",
    },
  },
  {
    // Ignore generated / non-app code
    ignores: ["coverage/**", "public/**", "scripts/**", "prisma/generated/**"],
  },
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
      // Complexity limits
      complexity: ["warn", { max: 15 }],
      "max-lines-per-function": ["warn", { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Relax rules for test files
    files: ["__tests__/**/*", "tests/**/*"],
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      complexity: "off",
    },
  },
];

export default eslintConfig;
