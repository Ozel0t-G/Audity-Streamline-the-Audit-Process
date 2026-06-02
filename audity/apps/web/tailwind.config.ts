import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        audity: {
          app: "#111315",
          page: "#151719",
          panel: "#202225",
          panelAlt: "#242628",
          tableHeader: "#2A2D30",
          sidebar: "#1E2124",
          topnav: "#061E3A",
          border: "#34383D",
          borderStrong: "#3F444A",
          primary: "#008CFF",
          primaryHover: "#00A3FF",
          primaryActive: "#006BD6",
          text: "#F4F6F8",
          secondary: "#A8B0BA",
          muted: "#7C858F",
          success: "#2ECC71",
          warning: "#F5A400",
          error: "#FF4B00"
        }
      },
      borderRadius: {
        audity: "6px"
      }
    }
  },
  plugins: []
} satisfies Config;
