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
        paper: "#F7F5F0",
        ink: "#18181B",
        mute: "#66615B",
        line: "#E2DDD5",
        clay: "#C2410C",
        moss: "#15803D",
        wine: "#B91C1C",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.04)",
        modal: "0 4px 20px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};
