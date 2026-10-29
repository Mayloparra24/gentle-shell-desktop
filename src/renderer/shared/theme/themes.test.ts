/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ID, THEMES, isThemeId } from "./themes";

// Read from disk: vitest runs with css: false, which would blank a ?raw import.
const css = readFileSync(resolve(import.meta.dirname, "tokens.css"), "utf8");
const COLOR_TOKENS = [
  "--bg",
  "--panel",
  "--raised",
  "--line",
  "--line-strong",
  "--text",
  "--text-2",
  "--muted",
  "--accent",
  "--accent-active",
  "--blue",
  "--green",
  "--amber",
  "--red",
  "--purple",
  "--champagne",
];

function blockFor(id: string): string {
  const start = css.indexOf(`[data-theme="${id}"]`);
  expect(start, `tokens.css has a block for ${id}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("themes", () => {
  it("offers the three gentle-shell themes, Gentleman-Cute first", () => {
    expect(THEMES.map((theme) => theme.label)).toEqual(["Gentleman-Cute", "Gentle", "Gentleman-Sexy"]);
    expect(DEFAULT_THEME_ID).toBe("gentleman-cute");
  });

  it("recognizes only known theme ids", () => {
    expect(isThemeId("gentle")).toBe(true);
    expect(isThemeId("solarized")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it.each(THEMES.filter((theme) => theme.id !== DEFAULT_THEME_ID))("tokens.css overrides every color for $label", ({ id }) => {
    const block = blockFor(id);
    for (const token of COLOR_TOKENS) {
      expect(block, `${id} defines ${token}`).toContain(`${token}:`);
    }
  });
});
