import { memo, useEffect, useRef, useState } from "react";

interface ScrollToTopButtonProps {
  visible: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}

/**
 * Shared floating back-to-top launcher across Clipboard and Quick Phrases.
 * Stays quietly frosted at rest and emits a theme-matched Aurora accent sweep
 * on hover or click burst, fading smoothly in/out instead of abrupt mount/unmount.
 */
function ScrollToTopButton({ visible, label, onClick, className }: ScrollToTopButtonProps) {
  const [bursting, setBursting] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={[
        "aurora-scroll-top",
        visible ? "is-visible" : "",
        bursting ? "is-bursting" : "",
        className || "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (!visible) return;
        e.stopPropagation();
        setBursting(true);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setBursting(false);
          timerRef.current = null;
        }, 620);
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      <span className="aurora-scroll-top-halo" aria-hidden="true" />
      <span className="aurora-scroll-top-ring" aria-hidden="true" />
      <span className="aurora-scroll-top-core" aria-hidden="true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="aurora-scroll-top-glyph"
        >
          <path
            d="M6.25 4.25H13.75"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            opacity="0.72"
          />
          <path
            d="M5.5 11.75L10 7.25L14.5 11.75"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 8V15.75"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  );
}

export default memo(ScrollToTopButton);
