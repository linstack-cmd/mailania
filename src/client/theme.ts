const theme = {
  colors: {
    bg: "#ffffff",
    bgAlt: "#fafaf8",
    bgSubtle: "#f5f5f3",
    text: "#1a1a1a",
    textMuted: "#6b7280",
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    primaryLight: "#eef2ff",
    border: "#d1d5db",
    borderLight: "#e5e7eb",
    success: "#10b981",
    error: "#ef4444",
  },
  spacing: (n: number) => `${n * 0.25}rem`,
  radius: "0.5rem",
  radiusSm: "0.375rem",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)",
  shadowLg: "0 10px 24px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)",
  // Type scale — 5 standard sizes
  fontSize: {
    xs: "0.75rem",     // 12px — for metadata, badges
    sm: "0.875rem",    // 14px — for secondary text
    base: "1rem",      // 16px — for body text
    lg: "1.125rem",    // 18px — for subheadings
    xl: "1.5rem",      // 24px — for page headings
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.35,
    normal: 1.5,
    relaxed: 1.6,
  },
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
