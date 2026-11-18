import React, { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import {
  Check,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Lock,
  Palette,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import PinGlyph from "../../../shared/components/PinGlyph";
import { usePhrasePins } from "../hooks/usePhrasePins";
import { usePhraseTagFilters } from "../hooks/usePhraseTagFilters";
import PhraseComposerModal from "./PhraseComposerModal";
import {
  detectPhraseKind,
  extractInteractiveSlots,
  tokenizePhrasePreview,
} from "../lib/phraseTemplateClient";
import PhraseFillModal from "./PhraseFillModal";
import type { QuickPhrase } from "../../../shared/types";
import { getTagColor } from "../../../shared/lib/utils";

interface PhraseTagManagerProps {
  t: (key: string) => string;
  theme: string;
  pushToast: (msg: string, duration?: number) => void;
  openConfirm: (options: {
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
  }) => void;
  initialTag?: string | null;
}

export default function PhraseTagManager({
  t,
  theme,
  pushToast,
  openConfirm,
  initialTag,
}: PhraseTagManagerProps) {
  const { pins, togglePin } = usePhrasePins(pushToast);
  const [phrases, setPhrases] = useState<QuickPhrase[]>([]);
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [tagSearch, setTagSearch] = useState("");
  const [phraseSearch, setPhraseSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);

  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [composerState, setComposerState] = useState<{
    open: boolean;
    phrase: QuickPhrase | null;
  }>({ open: false, phrase: null });
  const [fillModalPhrase, setFillModalPhrase] = useState<QuickPhrase | null>(null);

  const fetchPhrases = useCallback(async () => {
    try {
      const data = await invoke<QuickPhrase[]>("get_quick_phrases");
      setPhrases(data || []);
    } catch (err) {
      console.error("fetchPhrases in PhraseTagManager error:", err);
    }
  }, []);

  const fetchSavedTags = useCallback(async () => {
    try {
      const counts = await invoke<Record<string, number>>("get_all_tags_info");
      if (counts) setSavedTags(Object.keys(counts));
    } catch (err) {
      console.error("fetchSavedTags error:", err);
    }
  }, []);

  const fetchTagColors = useCallback(async () => {
    try {
      const colors = await invoke<Record<string, string>>("get_tag_colors");
      if (colors) setTagColors(colors);
    } catch (err) {
      console.error("fetchTagColors error:", err);
    }
  }, []);

  useEffect(() => {
    void fetchPhrases();
    void fetchSavedTags();
    void fetchTagColors();

    let unlistenPhrases: (() => void) | undefined;
    let unlistenColors: (() => void) | undefined;

    listen("quick-phrases-changed", () => {
      void fetchPhrases();
      void fetchSavedTags();
    }).then((off) => {
      unlistenPhrases = off;
    });

    listen("tag-colors-updated", () => {
      void fetchTagColors();
    }).then((off) => {
      unlistenColors = off;
    });

    return () => {
      unlistenPhrases?.();
      unlistenColors?.();
    };
  }, [fetchPhrases, fetchSavedTags, fetchTagColors]);

  const { tagList, filteredTagList, displayPhrases } = usePhraseTagFilters(
    phrases,
    pins,
    tagSearch,
    selectedTag,
    phraseSearch,
    savedTags
  );

  const allTagNames = useMemo(() => tagList.map((x) => x.name), [tagList]);
  const pinnedSet = useMemo(() => new Set(pins), [pins]);

  const resolveTagBg = useCallback(
    (tagName: string) => tagColors[tagName] || getTagColor(tagName, theme),
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

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setIsCreatingTag(false);
      return;
    }
    try {
      await invoke("create_new_tag", { tagName: trimmed });
      setSavedTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      setIsCreatingTag(false);
      setNewTagName("");
      setSelectedTag(trimmed);
      pushToast(`#${trimmed}`);
    } catch (err) {
      console.error("create_new_tag error:", err);
      setIsCreatingTag(false);
    }
  };

  const handleRenameTag = async (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingTagName(null);
      return;
    }
    try {
      await invoke("rename_phrase_tag", { oldName, newName: trimmed });
      await invoke("rename_tag_globally", { oldName, newName: trimmed }).catch(() => {});
      if (selectedTag === oldName) setSelectedTag(trimmed);
      setEditingTagName(null);
      await fetchPhrases();
      await fetchSavedTags();
      pushToast(`#${oldName} → #${trimmed}`);
    } catch (err) {
      console.error("rename tag error:", err);
      setEditingTagName(null);
    }
  };

  const handleDeleteTag = (tagName: string) => {
    openConfirm({
      title: t("delete"),
      message: `#${tagName}`,
      danger: true,
      onConfirm: async () => {
        try {
          await invoke("delete_phrase_tag", { tagName });
          if (selectedTag === tagName) setSelectedTag(null);
          await fetchPhrases();
          await fetchSavedTags();
        } catch (err) {
          console.error("delete phrase tag error:", err);
        }
      },
    });
  };

  const handleCopy = async (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    if (extractInteractiveSlots(phrase.content).length > 0) {
      setFillModalPhrase(phrase);
      return;
    }
    try {
      await invoke<string>("copy_quick_phrase", { id: phrase.id });
      setCopiedId(phrase.id);
      pushToast(`${t("phrase_copied")}: ${phrase.title}`);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      await navigator.clipboard.writeText(phrase.content).catch(() => {});
    }
  };

  const handlePaste = async (phrase: QuickPhrase) => {
    if (extractInteractiveSlots(phrase.content).length > 0) {
      setFillModalPhrase(phrase);
      return;
    }
    try {
      await invoke("paste_quick_phrase", { id: phrase.id });
    } catch (err) {
      console.error("paste quick phrase error:", err);
    }
  };

  const handleRemoveTagFromPhrase = async (phrase: QuickPhrase, tagToRemove: string) => {
    const updatedTags = (phrase.tags || []).filter((tg) => tg !== tagToRemove);
    try {
      await invoke("save_quick_phrase", { phrase: { ...phrase, tags: updatedTags } });
      await fetchPhrases();
    } catch (err) {
      console.error("remove tag error:", err);
    }
  };

  const handleSaveComposer = async (draft: {
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
    await invoke("save_quick_phrase", {
      phrase: {
        id: draft.id,
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        isSensitive: draft.isSensitive,
        sortOrder: existing?.sortOrder ?? 0,
        useCount: existing?.useCount ?? 0,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      } satisfies QuickPhrase,
    });
    await fetchPhrases();
    await fetchSavedTags();
    pushToast(draft.id > 0 ? t("saved") : t("phrase_created_toast"));
  };

  const handleDeletePhrase = (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    openConfirm({
      title: t("phrase_delete_confirm_title"),
      message: `${t("phrase_delete_confirm_msg")} (${phrase.title})`,
      danger: true,
      onConfirm: async () => {
        await invoke("delete_quick_phrase", { id: phrase.id });
        await fetchPhrases();
      },
    });
  };

  const toggleReveal = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="ptm-layout">
      {/* Left Category Rail */}
      <aside className="ptm-sidebar">
        <div className="ptm-sidebar-top">
          {isCreatingTag ? (
            <input
              type="text"
              autoFocus
              className="app-input ptm-new-tag-input"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateTag();
                } else if (e.key === "Escape") {
                  setIsCreatingTag(false);
                  setNewTagName("");
                }
              }}
              onBlur={() => {
                if (newTagName.trim()) void handleCreateTag();
                else {
                  setIsCreatingTag(false);
                  setNewTagName("");
                }
              }}
              placeholder={t("enter_tag_name")}
            />
          ) : (
            <div className="ptm-sidebar-search-row">
              <div className="ptm-search-box">
                <Search size={12} className="transform-search-icon" />
                <input
                  type="text"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder={t("filter_by_tag")}
                  className="ptm-search-input"
                />
                {tagSearch && (
                  <button
                    type="button"
                    className="phrase-tag-remove-btn"
                    onClick={() => setTagSearch("")}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn-icon ptm-add-tag-btn"
                onClick={() => setIsCreatingTag(true)}
                title={t("add_tag")}
              >
                <Plus size={13} />
              </button>
            </div>
          )}
        </div>

        <div className="ptm-tag-list hide-scrollbar">
          <button
            type="button"
            className={`ptm-tag-item${selectedTag === null ? " is-active" : ""}`}
            onClick={() => setSelectedTag(null)}
          >
            <span className="ptm-tag-name">{t("phrase_all_tags")}</span>
            <span className="phrase-tag-filter-count">{phrases.length}</span>
          </button>

          {filteredTagList.map(({ name, count }) => {
            const isSelected = selectedTag === name;
            const color = resolveTagBg(name);
            const isRenaming = editingTagName === name;

            return (
              <div
                key={name}
                className={`ptm-tag-item${isSelected ? " is-active" : ""}`}
                onClick={() => {
                  if (!isRenaming) setSelectedTag(isSelected ? null : name);
                }}
              >
                {isRenaming ? (
                  <input
                    type="text"
                    autoFocus
                    className="app-input ptm-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleRenameTag(name);
                      } else if (e.key === "Escape") {
                        setEditingTagName(null);
                      }
                    }}
                    onBlur={() => void handleRenameTag(name)}
                  />
                ) : (
                  <>
                    <div className="ptm-tag-item-lead">
                      <span
                        className="phrase-tag-filter-dot"
                        style={{ "--tag-color": color } as React.CSSProperties}
                      />
                      <span className="ptm-tag-name" title={name}>
                        {name}
                      </span>
                    </div>
                    <div
                      className="ptm-tag-item-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="ptm-mini-action"
                        title={t("edit")}
                        onClick={() => {
                          setEditingTagName(name);
                          setRenameValue(name);
                        }}
                      >
                        <Edit2 size={11} />
                      </button>
                      <label className="ptm-mini-action" title="Color">
                        <Palette size={11} />
                        <input
                          type="color"
                          className="sr-only-color-input"
                          value={tagColors[name] || color}
                          onChange={(e) => void handleUpdateTagColor(name, e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="ptm-mini-action is-danger"
                        title={t("delete")}
                        onClick={() => handleDeleteTag(name)}
                      >
                        <Trash2 size={11} />
                      </button>
                      <span className="phrase-tag-filter-count ptm-tag-count">{count}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Phrase List & Toolbar */}
      <section className="ptm-main">
        <div className="ptm-main-toolbar">
          <div className="ptm-main-heading">
            <span className="ptm-main-title">
              {selectedTag ? `#${selectedTag}` : t("quick_phrases_title")}
            </span>
            <span className="phrase-tag-filter-count">{displayPhrases.length}</span>
          </div>

          <div className="ptm-main-controls">
            <div className="ptm-search-box ptm-phrase-search">
              <Search size={12} className="transform-search-icon" />
              <input
                type="text"
                value={phraseSearch}
                onChange={(e) => setPhraseSearch(e.target.value)}
                placeholder={t("quick_phrases_search_placeholder")}
                className="ptm-search-input"
              />
              {phraseSearch && (
                <button
                  type="button"
                  className="phrase-tag-remove-btn"
                  onClick={() => setPhraseSearch("")}
                >
                  <X size={10} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="phrase-top-create-btn"
              onClick={() => setComposerState({ open: true, phrase: null })}
            >
              <Plus size={13} />
              <span>{t("add_quick_phrase")}</span>
            </button>
          </div>
        </div>

        <div className="quick-phrases-scroll-container">
          {displayPhrases.length === 0 ? (
            <div className="phrase-empty-state">
              <Sparkles size={28} />
              <p>{t("phrase_empty_tip")}</p>
              <button
                type="button"
                className="phrase-top-create-btn"
                onClick={() => setComposerState({ open: true, phrase: null })}
              >
                <Plus size={13} />
                <span>{t("add_quick_phrase")}</span>
              </button>
            </div>
          ) : (
            displayPhrases.map((phrase) => {
              const isRevealed = revealedIds.has(phrase.id);
              const isJustCopied = copiedId === phrase.id;
              const isPinned = pinnedSet.has(phrase.id);
              const kind = detectPhraseKind(phrase.content, phrase.isSensitive);
              const tokenParts =
                !phrase.isSensitive || isRevealed
                  ? tokenizePhrasePreview(phrase.content)
                  : [];

              return (
                <div
                  key={phrase.id}
                  className={`history-item aurora-phrase-card is-kind-${kind}${isPinned ? " pinned" : ""}`}
                  onClick={() => void handlePaste(phrase)}
                >
                  <div className="phrase-card-head">
                    <div className="phrase-card-title-row">
                      {isPinned && (
                        <span className="pinned-card-badge" title={t("pinned")}>
                          <PinGlyph pinned size={10} />
                        </span>
                      )}
                      {phrase.isSensitive && <Lock size={11} className="phrase-lock-icon" />}
                      <span className="aurora-phrase-title">{phrase.title}</span>
                    </div>

                    <div
                      className="aurora-phrase-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {phrase.isSensitive && (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={(e) => toggleReveal(phrase.id, e)}
                          title={isRevealed ? t("hide") : t("reveal")}
                        >
                          {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={(e) => void handleCopy(phrase, e)}
                        title={t("copy")}
                      >
                        {isJustCopied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      <button
                        type="button"
                        className={`btn-icon card-pin-btn${isPinned ? " active" : ""}`}
                        onClick={() => void togglePin(phrase.id)}
                        title={isPinned ? t("unpin") : t("pin")}
                      >
                        <PinGlyph pinned={isPinned} size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => setComposerState({ open: true, phrase })}
                        title={t("edit")}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon phrase-delete-btn"
                        onClick={(e) => handleDeletePhrase(phrase, e)}
                        title={t("delete")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`aurora-phrase-content${kind === "code" ? " is-code" : ""}${phrase.isSensitive && !isRevealed ? " is-masked" : ""}`}
                  >
                    {phrase.isSensitive && !isRevealed
                      ? "••••••••••••••••"
                      : tokenParts.map((part, pIdx) =>
                          part.type === "text" ? (
                            <React.Fragment key={pIdx}>{part.raw}</React.Fragment>
                          ) : (
                            <span
                              key={pIdx}
                              className={`phrase-inline-token is-${part.type}`}
                            >
                              {part.label}
                            </span>
                          )
                        )}
                  </div>

                  {!!phrase.tags?.length && (
                    <div
                      className="phrase-card-footer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {phrase.tags.map((tg) => (
                        <span
                          key={tg}
                          className="tag-chip phrase-tag-chip"
                          style={{ "--tag-color": resolveTagBg(tg) } as React.CSSProperties}
                        >
                          #{tg}
                          <button
                            type="button"
                            className="phrase-tag-remove-btn"
                            onClick={() => void handleRemoveTagFromPhrase(phrase, tg)}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <PhraseComposerModal
        open={composerState.open}
        initialPhrase={composerState.phrase}
        defaultTag={selectedTag}
        allTags={allTagNames}
        resolveTagBg={resolveTagBg}
        t={t}
        onSave={handleSaveComposer}
        onClose={() => setComposerState({ open: false, phrase: null })}
      />

      <PhraseFillModal
        phrase={fillModalPhrase}
        clipboardPreviewText=""
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
