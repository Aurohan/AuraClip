import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriRuntime";
import type { PhraseViewMode } from "../../features/quick-phrases/lib/phraseVaultGroups";
import type { ClipboardSortMode } from "../../features/app/types";

export type MainTab = "clipboard" | "phrases";

export const UI_SETTING_KEYS = {
  mainTab: "app.ui.main_tab",
  phraseSortMode: "app.ui.phrase_sort_mode",
  phraseViewMode: "app.ui.phrase_view_mode",
  phraseGroupByTag: "app.ui.phrase_group_by_tag",
  phraseCollapsedGroups: "app.ui.phrase_collapsed_groups",
  phraseTagsExpanded: "app.ui.phrase_tags_expanded",
  phraseSelectedTag: "app.ui.phrase_selected_tag",
} as const;

export type UiStateKey = keyof typeof UI_SETTING_KEYS;

const LOCAL_CACHE_KEYS: Record<UiStateKey, string> = {
  mainTab: "auraclip.ui.main_tab",
  phraseSortMode: "auraclip.ui.phrase_sort_mode",
  phraseViewMode: "auraclip.ui.phrase_view_mode",
  phraseGroupByTag: "auraclip.ui.phrase_group_by_tag",
  phraseCollapsedGroups: "auraclip.ui.phrase_collapsed_groups",
  phraseTagsExpanded: "auraclip.ui.phrase_tags_expanded",
  phraseSelectedTag: "auraclip.ui.phrase_selected_tag",
};

const LEGACY_LOCAL_KEYS: Partial<Record<UiStateKey, string>> = {
  phraseSortMode: "auraclip.phrase_sort_mode",
  phraseViewMode: "auraclip.phraseViewMode",
  phraseGroupByTag: "auraclip.phraseGroupByTag",
  phraseCollapsedGroups: "auraclip.phraseCollapsedGroups",
};

export function parseMainTab(raw?: string | null): MainTab {
  return raw === "phrases" ? "phrases" : "clipboard";
}

export function parseClipboardSortMode(raw?: string | null): ClipboardSortMode {
  return raw === "created" || raw === "last_used" || raw === "usage" ? raw : "activity";
}

export function parsePhraseViewMode(raw?: string | null): PhraseViewMode {
  return raw === "grid" || raw === "cards" ? raw : "compact";
}

export function parseBooleanFlag(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

export function parseCollapsedGroups(raw?: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === "string"));
    }
  } catch {
    // ignore invalid serialized set
  }
  return new Set();
}

export function serializeCollapsedGroups(groups: Iterable<string>): string {
  return JSON.stringify(Array.from(new Set(groups)).sort());
}

export function parseSelectedTag(raw?: string | null): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  return raw;
}

export function readCachedUiSetting(key: UiStateKey): string | null {
  try {
    const primary = localStorage.getItem(LOCAL_CACHE_KEYS[key]);
    if (primary !== null) return primary;
    const legacyKey = LEGACY_LOCAL_KEYS[key];
    if (legacyKey) return localStorage.getItem(legacyKey);
  } catch {
    // ignore storage errors
  }
  return null;
}

export function writeCachedUiSetting(key: UiStateKey, rawValue: string): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEYS[key], rawValue);
    const legacyKey = LEGACY_LOCAL_KEYS[key];
    if (legacyKey) {
      localStorage.setItem(legacyKey, rawValue);
    }
  } catch {
    // ignore storage errors
  }
}

export function persistUiSetting(
  key: UiStateKey,
  rawValue: string,
  onSaveDb?: (settingKey: string, val: string) => void
): void {
  writeCachedUiSetting(key, rawValue);
  const settingKey = UI_SETTING_KEYS[key];
  if (onSaveDb) {
    onSaveDb(settingKey, rawValue);
    return;
  }
  if (isTauriRuntime()) {
    invoke("save_setting", { key: settingKey, value: rawValue }).catch(console.error);
  }
}

export function clearCachedUiSettings(): void {
  try {
    (Object.keys(LOCAL_CACHE_KEYS) as UiStateKey[]).forEach((key) => {
      localStorage.removeItem(LOCAL_CACHE_KEYS[key]);
      const legacyKey = LEGACY_LOCAL_KEYS[key];
      if (legacyKey) localStorage.removeItem(legacyKey);
    });
  } catch {
    // ignore storage errors
  }
}
