import { useMemo } from "react";
import type { QuickPhrase } from "../../../shared/types";
import { sortPhrasePins } from "../lib/phrasePins";

/** Filtering and counts for the phrase tag manager. */
export function usePhraseTagFilters(phrases: QuickPhrase[], pins: number[], tagSearch: string, selectedTag: string | null, phraseSearch: string) {
  // Aggregate tags and counts
  const tagList = useMemo(() => {
    const counts: Record<string, number> = {};
    phrases.forEach((p) => {
      p.tags?.forEach((tag) => {
        if (!tag) return;
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [phrases]);

  // Filtered tags for sidebar search
  const filteredTagList = useMemo(() => {
    if (!tagSearch.trim()) return tagList;
    const q = tagSearch.toLowerCase();
    return tagList.filter((item) => item.name.toLowerCase().includes(q));
  }, [tagList, tagSearch]);

  // Phrases filtered by selected tag and phraseSearch
  const displayPhrases = useMemo(() => {
    return sortPhrasePins(phrases.filter((p) => {
      if (selectedTag !== null) {
        if (!p.tags?.includes(selectedTag)) return false;
      }
      if (phraseSearch.trim()) {
        const q = phraseSearch.toLowerCase();
        const inTitle = p.title.toLowerCase().includes(q);
        const inContent = p.content.toLowerCase().includes(q);
        const inTags = p.tags?.some((t) => t.toLowerCase().includes(q));
        return inTitle || inContent || inTags;
      }
      return true;
    }), pins);
  }, [phrases, selectedTag, phraseSearch, pins]);

  return { filteredTagList, displayPhrases };
}
