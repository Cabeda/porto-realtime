import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic surface colors
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          sunken: "var(--color-surface-sunken)",
          overlay: "var(--color-surface-overlay)",
        },
        // Semantic text colors
        content: {
          DEFAULT: "var(--color-content)",
          secondary: "var(--color-content-secondary)",
          muted: "var(--color-content-muted)",
          inverse: "var(--color-content-inverse)",
        },
        // Accent / interactive
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          subtle: "var(--color-accent-subtle)",
        },
        // Borders
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        // Status colors
        status: {
          live: "var(--color-status-live)",
          delayed: "var(--color-status-delayed)",
          error: "var(--color-status-error)",
          urgent: "var(--color-status-urgent)",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
