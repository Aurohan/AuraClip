import type { ClipboardEntry } from "../types";
import type { ParsedSearchQuery } from "./searchQuery";
import { matchesTextOrPinyin } from "./pinyinMatch";

const TEXT_TYPES = new Set(["text", "code", "url", "rich_text"]);
export const IMAGE_OCR_PREFIX = "[OCR] ";

export function extractImageOcrText(item: Pick<ClipboardEntry, "content_type" | "preview">): string {
  if (item.content_type !== "image" || !item.preview) return "";
  const trimmed = item.preview.trim();
  return trimmed.startsWith(IMAGE_OCR_PREFIX)
    ? trimmed.slice(IMAGE_OCR_PREFIX.length).trim()
    : "";
}

export function entryMatchesSearch(
  item: ClipboardEntry,
  parsed: ParsedSearchQuery,
  options?: { isServerSearchResult?: boolean } | boolean
): boolean {
  const isServerMatch =
    typeof options === "boolean"
      ? options
      : options?.isServerSearchResult ??
        ((item as any)._serverSearchMatched === parsed.raw ||
         (item as any).server_matched === true);

  const { term, tagOnly, noteOnly } = parsed;

  if (tagOnly) {
    if (!term) return false;
    return item.tags?.some((tag) => tag.toLowerCase() === term) ?? false;
  }

  if (noteOnly) {
    const note = item.note?.trim() ?? "";
    if (!note) return false;
    if (!term) return true;
    return matchesTextOrPinyin(note, term);
  }

  if (!term) {
    return true;
  }

  if (item.tags?.some((tag) => matchesTextOrPinyin(tag, term))) {
    return true;
  }

  if (item.source_app && matchesTextOrPinyin(item.source_app, term)) {
    return true;
  }

  if (item.note && matchesTextOrPinyin(item.note, term)) {
    return true;
  }

  if (item.content_type === "image") {
    const ocrText = extractImageOcrText(item);
    return ocrText ? matchesTextOrPinyin(ocrText, term) : false;
  }

  if (TEXT_TYPES.has(item.content_type)) {
    if (item.preview && matchesTextOrPinyin(item.preview, term)) {
      return true;
    }
    if (item.content && matchesTextOrPinyin(item.content, term)) {
      return true;
    }
    if (isServerMatch && item.content?.includes("... [Truncated for speed]")) {
      return true;
    }
    return false;
  }

  return false;
}
