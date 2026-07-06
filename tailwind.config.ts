import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#16212f",
        muted: "#65758b",
        panel: "#ffffff",
        line: "#d8dee8",
        profit: "#0f8f55",
        loss: "#c93434",
        brand: "#2563eb",
        amber: "#b7791f"
      },
      boxShadow: {
        soft: "0 8px 30px rgba(22, 33, 47, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
