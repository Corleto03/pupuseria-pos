/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F3EEE6",
        ink: "#1C1714",
        mute: "#6F675E",
        line: "#E4DCD0",
        clay: "#C2410C",
        moss: "#2F6B45",
        wine: "#B42318",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(28,23,20,0.04), 0 12px 32px -20px rgba(28,23,20,0.35)",
      },
    },
  },
  plugins: [],
};
