const theme = {
  colors: {
    bg: "#ffffff",
    bgAlt: "#fafaf8",
    bgSubtle: "#f5f5f3",
    text: "#1a1a1a",
    textMuted: "#6b7280",
    // Old primary (kept for backwards compatibility)
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    primaryLight: "#eef2ff",
    border: "#d1d5db",
    borderLight: "#e5e7eb",
    success: "#10b981",
    error: "#ef4444",
    // New Playful Bubbly palette
    pink: "#d946a6",
    hotPink: "#ec4899",
    violet: "#a78bfa",
    deepPurple: "#7c3aed",
    lightPurple: "#c084fc",
  },
  spacing: (n: number) => `${n * 0.25}rem`,
  radius: "0.5rem",
  radiusSm: "0.375rem",
  // New radii for the playful design system
  radiusBubble: "24px",
  radiusCard: "20px",
  radiusPanel: "32px",
  radiusInput: "50px",
  radiusLarge: "40px",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)",
  shadowLg: "0 10px 24px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)",
  // New gradient-aware shadows for bubbles
  shadowAiBubble: "0 8px 24px rgba(167, 139, 250, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 8px rgba(0, 0, 0, 0.08)",
  shadowUserBubble: "0 8px 24px rgba(217, 70, 166, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 8px rgba(0, 0, 0, 0.1)",
  shadowPanel: "0 16px 48px rgba(217, 70, 166, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
  // Gradients for the design system
  gradients: {
    pageBackground: "linear-gradient(135deg, #fce4ec 0%, #f3e5f5 25%, #ede7f6 50%, #e0f2f1 75%, #f0f9ff 100%)",
    aiMessage: "linear-gradient(135deg, rgba(167, 139, 250, 0.95), rgba(192, 132, 252, 0.95))",
    userMessage: "linear-gradient(135deg, rgba(217, 70, 166, 0.92), rgba(236, 72, 153, 0.92))",
    button: "linear-gradient(135deg, #d946a6, #ec4899)",
    avatarAi: "linear-gradient(135deg, #a78bfa, #c084fc)",
    avatarUser: "linear-gradient(135deg, #d946a6, #ec4899)",
    logo: "linear-gradient(135deg, #ec4899, #a78bfa)",
    confidenceText: "linear-gradient(135deg, #ec4899, #a78bfa)",
    headerText: "linear-gradient(135deg, #d946a6, #7c3aed)",
    suggestionsTitle: "linear-gradient(135deg, #d946a6, #7c3aed)",
    scrollbar: "linear-gradient(180deg, #ec4899, #a78bfa)",
  },
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
