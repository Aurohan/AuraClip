import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clipboard,
  FileSignature,
  Lock,
  MessageSquareText,
  Plus,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import type { QuickPhrase } from "../../../shared/types";
import {
  derivePhraseTitleFromContent,
  detectPhraseKind,
  expandPhraseTemplateClient,
  extractInteractiveSlots,
  hasAnyPhraseTokens,
} from "../lib/phraseTemplateClient";

export interface PhraseComposerModalProps {
  open: boolean;
  initialPhrase?: QuickPhrase | null;
  defaultTag?: string | null;
  allTags: string[];
  resolveTagBg: (tag: string) => string;
  clipboardPreviewText?: string;
  t: (key: string) => string;
  onSave: (draft: {
    id: number;
    title: string;
    content: string;
    tags: string[];
    isSensitive: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

const VARIABLE_CHIPS = [
  { token: "{{?参数名}}", selectWord: "参数名", labelKey: "phrase_var_slot", isSlot: true },
  { token: "{{clipboard}}", labelKey: "phrase_var_clipboard", isSlot: false },
  { token: "{{date}}", labelKey: "phrase_var_date", isSlot: false },
  { token: "{{time}}", labelKey: "phrase_var_time", isSlot: false },
  { token: "{{datetime}}", labelKey: "phrase_var_datetime", isSlot: false },
  { token: "{{uuid}}", labelKey: "phrase_var_uuid", isSlot: false },
] as const;

export default function PhraseComposerModal({
  open,
  initialPhrase,
  defaultTag,
  allTags,
  resolveTagBg,
  clipboardPreviewText = "",
  t,
  onSave,
  onClose,
}: PhraseComposerModalProps) {
  const isEdit = Boolean(initialPhrase && initialPhrase.id > 0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isSensitive, setIsSensitive] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialPhrase) {
      setTitle(initialPhrase.title || "");
      setContent(initialPhrase.content || "");
      setTags(initialPhrase.tags ? [...initialPhrase.tags] : []);
      setIsSensitive(Boolean(initialPhrase.isSensitive));
    } else {
      setTitle("");
      setContent("");
      setTags(defaultTag ? [defaultTag] : []);
      setIsSensitive(false);
    }
    setAddingTag(false);
    setNewTagInput("");
    setSaving(false);

    const raf = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, initialPhrase, defaultTag]);

  const kind = useMemo(
    () => detectPhraseKind(content || " ", isSensitive),
    [content, isSensitive]
  );
  const autoTitle = useMemo(
    () => (content.trim() ? derivePhraseTitleFromContent(content, "") : ""),
    [content]
  );
  const hasTokens = useMemo(() => hasAnyPhraseTokens(content), [content]);
  const slots = useMemo(() => extractInteractiveSlots(content), [content]);
  const liveExpanded = useMemo(
    () =>
      hasTokens
        ? expandPhraseTemplateClient(content, {
            clipboardText: clipboardPreviewText,
          })
        : "",
    [content, clipboardPreviewText, hasTokens]
  );

  const lineCount = useMemo(
    () => (content ? content.split(/\r?\n/).length : 0),
    [content]
  );

  const availableTagPool = useMemo(() => {
    const set = new Set<string>(allTags);
    tags.forEach((tg) => set.add(tg));
    return Array.from(set);
  }, [allTags, tags]);

  if (!open) return null;

