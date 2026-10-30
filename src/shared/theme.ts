/** Closed set of desktop themes shared by main and renderer. */
export const THEME_IDS = {
  GENTLEMAN_CUTE: "gentleman-cute",
  GENTLE: "gentle",
  GENTLEMAN_SEXY: "gentleman-sexy",
} as const;

export type ThemeId = (typeof THEME_IDS)[keyof typeof THEME_IDS];

export function isThemeId(value: unknown): value is ThemeId {
  return Object.values(THEME_IDS).some((id) => id === value);
}
