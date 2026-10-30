/**
 * Pure description of the frameless window chrome (no Electron imports, so it
 * is testable without a real BrowserWindow). The renderer draws the title bar;
 * on Windows and Linux the native window controls stay as an overlay painted
 * with the theme colors, on macOS the traffic lights are placed inside the bar.
 */

/** Height of the renderer's title bar in CSS pixels; the overlay and the bar must agree. */
export const TITLE_BAR_HEIGHT = 36;

const TRAFFIC_LIGHT_SIZE = 12;
const TRAFFIC_LIGHT_INSET = 14;

export interface OverlayColors {
  /** Background behind the native controls: the bar's --panel. */
  readonly color: string;
  /** Glyph color of the native controls: the bar's --text-2. */
  readonly symbolColor: string;
}

/** Gentleman-Cute, the default theme (src/renderer/shared/theme/tokens.css). */
export const DEFAULT_OVERLAY_COLORS: OverlayColors = { color: "#100a0f", symbolColor: "#d2cbd0" };

export interface WindowChrome {
  readonly titleBarStyle: "hidden";
  readonly titleBarOverlay?: OverlayColors & { readonly height: number };
  readonly trafficLightPosition?: { readonly x: number; readonly y: number };
}

export function windowChrome(platform: NodeJS.Platform, colors: OverlayColors = DEFAULT_OVERLAY_COLORS): WindowChrome {
  if (platform === "darwin") {
    return { titleBarStyle: "hidden", trafficLightPosition: { x: TRAFFIC_LIGHT_INSET, y: (TITLE_BAR_HEIGHT - TRAFFIC_LIGHT_SIZE) / 2 } };
  }
  return { titleBarStyle: "hidden", titleBarOverlay: { ...colors, height: TITLE_BAR_HEIGHT } };
}
