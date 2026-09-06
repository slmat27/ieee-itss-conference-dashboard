export const typography = {
  fontFamilyBase:
    'Roboto, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontWeightNormal: 400,
  fontWeightStrong: 600,
  fontSizeSm: 12,
  fontSizeBase: 14,
  fontSizeLg: 16,
  fontSizeXl: 20,
  fontSizeHeading1: 38,
  fontSizeHeading2: 30,
  fontSizeHeading3: 24,
  fontSizeHeading4: 20,
  fontSizeHeading5: 16,
  lineHeightBase: 1.5,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const layout = {
  headerHeight: 64,
  contentMaxWidth: 1440,
  navbarBrandWidth: 225,
  navbarLogoWidth: 102,
  navbarLogoHeight: 57,
  pagePaddingX: 24,
  pagePaddingXMobile: 16,
  pagePaddingY: 28,
  pagePaddingYMobile: 18,
} as const;

export const controls = {
  heightSm: 32,
  heightMd: 40,
  heightLg: 44,
  iconSize: 16,
  headerIconSize: 18,
  menuItemHeight: 40,
  menuSubitemIconSize: 12,
} as const;

export const borders = {
  lineWidth: 1,
  lineWidthBold: 2,
} as const;

export const shadows = {
  surface: "0 1px 2px rgba(18, 59, 93, 0.06), 0 8px 24px rgba(18, 59, 93, 0.08)",
  panel: "0 16px 40px rgba(18, 59, 93, 0.10)",
  focus: "0 0 0 4px rgba(0, 98, 155, 0.12)",
  soft: "0 12px 30px rgba(18, 59, 93, 0.08)",
  elevated: "0 24px 60px rgba(18, 59, 93, 0.12)",
  primaryButton: "0 10px 24px rgba(0, 98, 155, 0.18)",
} as const;

export const breakpoints = {
  lg: 1100,
  sm: 640,
} as const;
