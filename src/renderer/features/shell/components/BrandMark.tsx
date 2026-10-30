const PETAL_ANGLES = [0, 72, 144, 216, 288] as const;

/** The Gentleman flower, drawn so it follows the theme through currentColor instead of a text glyph. */
export function BrandMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor">
        {PETAL_ANGLES.map((angle) => (
          <ellipse key={angle} cx="12" cy="6.2" rx="2.5" ry="3.6" transform={`rotate(${angle} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="2.1" fill="var(--panel)" />
      </g>
    </svg>
  );
}
