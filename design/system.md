# Design system (synced)

Source: `src/renderer/shared/theme/tokens.css` (Gentleman-Cute, mirrored in `gentleman-cute.json`). Only values found there are listed.

## Colors
| Token | Value | Usage |
| --- | --- | --- |
| --bg | #060407 | App background |
| --panel | #100a0f | Panels, sidebars |
| --raised | #180e15 | Raised surfaces, cards |
| --line | #2a1720 | Subtle borders |
| --line-strong | #563040 | Strong borders, scrollbar thumb |
| --text | #f6eff3 | Primary text |
| --text-2 | #d2cbd0 | Secondary text |
| --muted | #a78e9b | Muted text |
| --accent | #f095c8 | Accent |
| --accent-active | #ffb1dd | Active accent |
| --blue | #a9c7ee | Info |
| --green | #b4e7c7 | Success |
| --amber | #f2b86d | Warning |
| --red | #ff718f | Error |
| --purple | #c96aa2 | Scrollbar hover, secondary accent |
| --champagne | #e0c27a | Highlight |

## Typography
- --font-display: "Space Grotesk", "Segoe UI", system-ui, sans-serif
- --font-body: "Inter", "Segoe UI", system-ui, sans-serif
- --font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace

## Spacing, radius, shadows
Not defined in the sources.

## Components
Scrollbars: 8px, thin, thumb --line-strong, hover --purple. No other component rules in the sources.

## Themes (added with the web shell)
Source: `src/renderer/shared/theme/tokens.css`. `:root` is Gentleman-Cute. `[data-theme="gentle"]` and `[data-theme="gentleman-sexy"]` override the same 16 color tokens with values from gentle-pi's `themes/Gentle.json` and `themes/Gentleman-Sexy.json`. The renderer picks one with the Theme select in the top bar and stores it under `gentle.theme`.
