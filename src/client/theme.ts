const theme = {
  colors: {
    bg: "#ffffff",
    bgAlt: "#fafafa",
    text: "#1a1a1a",
    textMuted: "#6b7280",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    border: "#e5e7eb",
    borderLight: "#f3f4f6",
    success: "#10b981",
    error: "#ef4444",
  },
  spacing: (n: number) => `${n * 0.25}rem`,
  radius: "0.5rem",
  radiusSm: "0.375rem",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)",
  breakpoints: {
    mobile: "640px",
    tablet: "768px",
    desktop: "1024px",
  },
} as const;

type AppTheme = typeof theme;

declare global {
  namespace FlowCss {
    interface Theme extends AppTheme {}
  }
}

export default theme;
