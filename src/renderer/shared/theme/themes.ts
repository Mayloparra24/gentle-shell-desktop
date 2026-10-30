import { THEME_IDS, type ThemeId } from "@shared/theme";
export { isThemeId, type ThemeId } from "@shared/theme";

/**
 * The gentle-shell themes the picker offers. Only ids and labels live here;
 * the color values live in tokens.css (`:root` is Gentleman-Cute, the other
 * two are `[data-theme="<id>"]` overrides) so there is one place to read
 * them. themes.test.ts checks that every non-default theme overrides every
 * color token. Values come from gentle-pi's themes/*.json; following the
 * user's live pi theme is still deferred (ADR 0009).
 */
export const THEMES = [
  { id: THEME_IDS.GENTLEMAN_CUTE, label: "Gentleman-Cute" },
  { id: THEME_IDS.GENTLE, label: "Gentle" },
  { id: THEME_IDS.GENTLEMAN_SEXY, label: "Gentleman-Sexy" },
] as const;

export const DEFAULT_THEME_ID: ThemeId = THEME_IDS.GENTLEMAN_CUTE;
