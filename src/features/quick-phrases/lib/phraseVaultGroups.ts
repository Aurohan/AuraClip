import type { QuickPhrase } from "../../../shared/types";
import { extractInteractiveSlots } from "./phraseTemplateClient";

export type PhraseViewMode = "compact" | "grid" | "cards";

export const UNTAGGED_GROUP_KEY = "__untagged__";

export interface PhraseTagSection {
  key: string;
  label: string | null;
  phrases: QuickPhrase[];
}

/**
 * Group non-pinned phrases by their primary tag (following display order of tags)
 * so users scanning a long library can jump directly to a category and collapse noise.
 */
export function buildPhraseTagSections(
  phrases: QuickPhrase[],
  tagsOrder: string[]
): PhraseTagSection[] {
  if (phrases.length === 0) return [];

  const buckets = new Map<string, QuickPhrase[]>();
  for (const tag of tagsOrder) {
    if (tag) buckets.set(tag, []);
  }
  const untagged: QuickPhrase[] = [];

  for (const phrase of phrases) {
    const primaryTag = phrase.tags?.find((tg) => tg.trim().length > 0)?.trim();
    if (!primaryTag) {
      untagged.push(phrase);
      continue;
    }
    const list = buckets.get(primaryTag);
    if (list) list.push(phrase);
    else buckets.set(primaryTag, [phrase]);
  }

  const sections: PhraseTagSection[] = [];
  for (const [key, items] of buckets.entries()) {
    if (items.length > 0) {
      sections.push({ key, label: key, phrases: items });
    }
  }
  if (untagged.length > 0) {
    sections.push({ key: UNTAGGED_GROUP_KEY, label: null, phrases: untagged });
  }
  return sections;
}

/**
 * In 2-column Bento grid mode, short single-line values (emails, URLs, accounts, keys)
 * pack neatly side by side; multi-line blocks, templates, or long entries span both columns.
 */
export function isCompactGridWideItem(phrase: QuickPhrase): boolean {
  const trimmed = phrase.content.trim();
  if (trimmed.includes("\n") || trimmed.length > 44) return true;
  if (extractInteractiveSlots(trimmed).length > 0) return true;
  return false;
}

/** Rank tags by phrase usage count desc, then alphabetical so top tags always stay first. */
export function rankPhraseTags(
  allTags: string[],
  tagCounts: Map<string, number>
): string[] {
  return [...allTags].sort((a, b) => {
    const diff = (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b, "zh-CN");
  });
}

/** Format compact single-line preview for dense Vault Row & 2-col tiles. */
export function summarizePhraseValue(content: string): string {
  return content.replace(/\s*\r?\n\s*/g, " ↵ ").trim();
}
