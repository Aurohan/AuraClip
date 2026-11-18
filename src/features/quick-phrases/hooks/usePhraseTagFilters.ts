import { useMemo } from "react";
import type { QuickPhrase } from "../../../shared/types";
import { sortPhrasePins } from "../lib/phrasePins";
import { matchesTextOrPinyin } from "../../../shared/lib/pinyinMatch";

/** Filtering and counts for the phrase tag manager. */
export function usePhraseTagFilters(
  phrases: QuickPhrase[],
  pins: number[],
  tagSearch: string,
  selectedTag: string | null,
  phraseSearch: string,
  extraTags: string[] = []
) {
  const tagList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tg of extraTags) {
      if (tg && tg !== "sensitive") counts[tg] = counts[tg] ?? 0;
    }
    phrases.forEach((p) => {
      p.tags?.forEach((tag) => {
        if (!tag) return;
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [phrases, extraTags]);

  const filteredTagList = useMemo(() => {
    const q = tagSearch.trim();
    if (!q) return tagList;
    return tagList.filter((item) => matchesTextOrPinyin(item.name, q));
  }, [tagList, tagSearch]);

  const displayPhrases = useMemo(() => {
    return sortPhrasePins(
      phrases.filter((p) => {
        if (selectedTag !== null && !p.tags?.includes(selectedTag)) {
          return false;
        }
        const q = phraseSearch.trim();
        if (q) {
          return Boolean(
            matchesTextOrPinyin(p.title, q) ||
              matchesTextOrPinyin(p.content, q) ||
              p.tags?.some((t) => matchesTextOrPinyin(t, q))
          );
        }
        return true;
      }),
      pins
    );
  }, [phrases, selectedTag, phraseSearch, pins]);

  return { tagList, filteredTagList, displayPhrases };
}
