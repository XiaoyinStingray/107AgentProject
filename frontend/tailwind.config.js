/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-primary": "#0a0a0f",
        "bg-secondary": "#12121a",
        "bg-card": "#1a1a26",
        border: "#2a2a3a",
        "text-primary": "#e0e0e0",
        "text-secondary": "#8888aa",
        "accent-green": "#00ff88",
        "accent-blue": "#4488ff",
        "accent-orange": "#ff8844",
        "accent-red": "#ff4466",
        "accent-purple": "#aa44ff",
        "accent-cyan": "#00ccff",
        "text-muted": "#666680",
        surface: "#1a1a28",
        "surface-dark": "#12121a",
        "surface-light": "#222233",
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        "pulse-green": "pulse-green 1.5s infinite",
        "slide-in": "slide-in 0.3s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
      },
      keyframes: {
        "pulse-green": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "slide-in": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
