import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import {
  ChevronDown,
  Download,
  FolderTree,
  LayoutGrid,
  MoreHorizontal,
  Pin,
  Plus,
  Rows3,
  Sparkles,
  SquareStack,
  Upload,
} from "lucide-react";
import ScrollToTopButton from "../../../shared/components/ScrollToTopButton";
import { motion, useReducedMotion } from "framer-motion";
import { usePhrasePins } from "../hooks/usePhrasePins";
import { sortQuickPhrases } from "../lib/sortQuickPhrases";
import {
  derivePhraseTitleFromContent,
  extractInteractiveSlots,
} from "../lib/phraseTemplateClient";
import {
  buildPhraseTagSections,
  rankPhraseTags,
  UNTAGGED_GROUP_KEY,
  type PhraseViewMode,
} from "../lib/phraseVaultGroups";
import PhraseComposerModal from "./PhraseComposerModal";
import PhraseDetailPane from "./PhraseDetailPane";
import PhraseFillModal from "./PhraseFillModal";
import PhraseVaultCard, { type PhraseCardMenuPosition } from "./PhraseVaultCard";
import type { ClipboardSortMode, QuickPasteModifier } from "../../app/types";
import type { QuickPhrase } from "../../../shared/types";
import { showPasteConfirm } from "../../../shared/lib/pasteFeedback";
import { matchesTextOrPinyin } from "../../../shared/lib/pinyinMatch";
import { getTagColor } from "../../../shared/lib/utils";
import { useWideWindow } from "../../../shared/hooks/useWideWindow";
import {
  UI_SETTING_KEYS,
  parseBooleanFlag,
  parseCollapsedGroups,
  parsePhraseViewMode,
  parseSelectedTag,
  persistUiSetting,
  readCachedUiSetting,
  serializeCollapsedGroups,
  writeCachedUiSetting,
  type UiStateKey,
} from "../../../shared/lib/uiStateStorage";

interface QuickPhrasesViewProps {
  sortMode: ClipboardSortMode;
  appSettings?: Record<string, string>;
  onPersistUiSetting?: (key: string, val: string) => void;
  t: (key: string) => string;
  theme: string;
  search: string;
  quickPasteModifier?: QuickPasteModifier;
  clipboardPreviewText?: string;
  splitViewEnabled?: boolean;
  onCloseSplitView?: () => void;
  onCountsChange?: (total: number, filtered: number, isFiltered: boolean) => void;
  onOpenTransformText?: (title: string, content: string) => void;
  pushToast: (msg: string, duration?: number) => void;
  openConfirm: (options: {
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
  }) => void;
}

const QUICK_PASTE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

const MODIFIER_LABELS: Record<Exclude<QuickPasteModifier, "disabled">, string> = {
  ctrl: "Ctrl+",
  alt: "Alt+",
  shift: "Shift+",
  win: "Win+",
};

