/**
 * The gentle-shell themes the picker offers. Only ids and labels live here;
 * the color values live in tokens.css (`:root` is Gentleman-Cute, the other
 * two are `[data-theme="<id>"]` overrides) so there is one place to read
 * them. themes.test.ts checks that every non-default theme overrides every
 * color token. Values come from gentle-pi's themes/*.json; following the
 * user's live pi theme is still deferred (ADR 0009).
 */
export const THEMES = [
  { id: "gentleman-cute", label: "Gentleman-Cute" },
  { id: "gentle", label: "Gentle" },
  { id: "gentleman-sexy", label: "Gentleman-Sexy" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME_ID: ThemeId = "gentleman-cute";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
