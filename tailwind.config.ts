import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        panel: "var(--color-panel)",
        panel2: "var(--color-panel-2)",
        line: "var(--color-line)",
        text: "var(--color-text)",
        muted: "var(--color-muted)",
        accent: "var(--color-accent)",
        accent2: "var(--color-accent-2)",
        good: "var(--color-good)",
        warn: "var(--color-warn)",
        bad: "var(--color-bad)"
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255,255,255,0.04), 0 18px 50px rgba(0,0,0,0.35)"
      },
      backgroundImage: {
        grid:
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;
