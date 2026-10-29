import type { ClipboardSortMode } from "../../app/types";
import type { QuickPhrase } from "../../../shared/types";
import { comparePinPositions } from "./phrasePins";

function sortValue(phrase: QuickPhrase, mode: ClipboardSortMode): number {
  switch (mode) {
    case "created": return phrase.createdAt;
    case "last_used": return phrase.lastUsedAt ?? 0;
    case "usage": return phrase.useCount;
    default: return phrase.updatedAt;
  }
}

export function sortQuickPhrases(
  phrases: QuickPhrase[],
  pins: number[],
  mode: ClipboardSortMode,
): QuickPhrase[] {
  const positions = new Map(pins.map((id, index) => [id, index]));
  return phrases.slice().sort((a, b) => {
    const pinOrder = comparePinPositions(a.id, b.id, positions);
    if (pinOrder !== 0) return pinOrder;
    // Two pinned phrases retain the user's explicit pin order.
    if (positions.has(a.id) && positions.has(b.id)) return 0;
    return sortValue(b, mode) - sortValue(a, mode)
      || b.createdAt - a.createdAt
      || b.id - a.id;
  });
}
