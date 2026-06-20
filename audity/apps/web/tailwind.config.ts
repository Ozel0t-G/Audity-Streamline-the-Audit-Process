import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        audity: {
          app: "var(--color-bg-app)",
          page: "var(--color-bg-page)",
          panel: "var(--color-bg-panel)",
          panelAlt: "var(--color-bg-panel-alt)",
          tableHeader: "var(--color-bg-table-header)",
          sidebar: "var(--color-bg-sidebar)",
          topnav: "var(--color-bg-topnav)",
          border: "var(--color-border-subtle)",
          borderStrong: "var(--color-border-strong)",
          primary: "var(--color-primary)",
          primaryHover: "var(--color-primary-hover)",
          primaryActive: "var(--color-primary-active)",
          accent: "var(--color-accent)",
          accentSoft: "var(--color-accent-soft)",
          text: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          success: "var(--color-success)",
          warning: "var(--color-warning)",
          error: "var(--color-error)"
        }
      },
      borderRadius: {
        "audity-xs": "var(--radius-xs)",
        audity: "var(--radius-sm)",
        "audity-md": "var(--radius-md)",
        "audity-lg": "var(--radius-lg)",
        "audity-button": "var(--radius-button)"
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      },
      boxShadow: {
        "audity-soft": "var(--shadow-soft)",
        "audity-raised": "var(--shadow-raised)"
      }
    }
  },
  plugins: []
} satisfies Config;
