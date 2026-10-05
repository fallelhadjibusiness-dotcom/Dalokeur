import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        emerald: { 50: "#ecf7f2", 100: "#d2eee2", 500: "#1f8f6a", 600: "#0f6b4d", 700: "#0a5a40", 800: "#08463a", 900: "#06362d" },
        amber: { 100: "#fbefd0", 400: "#e9b44c", 500: "#d99a1f", 600: "#7a5200" },
        cream: { DEFAULT: "#fbf7ee", 100: "#f4eedd" },
        ink: { DEFAULT: "#1d2a24", soft: "#5b6b63" },
      },
      fontFamily: { sans: ["var(--font-nunito)", "system-ui", "sans-serif"] },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
} satisfies Config;