export default function QuickPhrasesView({
  sortMode,
  appSettings,
  onPersistUiSetting,
  t,
  theme,
  search,
  quickPasteModifier = "ctrl",
  clipboardPreviewText = "",
  splitViewEnabled = false,
  onCloseSplitView,
  onCountsChange,
  onOpenTransformText,
  pushToast,
  openConfirm,
}: QuickPhrasesViewProps) {
  const { pins, togglePin } = usePhrasePins(pushToast);
  const isWide = useWideWindow();
  const splitActive = Boolean(splitViewEnabled && isWide);

  const [phrases, setPhrases] = useState<QuickPhrase[]>([]);
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const [phrasesLoaded, setPhrasesLoaded] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  const [selectedTag, setSelectedTag] = useState<string | null>(() =>
    parseSelectedTag(readCachedUiSetting("phraseSelectedTag"))
  );
  const [viewMode, setViewMode] = useState<PhraseViewMode>(() =>
    parsePhraseViewMode(readCachedUiSetting("phraseViewMode"))
  );
  const [groupByTag, setGroupByTag] = useState<boolean>(() =>
    parseBooleanFlag(readCachedUiSetting("phraseGroupByTag"), true)
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() =>
    parseCollapsedGroups(readCachedUiSetting("phraseCollapsedGroups"))
  );
  const [tagsExpanded, setTagsExpanded] = useState<boolean>(() =>
    parseBooleanFlag(readCachedUiSetting("phraseTagsExpanded"), false)
  );
  const [hasOverflowTags, setHasOverflowTags] = useState(false);

  const dirtyUiRef = useRef({
    viewMode: false,
    groupByTag: false,
    collapsedGroups: false,
    tagsExpanded: false,
    selectedTag: false,
  });
  const hydratedSettingsRef = useRef(false);

  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [fillModalPhrase, setFillModalPhrase] = useState<QuickPhrase | null>(null);
  const [composerState, setComposerState] = useState<{
    open: boolean;
    phrase: QuickPhrase | null;
  }>({ open: false, phrase: null });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [editingTagPhraseId, setEditingTagPhraseId] = useState<number | null>(null);
  const [inlineTagInput, setInlineTagInput] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [cardMenu, setCardMenu] = useState<PhraseCardMenuPosition | null>(null);

  const tagWrapRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const cardMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reduceMotion = useReducedMotion();
  const pillTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 40, mass: 0.7 };

  const persistUi = useCallback(
    (key: UiStateKey, rawValue: string) => {
      persistUiSetting(key, rawValue, onPersistUiSetting);
    },
    [onPersistUiSetting]
  );

  // Hydrate quick-phrase UI layout from durable SQLite settings (survives reboots & cache resets).
  useEffect(() => {
    if (!appSettings || Object.keys(appSettings).length === 0 || hydratedSettingsRef.current) {
      return;
    }
    hydratedSettingsRef.current = true;

    const dbView = appSettings[UI_SETTING_KEYS.phraseViewMode];
    if (dbView !== undefined) {
      if (!dirtyUiRef.current.viewMode) {
        const next = parsePhraseViewMode(dbView);
        setViewMode(next);
        writeCachedUiSetting("phraseViewMode", next);
      }
    } else {
      persistUi("phraseViewMode", viewMode);
    }

    const dbGroupBy = appSettings[UI_SETTING_KEYS.phraseGroupByTag];
    if (dbGroupBy !== undefined) {
      if (!dirtyUiRef.current.groupByTag) {
        const next = parseBooleanFlag(dbGroupBy, true);
        setGroupByTag(next);
        writeCachedUiSetting("phraseGroupByTag", String(next));
      }
    } else {
      persistUi("phraseGroupByTag", String(groupByTag));
    }

    const dbCollapsed = appSettings[UI_SETTING_KEYS.phraseCollapsedGroups];
    if (dbCollapsed !== undefined) {
      if (!dirtyUiRef.current.collapsedGroups) {
        const next = parseCollapsedGroups(dbCollapsed);
        setCollapsedGroups(next);
        writeCachedUiSetting("phraseCollapsedGroups", serializeCollapsedGroups(next));
      }
    } else {
      persistUi("phraseCollapsedGroups", serializeCollapsedGroups(collapsedGroups));
    }

    const dbTagsExpanded = appSettings[UI_SETTING_KEYS.phraseTagsExpanded];
    if (dbTagsExpanded !== undefined) {
      if (!dirtyUiRef.current.tagsExpanded) {
        const next = parseBooleanFlag(dbTagsExpanded, false);
        setTagsExpanded(next);
        writeCachedUiSetting("phraseTagsExpanded", String(next));
      }
    } else {
      persistUi("phraseTagsExpanded", String(tagsExpanded));
    }

    const dbSelectedTag = appSettings[UI_SETTING_KEYS.phraseSelectedTag];
    if (dbSelectedTag !== undefined) {
      if (!dirtyUiRef.current.selectedTag) {
        const next = parseSelectedTag(dbSelectedTag);
        setSelectedTag(next);
        writeCachedUiSetting("phraseSelectedTag", next ?? "");
      }
    } else {
      persistUi("phraseSelectedTag", selectedTag ?? "");
    }
  }, [
    appSettings,
    collapsedGroups,
    groupByTag,
    persistUi,
    selectedTag,
    tagsExpanded,
    viewMode,
  ]);

  const updateViewMode = useCallback(
    (next: PhraseViewMode) => {
      dirtyUiRef.current.viewMode = true;
      setViewMode(next);
      persistUi("phraseViewMode", next);
    },
    [persistUi]
  );

  const toggleGroupByTag = useCallback(() => {
    dirtyUiRef.current.groupByTag = true;
    setGroupByTag((prev) => {
      const next = !prev;
      persistUi("phraseGroupByTag", String(next));
      return next;
    });
  }, [persistUi]);

  const toggleGroupCollapsed = useCallback(
    (groupKey: string) => {
      dirtyUiRef.current.collapsedGroups = true;
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(groupKey)) next.delete(groupKey);
        else next.add(groupKey);
        persistUi("phraseCollapsedGroups", serializeCollapsedGroups(next));
        return next;
      });
    },
    [persistUi]
  );

  const updateSelectedTag = useCallback(
    (next: string | null) => {
      dirtyUiRef.current.selectedTag = true;
      setSelectedTag(next);
      persistUi("phraseSelectedTag", next ?? "");
    },
    [persistUi]
  );

  const toggleTagsExpanded = useCallback(() => {
    dirtyUiRef.current.tagsExpanded = true;
    setTagsExpanded((prev) => {
      const next = !prev;
      persistUi("phraseTagsExpanded", String(next));
      return next;
    });
  }, [persistUi]);

  const openCreateModal = useCallback(() => {
    setComposerState({ open: true, phrase: null });
  }, []);

  const openEditModal = useCallback((phrase: QuickPhrase, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTagPhraseId(null);
    setComposerState({ open: true, phrase });
  }, []);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (!moreMenuRef.current?.contains(ev.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!cardMenu) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (cardMenuRef.current?.contains(target) || target.closest(".phrase-card-more-btn")) {
        return;
      }
      setCardMenu(null);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCardMenu(null);
    };
    const handleScrollOrResize = () => setCardMenu(null);
    window.addEventListener("mousedown", handleOutside, true);
    window.addEventListener("keydown", handleEsc, true);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("mousedown", handleOutside, true);
      window.removeEventListener("keydown", handleEsc, true);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [cardMenu]);

  const fetchTagColors = useCallback(async () => {
    try {
      const colors = await invoke<Record<string, string>>("get_tag_colors");
      if (colors) setTagColors(colors);
    } catch (e) {
      console.error("fetchTagColors error:", e);
    }
  }, []);

  const fetchPhrases = useCallback(async () => {
    try {
      const data = await invoke<QuickPhrase[]>("get_quick_phrases");
      setPhrases(data || []);
    } catch (err) {
      console.error("fetch quick phrases error:", err);
    } finally {
      setPhrasesLoaded(true);
    }
  }, []);

  const fetchAllTags = useCallback(async () => {
    try {
      const counts = await invoke<Record<string, number>>("get_all_tags_info");
      if (counts) setSavedTags(Object.keys(counts));
    } catch (err) {
      console.error("fetch tags error:", err);
    } finally {
      setTagsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void fetchPhrases();
    void fetchAllTags();
    void fetchTagColors();
    let offPhrases: (() => void) | null = null;
    let offColors: (() => void) | null = null;
    listen("quick-phrases-changed", () => {
      void fetchPhrases();
      void fetchAllTags();
    }).then((off) => {
      offPhrases = off;
    });
    listen("tag-colors-updated", () => {
      void fetchTagColors();
    }).then((off) => {
      offColors = off;
    });
    return () => {
      offPhrases?.();
      offColors?.();
    };
  }, [fetchPhrases, fetchAllTags, fetchTagColors]);

  const resolveTagBg = useCallback(
    (tName: string) => tagColors[tName] || getTagColor(tName, theme),
    [tagColors, theme]
  );

  const handleUpdateTagColor = async (tag: string, newColor: string) => {
    try {
      setTagColors((prev) => ({ ...prev, [tag]: newColor }));
      await invoke("set_tag_color", { name: tag, color: newColor });
      await emit("tag-colors-updated");
      pushToast(`#${tag}`);
    } catch (err) {
      console.error("set_tag_color error:", err);
    }
  };

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    phrases.forEach((p) =>
      p.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1))
    );
    return counts;
  }, [phrases]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    savedTags.forEach((tg) => {
      if (tg && tg !== "sensitive") set.add(tg);
    });
    phrases.forEach((p) => {
      p.tags?.forEach((tag) => {
        if (tag) set.add(tag);
      });
    });
    return rankPhraseTags(Array.from(set), tagCounts);
  }, [savedTags, phrases, tagCounts]);

  useEffect(() => {
    if (!phrasesLoaded || !tagsLoaded || selectedTag === null) return;
    if (!allTags.includes(selectedTag)) {
      updateSelectedTag(null);
    }
  }, [phrasesLoaded, tagsLoaded, selectedTag, allTags, updateSelectedTag]);

  useEffect(() => {
    if (isWide) {
      setHasOverflowTags(false);
      return;
    }
    const el = tagWrapRef.current;
    if (!el) return;
    const measure = () => {
      // Two rows max height is ~58px; check natural height even when clamped.
      setHasOverflowTags(el.scrollHeight > 64);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [allTags, isWide, isCreatingTag, tagsExpanded]);

  const filteredPhrases = useMemo(() => {
    const rawSearch = search.trim();
    const tagSearchMode = rawSearch.startsWith("#") || rawSearch.toLowerCase().startsWith("tag:");
    const tagQuery = tagSearchMode
      ? rawSearch.replace(/^(#|tag:)/i, "").trim()
      : "";

    return sortQuickPhrases(
      phrases.filter((p) => {
        if (selectedTag && !p.tags?.includes(selectedTag)) return false;
        if (!rawSearch) return true;
        if (tagSearchMode) {
          if (!tagQuery) return Boolean(p.tags?.length);
          return Boolean(p.tags?.some((tag) => matchesTextOrPinyin(tag, tagQuery)));
        }
        const inTitle = matchesTextOrPinyin(p.title, rawSearch);
        const inContent = matchesTextOrPinyin(p.content, rawSearch);
        const inTags = p.tags?.some((tag) => matchesTextOrPinyin(tag, rawSearch));
        return Boolean(inTitle || inContent || inTags);
      }),
      pins,
      sortMode
    );
  }, [phrases, selectedTag, search, pins, sortMode]);

  const pinnedSet = useMemo(() => new Set(pins), [pins]);
  const pinnedPhrases = useMemo(
    () => filteredPhrases.filter((p) => pinnedSet.has(p.id)),
    [filteredPhrases, pinnedSet]
  );
  const regularPhrases = useMemo(
    () => filteredPhrases.filter((p) => !pinnedSet.has(p.id)),
    [filteredPhrases, pinnedSet]
  );

  const useGroupedSections = Boolean(
    groupByTag && selectedTag === null && !search.trim() && regularPhrases.length > 0
  );

  const regularTagSections = useMemo(
    () => (useGroupedSections ? buildPhraseTagSections(regularPhrases, allTags) : []),
    [useGroupedSections, regularPhrases, allTags]
  );

  // Ordered visible phrases strictly following rendered order so keyboard arrows & Alt+1..9 stay aligned.
  const orderedVisiblePhrases = useMemo(() => {
    if (!useGroupedSections) return filteredPhrases;
    const out: QuickPhrase[] = [...pinnedPhrases];
    for (const sec of regularTagSections) {
      if (!collapsedGroups.has(sec.key)) {
        out.push(...sec.phrases);
      }
    }
    return out;
  }, [useGroupedSections, filteredPhrases, pinnedPhrases, regularTagSections, collapsedGroups]);

  const visibleIndexById = useMemo(() => {
    const map = new Map<number, number>();
    orderedVisiblePhrases.forEach((p, idx) => map.set(p.id, idx));
    return map;
  }, [orderedVisiblePhrases]);

  useEffect(() => {
    const isFiltered = Boolean(selectedTag || search.trim());
    onCountsChange?.(phrases.length, filteredPhrases.length, isFiltered);
  }, [phrases.length, filteredPhrases.length, selectedTag, search, onCountsChange]);

  useEffect(() => {
    setFocusedIndex((prev) =>
      orderedVisiblePhrases.length === 0 ? 0 : Math.min(prev, orderedVisiblePhrases.length - 1)
    );
  }, [orderedVisiblePhrases.length]);

  const quickComboById = useMemo(() => {
    if (!quickPasteModifier || quickPasteModifier === "disabled") return {};
    const prefix = MODIFIER_LABELS[quickPasteModifier];
    const map: Record<number, string> = {};
    orderedVisiblePhrases.slice(0, QUICK_PASTE_KEYS.length).forEach((p, idx) => {
      map[p.id] = `${prefix}${QUICK_PASTE_KEYS[idx]}`;
    });
    return map;
  }, [orderedVisiblePhrases, quickPasteModifier]);

  const executePhrasePaste = useCallback(
    async (phrase: QuickPhrase, card?: Element | null) => {
      if (extractInteractiveSlots(phrase.content).length > 0) {
        setFillModalPhrase(phrase);
        return;
      }
      try {
        await showPasteConfirm(card ?? null);
        await invoke("paste_quick_phrase", { id: phrase.id });
      } catch (err) {
        console.error("Paste quick phrase error:", err);
        try {
          await invoke("paste_text_directly", { content: phrase.content });
        } catch (e2) {
          console.error("Fallback paste error:", e2);
          pushToast(t("transform_failed"));
        }
      }
    },
    [pushToast, t]
  );

  const executePhraseCopy = useCallback(
    async (phrase: QuickPhrase) => {
      if (extractInteractiveSlots(phrase.content).length > 0) {
        setFillModalPhrase(phrase);
        return;
      }
      try {
        await invoke<string>("copy_quick_phrase", { id: phrase.id });
        setCopiedId(phrase.id);
        pushToast(`${t("phrase_copied")}: ${phrase.title}`);
        setTimeout(() => setCopiedId(null), 1800);
      } catch (err) {
        try {
          await navigator.clipboard.writeText(phrase.content);
          setCopiedId(phrase.id);
          pushToast(`${t("phrase_copied")}: ${phrase.title}`);
          setTimeout(() => setCopiedId(null), 1800);
          invoke("mark_quick_phrase_used", { id: phrase.id }).catch(() => {});
        } catch (e2) {
          console.error("Copy error:", err, e2);
        }
      }
    },
    [pushToast, t]
  );

  const handleSaveComposer = useCallback(
    async (draft: {
      id: number;
      title: string;
      content: string;
      tags: string[];
      isSensitive: boolean;
    }) => {
      for (const tg of draft.tags) {
        invoke("create_new_tag", { tagName: tg }).catch(() => {});
      }
      const existing = draft.id > 0 ? phrases.find((p) => p.id === draft.id) : undefined;
      const payload: QuickPhrase = {
        id: draft.id,
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        isSensitive: draft.isSensitive,
        sortOrder: existing?.sortOrder ?? 0,
        useCount: existing?.useCount ?? 0,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await invoke("save_quick_phrase", { phrase: payload });
      await fetchPhrases();
      await fetchAllTags();
      pushToast(draft.id > 0 ? t("saved") : t("phrase_created_toast"));
    },
    [fetchAllTags, fetchPhrases, phrases, pushToast, t]
  );

  const handleDuplicatePhrase = useCallback(
    async (phrase: QuickPhrase) => {
      try {
        await invoke("save_quick_phrase", {
          phrase: {
            id: 0,
            title: `${phrase.title} (${t("phrase_copy_suffix")})`,
            content: phrase.content,
            tags: phrase.tags || [],
            isSensitive: Boolean(phrase.isSensitive),
            sortOrder: 0,
            useCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } satisfies QuickPhrase,
        });
        await fetchPhrases();
        pushToast(t("phrase_duplicated_toast"));
      } catch (err) {
        console.error("duplicate phrase error:", err);
      }
    },
    [fetchPhrases, pushToast, t]
  );

  const handleDelete = useCallback(
    (phrase: QuickPhrase, e?: React.MouseEvent) => {
      e?.stopPropagation();
      openConfirm({
        title: t("phrase_delete_confirm_title"),
        message: `${t("phrase_delete_confirm_msg")} (${phrase.title})`,
        danger: true,
        onConfirm: async () => {
          try {
            await invoke("delete_quick_phrase", { id: phrase.id });
            void fetchPhrases();
          } catch (err) {
            console.error("Delete error:", err);
          }
        },
      });
    },
    [fetchPhrases, openConfirm, t]
  );

  const handleExportJson = () => {
    setMoreMenuOpen(false);
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        phrases: phrases.map((p) => ({
          title: p.title,
          content: p.content,
          tags: p.tags || [],
          isSensitive: Boolean(p.isSensitive),
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `AuraClip-Phrases-${day}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast(t("phrase_exported_toast").replace("{n}", String(phrases.length)));
    } catch (err) {
      console.error("export phrases error:", err);
    }
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const list: Array<Partial<QuickPhrase>> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.phrases)
          ? parsed.phrases
          : [];
      const existingContents = new Set(phrases.map((p) => p.content.trim()));
      let importedCount = 0;
      for (const row of list) {
        const content = typeof row.content === "string" ? row.content.trim() : "";
        if (!content || existingContents.has(content)) continue;
        existingContents.add(content);
        const tags = Array.isArray(row.tags)
          ? row.tags.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          : [];
        for (const tg of tags) {
          invoke("create_new_tag", { tagName: tg }).catch(() => {});
        }
        await invoke("save_quick_phrase", {
          phrase: {
            id: 0,
            title:
              typeof row.title === "string" && row.title.trim()
                ? row.title.trim()
                : derivePhraseTitleFromContent(content),
            content,
            tags,
            isSensitive: Boolean(row.isSensitive),
            sortOrder: 0,
            useCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          } satisfies QuickPhrase,
        });
        importedCount++;
      }
      await fetchPhrases();
      await fetchAllTags();
      pushToast(t("phrase_imported_toast").replace("{n}", String(importedCount)));
    } catch (err) {
      console.error("import phrases error:", err);
      pushToast(t("phrase_import_failed"));
    }
  };

  useEffect(() => {
    const target = orderedVisiblePhrases[focusedIndex];
    if (!target) return;
    const el = listContainerRef.current?.querySelector<HTMLElement>(
      `[data-phrase-id="${target.id}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, orderedVisiblePhrases]);

  const stepSelectedTag = useCallback(
    (delta: -1 | 1) => {
      const cycle: Array<string | null> = [null, ...allTags];
      const currentIdx = cycle.indexOf(selectedTag);
      const nextIdx = (Math.max(0, currentIdx) + delta + cycle.length) % cycle.length;
      updateSelectedTag(cycle[nextIdx]);
      setFocusedIndex(0);
    },
    [allTags, selectedTag, updateSelectedTag]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || fillModalPhrase || composerState.open) return;
      if (document.querySelector(".modal-overlay")) return;

      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      const inEditable =
        activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";
      const inHeaderSearch =
        document.activeElement?.classList.contains("search-input") ?? false;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openCreateModal();
        return;
      }

      if (isCreatingTag || editingTagPhraseId !== null) return;

      if (quickPasteModifier && quickPasteModifier !== "disabled") {
        const modMatch =
          (quickPasteModifier === "ctrl" && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) ||
          (quickPasteModifier === "alt" && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) ||
          (quickPasteModifier === "shift" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) ||
          (quickPasteModifier === "win" && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey);
        if (modMatch) {
          const slotIdx = QUICK_PASTE_KEYS.indexOf(
            e.key as (typeof QUICK_PASTE_KEYS)[number]
          );
          if (slotIdx >= 0 && orderedVisiblePhrases[slotIdx]) {
            e.preventDefault();
            const target = orderedVisiblePhrases[slotIdx];
            void executePhrasePaste(
              target,
              document.querySelector(`[data-phrase-id="${target.id}"]`)
            );
            return;
          }
        }
      }

      if (inEditable && !inHeaderSearch) return;

      if (!inEditable && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        stepSelectedTag(e.key === "[" ? -1 : 1);
        return;
      }

      const selected = orderedVisiblePhrases[focusedIndex];

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          Math.min(prev + 1, Math.max(0, orderedVisiblePhrases.length - 1))
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && selected) {
        e.preventDefault();
        if (e.shiftKey) {
          void executePhraseCopy(selected);
        } else {
          void executePhrasePaste(
            selected,
            document.querySelector(`[data-phrase-id="${selected.id}"]`)
          );
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "e" &&
        selected
      ) {
        e.preventDefault();
        openEditModal(selected);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "d" &&
        selected
      ) {
        e.preventDefault();
        void handleDuplicatePhrase(selected);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "k" &&
        selected &&
        !selected.isSensitive &&
        onOpenTransformText
      ) {
        e.preventDefault();
        onOpenTransformText(selected.title, selected.content);
      } else if (e.key === "Delete" && !inEditable && selected) {
        e.preventDefault();
        if (pinnedSet.has(selected.id)) {
          pushToast(t("keyboard_delete_pinned"), 2200);
        } else {
          handleDelete(selected);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    composerState.open,
    editingTagPhraseId,
    executePhraseCopy,
    executePhrasePaste,
    fillModalPhrase,
    focusedIndex,
    handleDelete,
    handleDuplicatePhrase,
    isCreatingTag,
    onOpenTransformText,
    openCreateModal,
    openEditModal,
    orderedVisiblePhrases,
    pinnedSet,
    pushToast,
    quickPasteModifier,
    stepSelectedTag,
    t,
  ]);

  const handleCreateTopTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setIsCreatingTag(false);
      return;
    }
    try {
      await invoke("create_new_tag", { tagName: trimmed });
      setIsCreatingTag(false);
      setNewTagName("");
      await fetchAllTags();
      updateSelectedTag(trimmed);
      pushToast(`#${trimmed}`);
    } catch (err) {
      console.error("create tag error:", err);
      setIsCreatingTag(false);
    }
  };

  const handleAddTagToPhrase = useCallback(
    async (phrase: QuickPhrase, tagToAdd: string) => {
      const trimmed = tagToAdd.trim();
      if (!trimmed) return;
      const currentTags = phrase.tags || [];
      if (currentTags.includes(trimmed)) return;
      try {
        await invoke("create_new_tag", { tagName: trimmed }).catch(() => {});
        await invoke("save_quick_phrase", {
          phrase: { ...phrase, tags: [...currentTags, trimmed] },
        });
        setInlineTagInput("");
        await fetchPhrases();
        await fetchAllTags();
      } catch (err) {
        console.error("add tag to phrase error:", err);
      }
    },
    [fetchAllTags, fetchPhrases]
  );

  const handleRemoveTagFromPhrase = useCallback(
    async (phrase: QuickPhrase, tagToRemove: string) => {
      const updatedTags = (phrase.tags || []).filter((tg) => tg !== tagToRemove);
      try {
        await invoke("save_quick_phrase", { phrase: { ...phrase, tags: updatedTags } });
        await fetchPhrases();
        await fetchAllTags();
      } catch (err) {
        console.error("remove tag from phrase error:", err);
      }
    },
    [fetchAllTags, fetchPhrases]
  );

  const toggleReveal = useCallback((id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const focusedPhrase = orderedVisiblePhrases[focusedIndex] ?? orderedVisiblePhrases[0] ?? null;

  const handleCardPaste = useCallback(
    (p: QuickPhrase, el: Element | null) => {
      void executePhrasePaste(p, el);
    },
    [executePhrasePaste]
  );

  const handleCardCopy = useCallback(
    (p: QuickPhrase) => {
      void executePhraseCopy(p);
    },
    [executePhraseCopy]
  );

  const handleCardTogglePin = useCallback(
    (id: number) => {
      void togglePin(id);
    },
    [togglePin]
  );

  const handleCardDuplicate = useCallback(
    (p: QuickPhrase) => {
      void handleDuplicatePhrase(p);
    },
    [handleDuplicatePhrase]
  );

  const handleCardAddTag = useCallback(
    (p: QuickPhrase, tg: string) => {
      void handleAddTagToPhrase(p, tg);
    },
    [handleAddTagToPhrase]
  );

  const handleCardRemoveTag = useCallback(
    (p: QuickPhrase, tg: string) => {
      void handleRemoveTagFromPhrase(p, tg);
    },
    [handleRemoveTagFromPhrase]
  );

  const handleScrollTop = useCallback(() => {
    listContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const renderCard = (phrase: QuickPhrase) => {
    const globalIdx = visibleIndexById.get(phrase.id) ?? 0;
    return (
      <PhraseVaultCard
        key={phrase.id}
        phrase={phrase}
        globalIdx={globalIdx}
        viewMode={viewMode}
        isFocused={globalIdx === focusedIndex}
        isPinned={pinnedSet.has(phrase.id)}
        isRevealed={revealedIds.has(phrase.id)}
        isJustCopied={copiedId === phrase.id}
        isEditingTag={editingTagPhraseId === phrase.id}
        isCardMenuOpen={cardMenu?.id === phrase.id}
        cardMenu={cardMenu}
        cardMenuRef={cardMenuRef}
        quickCombo={quickComboById[phrase.id]}
        allTags={allTags}
        inlineTagInput={inlineTagInput}
        theme={theme}
        splitActive={splitActive}
        t={t}
        resolveTagBg={resolveTagBg}
        onFocusIndex={setFocusedIndex}
        onPaste={handleCardPaste}
        onCopy={handleCardCopy}
        onToggleReveal={toggleReveal}
        onTogglePin={handleCardTogglePin}
        onEdit={openEditModal}
        onDuplicate={handleCardDuplicate}
        onDelete={handleDelete}
        onOpenTransformText={onOpenTransformText}
        onToggleCardMenu={setCardMenu}
        onToggleInlineTagEdit={setEditingTagPhraseId}
        onInlineTagInputChange={setInlineTagInput}
        onAddTagToPhrase={handleCardAddTag}
        onRemoveTagFromPhrase={handleCardRemoveTag}
      />
    );
  };

  const renderPhraseItems = (items: QuickPhrase[]) =>
    viewMode === "grid" ? (
      <div className="phrase-vault-grid">{items.map(renderCard)}</div>
    ) : (
      items.map(renderCard)
    );

  const renderTagCreator = () =>
    isCreatingTag ? (
      <input
        type="text"
        className="app-input phrase-new-tag-input"
        autoFocus
        value={newTagName}
        onChange={(e) => setNewTagName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleCreateTopTag();
          } else if (e.key === "Escape") {
            setIsCreatingTag(false);
            setNewTagName("");
          }
        }}
        onBlur={() => {
          if (newTagName.trim()) void handleCreateTopTag();
          else {
            setIsCreatingTag(false);
            setNewTagName("");
          }
        }}
        placeholder={t("enter_tag_name")}
      />
    ) : (
      <button
        type="button"
        onClick={() => setIsCreatingTag(true)}
        className={`phrase-tag-add${isWide ? " phrase-rail-add" : ""}`}
        title={t("add_tag")}
      >
        <Plus size={12} />
        <span>{t("add_tag")}</span>
      </button>
    );

  return (
    <div className="quick-phrases-view">
      <div className="phrase-tagbar">
        <div className="phrase-vault-toolbar">
          <div className="phrase-vault-toolbar-left">
            <div className="phrase-view-segmented" role="group" aria-label={t("phrase_view_compact")}>
              <button
                type="button"
                className={`phrase-view-btn${viewMode === "compact" ? " is-active" : ""}`}
                onClick={() => updateViewMode("compact")}
                title={t("phrase_view_compact")}
                aria-label={t("phrase_view_compact")}
                aria-pressed={viewMode === "compact"}
              >
                <Rows3 size={13} />
              </button>
              <button
                type="button"
                className={`phrase-view-btn${viewMode === "grid" ? " is-active" : ""}`}
                onClick={() => updateViewMode("grid")}
                title={t("phrase_view_grid")}
                aria-label={t("phrase_view_grid")}
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid size={13} />
              </button>
              <button
                type="button"
                className={`phrase-view-btn${viewMode === "cards" ? " is-active" : ""}`}
                onClick={() => updateViewMode("cards")}
                title={t("phrase_view_cards")}
                aria-label={t("phrase_view_cards")}
                aria-pressed={viewMode === "cards"}
              >
                <SquareStack size={13} />
              </button>
            </div>

            {selectedTag === null && !search.trim() && (
              <button
                type="button"
                className={`phrase-group-toggle${groupByTag ? " is-active" : ""}`}
                onClick={toggleGroupByTag}
                title={t("phrase_group_by_tag")}
                aria-pressed={groupByTag}
              >
                <FolderTree size={12} />
                <span>{t("phrase_group_by_tag")}</span>
              </button>
            )}

            <span className="phrase-vault-hint">{t("phrase_tags_nav_hint")}</span>
          </div>

          <div className="phrase-tagbar-side">
            <button
              type="button"
              className="phrase-top-create-btn"
              onClick={openCreateModal}
              title={`${t("add_quick_phrase")} (Ctrl+N)`}
            >
              <Plus size={13} />
              <span>{t("phrase_new_short")}</span>
            </button>

            <div className="phrase-more-wrap" ref={moreMenuRef}>
              <button
                type="button"
                className={`btn-icon phrase-tag-manage${moreMenuOpen ? " active" : ""}`}
                onClick={() => setMoreMenuOpen((v) => !v)}
                title={t("more_actions")}
                aria-label={t("more_actions")}
              >
                <MoreHorizontal size={15} />
              </button>
              {moreMenuOpen && (
                <div className="phrase-more-popover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="phrase-more-item"
                    onClick={handleExportJson}
                  >
                    <Download size={13} />
                    <span>{t("phrase_export_json")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="phrase-more-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={13} />
                    <span>{t("phrase_import_json")}</span>
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only-color-input"
                onChange={(e) => void handleImportJsonFile(e)}
              />
            </div>
          </div>
        </div>

        {!isWide && (
          <div
            ref={tagWrapRef}
            className={`phrase-tagbar-wrap${tagsExpanded ? " is-expanded" : ""}`}
            role="tablist"
            aria-label={t("phrase_all_tags")}
          >
            <button
              type="button"
              role="tab"
              onClick={() => {
                updateSelectedTag(null);
                setFocusedIndex(0);
              }}
              className={`phrase-tag-filter${selectedTag === null ? " is-active" : ""}`}
              aria-selected={selectedTag === null}
            >
              {selectedTag === null && (
                <motion.span
                  layoutId="phrase-tag-pill"
                  className="phrase-tag-pill"
                  transition={pillTransition}
                />
              )}
              <span className="phrase-tag-filter-name">{t("phrase_all_tags")}</span>
              <span className="phrase-tag-filter-count">{phrases.length}</span>
            </button>

            {allTags.map((tag) => {
              const isSelected = selectedTag === tag;
              const bg = resolveTagBg(tag);
              return (
                <button
                  key={tag}
                  className={`phrase-tag-filter${isSelected ? " is-active" : ""}`}
                  role="tab"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => {
                    updateSelectedTag(isSelected ? null : tag);
                    setFocusedIndex(0);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById(`tag-color-input-${tag}`)?.click();
                  }}
                  title={`#${tag}`}
                  style={{ "--tag-color": bg } as React.CSSProperties}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="phrase-tag-pill"
                      className="phrase-tag-pill"
                      transition={pillTransition}
                    />
                  )}
                  <span className="phrase-tag-filter-dot" />
                  <span className="phrase-tag-filter-name">{tag}</span>
                  {tagCounts.get(tag) ? (
                    <span className="phrase-tag-filter-count">{tagCounts.get(tag)}</span>
                  ) : null}
                  <input
                    type="color"
                    id={`tag-color-input-${tag}`}
                    className="sr-only-color-input"
                    value={tagColors[tag] || bg}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void handleUpdateTagColor(tag, e.target.value)}
                  />
                </button>
              );
            })}

            {renderTagCreator()}

            {(hasOverflowTags || tagsExpanded) && (
              <button
                type="button"
                className="phrase-tag-expand-btn"
                onClick={toggleTagsExpanded}
                aria-expanded={tagsExpanded}
                title={tagsExpanded ? t("phrase_tags_collapse") : t("phrase_tags_expand")}
              >
                <ChevronDown
                  size={12}
                  style={{ transform: tagsExpanded ? "rotate(180deg)" : undefined }}
                />
                <span>{tagsExpanded ? t("phrase_tags_collapse") : t("phrase_tags_expand")}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className={`phrase-workspace-body${isWide ? " has-rail" : ""}${splitActive ? " is-split" : ""}`}
      >
        {isWide && (
          <aside className="phrase-tag-rail hide-scrollbar" aria-label={t("phrase_all_tags")}>
            <button
              type="button"
              className={`phrase-rail-item${selectedTag === null ? " is-active" : ""}`}
              onClick={() => {
                updateSelectedTag(null);
                setFocusedIndex(0);
              }}
            >
              <span className="phrase-rail-item-lead">
                <span className="phrase-rail-item-label">{t("phrase_all_tags")}</span>
              </span>
              <span className="phrase-tag-filter-count">{phrases.length}</span>
            </button>

            <div className="phrase-rail-divider" role="separator" />

            {allTags.map((tag) => {
              const isSelected = selectedTag === tag;
              const bg = resolveTagBg(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`phrase-rail-item${isSelected ? " is-active" : ""}`}
                  onClick={() => {
                    updateSelectedTag(isSelected ? null : tag);
                    setFocusedIndex(0);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById(`rail-tag-color-input-${tag}`)?.click();
                  }}
                  title={`#${tag}`}
                  style={{ "--tag-color": bg } as React.CSSProperties}
                >
                  <span className="phrase-rail-item-lead">
                    <span className="phrase-tag-filter-dot" />
                    <span className="phrase-rail-item-label">{tag}</span>
                  </span>
                  {tagCounts.get(tag) ? (
                    <span className="phrase-tag-filter-count">{tagCounts.get(tag)}</span>
                  ) : null}
                  <input
                    type="color"
                    id={`rail-tag-color-input-${tag}`}
                    className="sr-only-color-input"
                    value={tagColors[tag] || bg}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void handleUpdateTagColor(tag, e.target.value)}
                  />
                </button>
              );
            })}

            {renderTagCreator()}
          </aside>
        )}

        <div
          ref={listContainerRef}
          className="quick-phrases-scroll-container"
          onScroll={(e) => {
            const next = e.currentTarget.scrollTop > 80;
            setShowScrollTop((prev) => (prev === next ? prev : next));
          }}
        >
          {filteredPhrases.length === 0 ? (
            <div className="phrase-empty-state">
              <Sparkles size={28} />
              <p>{t("phrase_empty_tip")}</p>
              <button
                type="button"
                className="phrase-top-create-btn"
                onClick={openCreateModal}
              >
                <Plus size={13} />
                <span>{t("add_quick_phrase")}</span>
              </button>
            </div>
          ) : (
            <>
              {pinnedPhrases.length > 0 && (
                <section className="phrase-pinned-zone" aria-label={t("section_pinned")}>
                  <div className="phrase-pinned-zone-header">
                    <span className="phrase-pinned-zone-lead">
                      <span className="phrase-pinned-zone-icon" aria-hidden="true">
                        <Pin size={11} />
                      </span>
                      <span className="phrase-pinned-zone-title">{t("section_pinned")}</span>
                      {quickPasteModifier && quickPasteModifier !== "disabled" && (
                        <span className="phrase-pinned-zone-hint">
                          {MODIFIER_LABELS[quickPasteModifier]}1~9
                        </span>
                      )}
                    </span>
                    <span className="phrase-pinned-zone-count">{pinnedPhrases.length}</span>
                  </div>
                  {renderPhraseItems(pinnedPhrases)}
                </section>
              )}

              {useGroupedSections ? (
                regularTagSections.map((section) => {
                  const collapsed = collapsedGroups.has(section.key);
                  const groupColor =
                    section.key === UNTAGGED_GROUP_KEY ? undefined : resolveTagBg(section.key);
                  return (
                    <section key={section.key} className="phrase-group-section">
                      <button
                        type="button"
                        className={`phrase-group-header${collapsed ? " is-collapsed" : ""}`}
                        aria-expanded={!collapsed}
                        onClick={() => toggleGroupCollapsed(section.key)}
                      >
                        <span className="phrase-group-header-lead">
                          <ChevronDown size={12} className="phrase-group-chevron" />
                          {groupColor && (
                            <span
                              className="phrase-tag-filter-dot"
                              style={{ "--tag-color": groupColor } as React.CSSProperties}
                            />
                          )}
                          <span>
                            {section.label ? section.label : t("phrase_untagged_group")}
                          </span>
                        </span>
                        <span className="list-section-count">{section.phrases.length}</span>
                      </button>
                      {!collapsed && renderPhraseItems(section.phrases)}
                    </section>
                  );
                })
              ) : (
                <>
                  {pinnedPhrases.length > 0 && regularPhrases.length > 0 && (
                    <div className="list-section-header">
                      <span className="list-section-title">{t("phrase_section_library")}</span>
                      <span className="list-section-count">{regularPhrases.length}</span>
                    </div>
                  )}
                  {renderPhraseItems(regularPhrases)}
                </>
              )}
            </>
          )}
        </div>

        {splitActive && (
          <aside className="main-split-detail phrase-split-detail">
            <PhraseDetailPane
              phrase={focusedPhrase}
              isPinned={focusedPhrase ? pinnedSet.has(focusedPhrase.id) : false}
              isRevealed={focusedPhrase ? revealedIds.has(focusedPhrase.id) : false}
              clipboardPreviewText={clipboardPreviewText}
              t={t}
              onPaste={(p) =>
                void executePhrasePaste(
                  p,
                  document.querySelector(`[data-phrase-id="${p.id}"]`)
                )
              }
              onCopy={(p) => void executePhraseCopy(p)}
              onTogglePin={(p) => void togglePin(p.id)}
              onToggleReveal={(p) => toggleReveal(p.id)}
              onEdit={(p) => openEditModal(p)}
              onDuplicate={(p) => void handleDuplicatePhrase(p)}
              onTransform={(p) => onOpenTransformText?.(p.title, p.content)}
              onDelete={(p) => handleDelete(p)}
              onClose={onCloseSplitView}
            />
          </aside>
        )}
      </div>

      <ScrollToTopButton
        visible={showScrollTop}
        label={t("scroll_to_top")}
        onClick={handleScrollTop}
      />

      <PhraseComposerModal
        open={composerState.open}
        initialPhrase={composerState.phrase}
        defaultTag={selectedTag}
        allTags={allTags}
        resolveTagBg={resolveTagBg}
        clipboardPreviewText={clipboardPreviewText}
        t={t}
        onSave={handleSaveComposer}
        onClose={() => setComposerState({ open: false, phrase: null })}
      />

      <PhraseFillModal
        phrase={fillModalPhrase}
        clipboardPreviewText={clipboardPreviewText}
        t={t}
        onClose={() => setFillModalPhrase(null)}
        onConfirmPaste={(expanded) => {
          const target = fillModalPhrase;
          setFillModalPhrase(null);
          if (target) {
            invoke("mark_quick_phrase_used", { id: target.id }).catch(() => {});
          }
          invoke("paste_text_directly", { content: expanded }).catch(console.error);
        }}
        onConfirmCopy={(expanded) => {
          const target = fillModalPhrase;
          setFillModalPhrase(null);
          if (target) {
            invoke("mark_quick_phrase_used", { id: target.id }).catch(() => {});
          }
          navigator.clipboard
            .writeText(expanded)
            .then(() => pushToast(t("copied")))
            .catch(console.error);
        }}
      />
    </div>
  );
}
