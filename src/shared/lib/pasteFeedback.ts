/** How long the check mark shows before the window hides for the paste. */
export const PASTE_CONFIRM_MS = 40;

const CONFIRM_ATTR = "data-paste-confirm";

/**
 * Shows the check mark on a card (styles/components/press-feedback.css) and
 * resolves once it has been seen. Set as an attribute, not a class: React
 * rewrites className on the re-render a paste causes.
 *
 * Resolves at once when nothing is on screen to confirm (a quick-paste key
 * while the window is hidden, an entry scrolled out of the list).
 */
export const showPasteConfirm = (card: Element | null, holdMs = PASTE_CONFIRM_MS): Promise<void> => {
  if (!(card instanceof HTMLElement) || document.visibilityState !== "visible") {
    return Promise.resolve();
  }
  card.setAttribute(CONFIRM_ATTR, "");
  // Cleared once the window is gone too, so it does not reopen still ticked.
  const clear = () => {
    card.removeAttribute(CONFIRM_ATTR);
    document.removeEventListener("visibilitychange", clear);
  };
  document.addEventListener("visibilitychange", clear);
  window.setTimeout(clear, holdMs + 600);
  return new Promise((resolve) => window.setTimeout(resolve, holdMs));
};

export const clipboardCard = (id: number): Element | null =>
  document.querySelector(`[data-clipboard-item-id="${id}"]`);
