import { memo } from "react";

interface PinGlyphProps {
  pinned?: boolean;
  size?: number;
  className?: string;
}

/**
 * Unified thumbtack icon used across window chrome, clipboard cards, and quick phrases.
 * Avoids the cluttered diagonal slash of PinOff: unpinned tilts softly at 36°,
 * pinned stands upright with a crisp filled head.
 */
function PinGlyph({ pinned = false, size = 14, className }: PinGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`aurora-pin-glyph${pinned ? " is-pinned" : ""}${className ? ` ${className}` : ""}`}
    >
      <path
        d="M5.25 2.25H10.75C11.1642 2.25 11.5 2.58579 11.5 3C11.5 3.34618 11.2654 3.63761 10.9463 3.72361L10.35 3.88427V6.85C10.35 7.36292 10.6119 7.84041 11.0447 8.11583L12.1165 8.79789C12.3554 8.9499 12.5 9.21365 12.5 9.49682C12.5 9.95421 12.1292 10.325 11.6718 10.325H4.32818C3.87079 10.325 3.5 9.95421 3.5 9.49682C3.5 9.21365 3.64461 8.9499 3.88348 8.79789L4.95529 8.11583C5.3881 7.84041 5.65 7.36292 5.65 6.85V3.88427L5.05372 3.72361C4.73461 3.63761 4.5 3.34618 4.5 3C4.5 2.58579 4.83579 2.25 5.25 2.25Z"
        fill={pinned ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 10.5V14.25"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default memo(PinGlyph);