  const insertTokenAtCursor = (token: string, selectWord?: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) => `${prev}${token}`);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${token}${content.slice(end)}`;
    setContent(next);

    requestAnimationFrame(() => {
      el.focus();
      if (selectWord) {
        const innerOffset = token.indexOf(selectWord);
        if (innerOffset >= 0) {
          el.setSelectionRange(start + innerOffset, start + innerOffset + selectWord.length);
          return;
        }
      }
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const applyPreset = (presetTitle: string, presetContent: string, selectWord?: string) => {
    if (!title.trim()) setTitle(presetTitle);
    setContent(presetContent);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      if (selectWord) {
        const idx = presetContent.indexOf(selectWord);
        if (idx >= 0) {
          el.setSelectionRange(idx, idx + selectWord.length);
          return;
        }
      }
      el.setSelectionRange(presetContent.length, presetContent.length);
    });
  };

  const toggleTag = (tg: string) => {
    setTags((prev) => (prev.includes(tg) ? prev.filter((x) => x !== tg) : [...prev, tg]));
  };

  const commitNewTag = () => {
    const cleaned = newTagInput.trim();
    if (cleaned && !tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setNewTagInput("");
    setAddingTag(false);
  };

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || saving) return;
    setSaving(true);
    try {
      await onSave({
        id: initialPhrase?.id ?? 0,
        title: title.trim() || derivePhraseTitleFromContent(trimmedContent),
        content: trimmedContent,
        tags,
        isSensitive,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay transform-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? t("phrase_edit_heading") : t("add_quick_phrase")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          void handleSubmit();
        }
      }}
    >
      <div className="transform-modal-card phrase-composer-card">
        {/* Studio Header */}
        <div className="phrase-composer-header">
          <div className="phrase-composer-header-left">
            <Sparkles size={15} className="transform-modal-icon" />
            <span className="phrase-composer-title">
              {isEdit ? t("phrase_edit_heading") : t("add_quick_phrase")}
            </span>
            {content.trim() && (
              <span className={`phrase-kind-badge is-${kind === "secret" ? "interactive" : kind}`}>
                {t(`phrase_kind_${kind}`)}
              </span>
            )}
          </div>

          <div className="phrase-composer-header-right">
            <button
              type="button"
              className={`phrase-secret-pill${isSensitive ? " is-active" : ""}`}
              aria-pressed={isSensitive}
              onClick={() => setIsSensitive((v) => !v)}
              title={t("phrase_is_sensitive")}
            >
              <Lock size={11} />
              <span>{t("phrase_mark_sensitive")}</span>
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              title={t("cancel")}
              aria-label={t("cancel")}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Quick-Start Presets Bar (Create Mode) */}
        {!isEdit && (
          <div className="phrase-composer-presets">
            {clipboardPreviewText.trim() && (
              <button
                type="button"
                className="phrase-preset-chip is-accent"
                onClick={() => {
                  const trimmed = clipboardPreviewText.trim();
                  setContent(trimmed);
                  if (!title.trim()) {
                    setTitle(derivePhraseTitleFromContent(trimmed));
                  }
                  textareaRef.current?.focus();
                }}
              >
                <Clipboard size={11} />
                <span>{t("phrase_preset_from_clipboard")}</span>
              </button>
            )}
            <button
              type="button"
              className="phrase-preset-chip"
              onClick={() =>
                applyPreset(
                  t("phrase_preset_reply_title"),
                  t("phrase_preset_reply_body"),
                  "称呼"
                )
              }
            >
              <MessageSquareText size={11} />
              <span>{t("phrase_preset_reply_title")}</span>
            </button>
            <button
              type="button"
              className="phrase-preset-chip"
              onClick={() =>
                applyPreset(t("phrase_preset_sign_title"), t("phrase_preset_sign_body"))
              }
            >
              <FileSignature size={11} />
              <span>{t("phrase_preset_sign_title")}</span>
            </button>
            <button
              type="button"
              className="phrase-preset-chip"
              onClick={() =>
                applyPreset(
                  t("phrase_preset_cmd_title"),
                  "ssh {{?用户名=root}}@{{?主机地址}}",
                  "主机地址"
                )
              }
            >
              <Terminal size={11} />
              <span>{t("phrase_preset_cmd_title")}</span>
            </button>
          </div>
        )}

        {/* Composer Body */}
        <div className="phrase-composer-body">
          <div className="phrase-composer-section">
            <div className="phrase-composer-label-row">
              <span className="phrase-composer-field-label">{t("phrase_title_label")}</span>
              {!title.trim() && autoTitle && (
                <span className="phrase-composer-auto-hint">
                  {t("phrase_auto_title_preview").replace("{title}", autoTitle)}
                </span>
              )}
            </div>
            <input
              type="text"
              className="app-input phrase-composer-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("phrase_title_placeholder")}
            />
          </div>

          <div className="phrase-composer-section">
            <div className="phrase-composer-label-row">
              <span className="phrase-composer-field-label">{t("phrase_content_label")}</span>
              <span className="phrase-composer-counter">
                {content.length} {t("chars")} · {lineCount || 1}L
              </span>
            </div>

            <div className="phrase-composer-editor-box">
              <textarea
                ref={textareaRef}
                className="phrase-composer-textarea"
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("phrase_content_placeholder")}
              />

              <div className="phrase-composer-var-toolbar">
                <span className="phrase-template-chip-label">{t("phrase_vars_label")}</span>
                {VARIABLE_CHIPS.map((chip) => (
                  <button
                    key={chip.token}
                    type="button"
                    className={`phrase-template-var-chip${chip.isSlot ? " is-slot" : ""}`}
                    onClick={() =>
                      insertTokenAtCursor(
                        chip.token,
                        "selectWord" in chip ? chip.selectWord : undefined
                      )
                    }
                    title={chip.token}
                  >
                    +{t(chip.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {hasTokens && (
            <div className="phrase-live-preview-box">
              <span className="phrase-live-preview-label">
                <Sparkles size={11} />
                <span>
                  {t("phrase_live_preview_label")}
                  {slots.length > 0
                    ? ` · ${t("phrase_slots_count").replace("{n}", String(slots.length))}`
                    : ""}
                </span>
              </span>
              <pre className="phrase-live-preview-body">{liveExpanded}</pre>
            </div>
          )}

          {/* Visual Category Tag Selector */}
          <div className="phrase-composer-section">
            <span className="phrase-composer-field-label">{t("phrase_tags_label")}</span>
            <div className="phrase-composer-tags-grid">
              {availableTagPool.map((tg) => {
                const selected = tags.includes(tg);
                const color = resolveTagBg(tg);
                return (
                  <button
                    key={tg}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleTag(tg)}
                    className={`phrase-composer-tag-pill${selected ? " is-selected" : ""}`}
                    style={{ "--tag-color": color } as React.CSSProperties}
                  >
                    <span className="phrase-tag-filter-dot" />
                    <span>{tg}</span>
                    {selected && <Check size={10} />}
                  </button>
                );
              })}

              {addingTag ? (
                <input
                  type="text"
                  className="app-input phrase-new-tag-input"
                  autoFocus
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      e.stopPropagation();
                      commitNewTag();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setAddingTag(false);
                      setNewTagInput("");
                    }
                  }}
                  onBlur={commitNewTag}
                  placeholder={t("enter_tag_name")}
                />
              ) : (
                <button
                  type="button"
                  className="phrase-composer-tag-add"
                  onClick={() => setAddingTag(true)}
                >
                  <Plus size={11} />
                  <span>{t("add_tag")}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Studio Footer */}
        <div className="phrase-composer-footer">
          <span className="phrase-fill-hint">Ctrl+Enter {t("save")} · Esc {t("cancel")}</span>
          <div className="phrase-fill-actions">
            <button type="button" className="batch-action-btn" onClick={onClose}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className="batch-action-btn is-primary phrase-save-primary-btn"
              disabled={!content.trim() || saving}
              onClick={() => void handleSubmit()}
            >
              <Check size={13} />
              <span>{t("save")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
