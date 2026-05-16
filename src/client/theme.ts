const theme = {
  colors: {
    // Ink / text colors
    ink: "#2A0E1A",      // primary text
    ink2: "#6B3450",     // secondary text
    ink3: "#A87B95",     // tertiary / placeholder
    
    // Brand pink (primary action)
    pinkJelly: "rgba(255, 79, 138, 0.85)",
    pinkJellySoft: "rgba(255, 142, 178, 0.7)",
    pinkRim: "rgba(255, 200, 220, 0.9)",
    pinkShadow: "rgba(255, 79, 138, 0.35)",
    
    // Glass tiers
    glass1: "rgba(255, 255, 255, 0.55)",  // primary surface — heavy frost
    glass2: "rgba(255, 255, 255, 0.32)",  // secondary — medium frost
    glass3: "rgba(255, 255, 255, 0.15)",  // tertiary / chips
    glassRim: "rgba(255, 255, 255, 0.85)",
    
    // Category jellies
    mint: "rgba(140, 220, 180, 0.75)",
    butter: "rgba(250, 235, 165, 0.85)",
    coral: "rgba(255, 130, 165, 0.85)",
    lilac: "rgba(200, 175, 235, 0.75)",
    
    // For backwards compatibility / non-glassy parts if needed
    bg: "#ffffff",
    bgAlt: "#fafaf8",
    bgSubtle: "#f5f5f3",
    text: "#2A0E1A",
    textMuted: "#6B3450",
    primary: "#FF4F8A",
    primaryHover: "#FF3B7A",
    primaryLight: "#FFE8F0",
    border: "#E5E5E5",
    borderLight: "#F0F0F0",
    error: "#ef4444",
    success: "#10b981",
  },
  spacing: (n: number) => `${n * 0.25}rem`,
  radius: "24px",        // glass card radius
  radiusSm: "8px",       // small radius
  radiusBubble: "24px",  // chat bubble radius
  radiusCard: "20px",    // card radius
  radiusPanel: "32px",   // panel radius
  radiusInput: "50px",   // input radius
  radiusLarge: "40px",   // large radius
  shadowGlass: "0 12px 32px -12px rgba(255, 79, 138, 0.35)",  // pink-tinted shadow
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)",
  shadowLg: "0 10px 24px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)",
  shadowAiBubble: "0 8px 24px rgba(167, 139, 250, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -2px 8px rgba(0, 0, 0, 0.08)",
  shadowUserBubble: "0 8px 24px rgba(217, 70, 166, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 8px rgba(0, 0, 0, 0.1)",
  shadowPanel: "0 16px 48px rgba(217, 70, 166, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
  // Type scale — designed for phone first
  fontSize: {
    caption: "0.6875rem",  // 11px — labels, metadata
    xs: "0.75rem",         // 12px
    sm: "0.875rem",        // 14px — body text
    base: "1rem",          // 16px — standard
    lg: "1.125rem",        // 18px — subheading
    xl: "1.5rem",          // 24px — display medium
    display: "2.125rem",   // 34px — screen titles
    displayLarge: "3.125rem", // 50px — welcome hero
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
    phone: "640px",
    tablet: "768px",
    desktop: "1024px",
    tabletLarge: "1024px",
  },
  gradients: {
    button: "linear-gradient(180deg, #FF6FA0 0%, #FF3B7A 100%)",
    logo: "linear-gradient(135deg, #FF4F8A, #A78BFA)",
    headerText: "linear-gradient(135deg, #FF4F8A, #7C3AED)",
    avatarUser: "linear-gradient(135deg, #FF4F8A, #A78BFA)",
    pageBackground: "linear-gradient(135deg, #FFE2EC 0%, #E2C4ED 100%)",
    userMessage: "linear-gradient(135deg, rgba(217, 70, 166, 0.92), rgba(236, 72, 153, 0.92))",
    aiMessage: "linear-gradient(135deg, rgba(167, 139, 250, 0.95), rgba(192, 132, 252, 0.95))",
    scrollbar: "linear-gradient(180deg, #FF4F8A, #A78BFA)",
    confidenceText: "linear-gradient(135deg, #FF4F8A, #A78BFA)",
    suggestionsTitle: "linear-gradient(135deg, #FF4F8A, #7C3AED)",
  },
} as const;

type AppTheme = typeof theme;

declare global {
  namespace FlowCss {
    interface Theme extends AppTheme {}
  }
}

export default theme;
