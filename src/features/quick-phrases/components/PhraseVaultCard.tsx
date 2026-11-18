import React, { memo } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Code,
  Copy,
  CopyPlus,
  Edit2,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Lock,
  MoreHorizontal,
  Plus,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import PinGlyph from "../../../shared/components/PinGlyph";
import type { QuickPhrase } from "../../../shared/types";
import { getTagTextColor } from "../../../shared/lib/utils";
import {
  detectPhraseKind,
  tokenizePhrasePreview,
  type PhraseSemanticKind,
} from "../lib/phraseTemplateClient";
import {
  isCompactGridWideItem,
  summarizePhraseValue,
  type PhraseViewMode,
} from "../lib/phraseVaultGroups";

function renderKindBadge(kind: PhraseSemanticKind, t: (key: string) => string) {
  if (kind === "text") return null;
  if (kind === "interactive") {
    return (
      <span className="phrase-kind-badge is-interactive">
        <Sparkles size={9} />
        <span>{t("phrase_kind_interactive")}</span>
      </span>
    );
  }
  if (kind === "template") {
    return (
      <span className="phrase-kind-badge is-template">
        <Sparkles size={9} />
        <span>{t("phrase_template_badge")}</span>
      </span>
    );
  }
  if (kind === "code") {
    return (
      <span className="phrase-kind-badge is-code">
        <Code size={9} />
        <span>{t("phrase_kind_code")}</span>
      </span>
    );
  }
  if (kind === "link") {
    return (
      <span className="phrase-kind-badge is-link">
        <LinkIcon size={9} />
        <span>{t("phrase_kind_link")}</span>
      </span>
    );
  }
  if (kind === "contact") {
    return (
      <span className="phrase-kind-badge is-contact">
        <UserRound size={9} />
        <span>{t("phrase_kind_contact")}</span>
      </span>
    );
  }
  return null;
}

export interface PhraseCardMenuPosition {
  id: number;
  top?: number;
  bottom?: number;
  right: number;
}

interface PhraseVaultCardProps {
  phrase: QuickPhrase;
  globalIdx: number;
  viewMode: PhraseViewMode;
  isFocused: boolean;
  isPinned: boolean;
  isRevealed: boolean;
  isJustCopied: boolean;
  isEditingTag: boolean;
  isCardMenuOpen: boolean;
  cardMenu: PhraseCardMenuPosition | null;
  cardMenuRef: React.RefObject<HTMLDivElement | null>;
  quickCombo?: string;
  allTags: string[];
  inlineTagInput: string;
  theme: string;
  splitActive: boolean;
  t: (key: string) => string;
  resolveTagBg: (tag: string) => string;
  onFocusIndex: (idx: number) => void;
  onPaste: (phrase: QuickPhrase, el: Element | null) => void;
  onCopy: (phrase: QuickPhrase) => void;
  onToggleReveal: (id: number, e?: React.MouseEvent) => void;
  onTogglePin: (id: number) => void;
  onEdit: (phrase: QuickPhrase, e?: React.MouseEvent) => void;
  onDuplicate: (phrase: QuickPhrase) => void;
  onDelete: (phrase: QuickPhrase, e?: React.MouseEvent) => void;
  onOpenTransformText?: (title: string, content: string) => void;
  onToggleCardMenu: (pos: PhraseCardMenuPosition | null) => void;
  onToggleInlineTagEdit: (phraseId: number | null) => void;
  onInlineTagInputChange: (val: string) => void;
  onAddTagToPhrase: (phrase: QuickPhrase, tag: string) => void;
  onRemoveTagFromPhrase: (phrase: QuickPhrase, tag: string) => void;
}

function PhraseVaultCard({
  phrase,
  globalIdx,
  viewMode,
  isFocused,
  isPinned,
  isRevealed,
  isJustCopied,
  isEditingTag,
  isCardMenuOpen,
  cardMenu,
  cardMenuRef,
  quickCombo,
  allTags,
  inlineTagInput,
  theme,
  splitActive,
  t,
  resolveTagBg,
  onFocusIndex,
  onPaste,
  onCopy,
  onToggleReveal,
  onTogglePin,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenTransformText,
  onToggleCardMenu,
  onToggleInlineTagEdit,
  onInlineTagInputChange,
  onAddTagToPhrase,
  onRemoveTagFromPhrase,
}: PhraseVaultCardProps) {
  const kind = detectPhraseKind(phrase.content, phrase.isSensitive);
  const masked = Boolean(phrase.isSensitive && !isRevealed);
  const isDense = viewMode !== "cards";
  const isWideGrid = viewMode === "grid" && isCompactGridWideItem(phrase);

  const phraseExistingTags = new Set(phrase.tags || []);
  const candidateTags = allTags
    .filter((tg) => !phraseExistingTags.has(tg))
    .filter((tg) => !inlineTagInput || tg.toLowerCase().includes(inlineTagInput.toLowerCase()));

  const tokenParts = !masked ? tokenizePhrasePreview(phrase.content) : [];
  const compactValue = masked ? "••••••••••••" : summarizePhraseValue(phrase.content);

  return (
    <div
      data-phrase-id={phrase.id}
      className={[
        "history-item",
        "aurora-phrase-card",
        `is-view-${viewMode}`,
        `is-kind-${kind}`,
        isWideGrid ? "is-grid-wide" : "",
        isFocused ? "selected" : "",
        isPinned ? "pinned" : "",
        isEditingTag ? "is-editing-inline" : "",
        isCardMenuOpen ? "is-menu-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={() => {
        if (splitActive) onFocusIndex(globalIdx);
      }}
      onClick={(e) => {
        if (isEditingTag) return;
        onFocusIndex(globalIdx);
        onPaste(phrase, e.currentTarget);
      }}
      onContextMenu={(e) => {
        if (isEditingTag) return;
        e.preventDefault();
        onFocusIndex(globalIdx);
        onCopy(phrase);
      }}
    >
      <div className="phrase-card-head">
        <div className="phrase-card-title-row">
          {isPinned && (
            <span className="pinned-card-badge" title={t("pinned")}>
              <PinGlyph pinned size={10} />
            </span>
          )}
          {phrase.isSensitive && <Lock size={11} className="phrase-lock-icon" />}
          <span className="aurora-phrase-title" title={phrase.title}>
            {phrase.title}
          </span>
          {!isDense && renderKindBadge(kind, t)}
          {isJustCopied && (
            <span className="phrase-copied-pill">
              <Check size={10} />
              <span>{t("copied")}</span>
            </span>
          )}
        </div>

        <div className="phrase-card-right">
          <div className="aurora-phrase-actions" onClick={(e) => e.stopPropagation()}>
            {phrase.isSensitive && (
              <button
                type="button"
                onClick={(e) => onToggleReveal(phrase.id, e)}
                className={`btn-icon${isRevealed ? " active" : ""}`}
                title={isRevealed ? t("hide") : t("reveal")}
              >
                {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(phrase);
              }}
              className="btn-icon"
              title={t("copy")}
            >
              {isJustCopied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            <button
              type="button"
              className={`btn-icon card-pin-btn${isPinned ? " active" : ""}`}
              title={isPinned ? t("unpin") : t("pin")}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(phrase.id);
              }}
            >
              <PinGlyph pinned={isPinned} size={13} />
            </button>
            {viewMode !== "grid" && (
              <button
                type="button"
                onClick={(e) => onEdit(phrase, e)}
                className="btn-icon"
                title={`${t("edit")} (Ctrl+E)`}
              >
                <Edit2 size={12} />
              </button>
            )}
            <button
              type="button"
              className={`btn-icon phrase-card-more-btn${isCardMenuOpen ? " active" : ""}`}
              title={t("more_actions")}
              aria-haspopup="menu"
              aria-expanded={isCardMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                if (isCardMenuOpen) {
                  onToggleCardMenu(null);
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const openUpwards = spaceBelow < 220 && rect.top > spaceBelow;
                onToggleCardMenu({
                  id: phrase.id,
                  top: openUpwards ? undefined : Math.round(rect.bottom + 4),
                  bottom: openUpwards ? Math.round(window.innerHeight - rect.top + 4) : undefined,
                  right: Math.max(8, Math.round(window.innerWidth - rect.right)),
                });
              }}
            >
              <MoreHorizontal size={13} />
            </button>
            {isCardMenuOpen &&
              cardMenu &&
              createPortal(
                <div
                  ref={cardMenuRef}
                  className="compact-action-menu"
                  role="menu"
                  aria-label={t("more_actions")}
                  style={{
                    position: "fixed",
                    top: cardMenu.top !== undefined ? `${cardMenu.top}px` : undefined,
                    bottom: cardMenu.bottom !== undefined ? `${cardMenu.bottom}px` : undefined,
                    right: `${cardMenu.right}px`,
                    zIndex: 100050,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="compact-action-menu-item"
                    onClick={(e) => {
                      onToggleCardMenu(null);
                      onEdit(phrase, e);
                    }}
                  >
                    <Edit2 size={13} />
                    <span>{t("edit")}</span>
                  </button>
                  {!phrase.isSensitive && onOpenTransformText && (
                    <button
                      type="button"
                      role="menuitem"
                      className="compact-action-menu-item"
                      onClick={() => {
                        onToggleCardMenu(null);
                        onOpenTransformText(phrase.title, phrase.content);
                      }}
                    >
                      <Wand2 size={13} />
                      <span>{t("transform_action")}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className={`compact-action-menu-item${isEditingTag ? " is-active" : ""}`}
                    onClick={() => {
                      onToggleCardMenu(null);
                      onToggleInlineTagEdit(isEditingTag ? null : phrase.id);
                      onInlineTagInputChange("");
                    }}
                  >
                    <TagIcon size={13} />
                    <span>{t("edit_tags")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="compact-action-menu-item"
                    onClick={() => {
                      onToggleCardMenu(null);
                      onDuplicate(phrase);
                    }}
                  >
                    <CopyPlus size={13} />
                    <span>{t("phrase_duplicate")}</span>
                  </button>
                  <div className="compact-action-menu-divider" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="compact-action-menu-item danger"
                    onClick={(e) => {
                      onToggleCardMenu(null);
                      onDelete(phrase, e);
                    }}
                  >
                    <Trash2 size={13} />
                    <span>{t("delete")}</span>
                  </button>
                </div>,
                document.body
              )}
          </div>

          <div className="phrase-card-meta">
            {quickCombo && (
              <span className="quick-paste-hint" title={quickCombo}>
                {quickCombo}
              </span>
            )}
            {(phrase.useCount ?? 0) > 0 && (
              <span className="aurora-phrase-stats">{phrase.useCount}×</span>
            )}
          </div>
        </div>
      </div>

      {isDense ? (
        <div className="phrase-compact-subrow">
          <div
            className={`phrase-compact-value${kind === "code" ? " is-code" : ""}${masked ? " is-masked" : ""}`}
            title={masked ? undefined : phrase.content}
          >
            {compactValue}
          </div>
          {viewMode === "compact" && Boolean(phrase.tags?.length) && (
            <div className="phrase-compact-tags" onClick={(e) => e.stopPropagation()}>
              {phrase.tags.slice(0, 2).map((tg) => (
                <span
                  key={tg}
                  className="phrase-compact-tag-dot"
                  style={{ "--tag-color": resolveTagBg(tg) } as React.CSSProperties}
                  title={`#${tg}`}
                >
                  #{tg}
                </span>
              ))}
              {phrase.tags.length > 2 && (
                <span className="phrase-compact-tag-more">+{phrase.tags.length - 2}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`aurora-phrase-content${kind === "code" ? " is-code" : ""}${masked ? " is-masked" : ""}`}
        >
          {masked
            ? "••••••••••••••••"
            : tokenParts.map((part, pIdx) =>
                part.type === "text" ? (
                  <React.Fragment key={pIdx}>{part.raw}</React.Fragment>
                ) : (
                  <span
                    key={pIdx}
                    className={`phrase-inline-token is-${part.type}`}
                    title={part.raw}
                  >
                    {part.label}
                  </span>
                )
              )}
        </div>
      )}

      {((!isDense && Boolean(phrase.tags?.length)) || isEditingTag) && (
        <div
          className={`phrase-card-footer${isEditingTag ? " tag-edit-active" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {phrase.tags?.map((tg) => {
            const bg = resolveTagBg(tg);
            return (
              <span
                key={tg}
                className="tag-chip phrase-tag-chip"
                style={{ "--tag-color": bg } as React.CSSProperties}
              >
                #{tg}
                {isEditingTag && (
                  <button
                    type="button"
                    className="phrase-tag-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTagFromPhrase(phrase, tg);
                    }}
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            );
          })}

          {isEditingTag && (
            <div className="tag-edit-anchor phrase-tag-edit-anchor">
              <div className="phrase-tag-input-group">
                <input
                  type="text"
                  value={inlineTagInput}
                  onChange={(e) => onInlineTagInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddTagToPhrase(phrase, inlineTagInput);
                    } else if (e.key === "Escape") {
                      onToggleInlineTagEdit(null);
                    }
                  }}
                  className="phrase-inline-tag-input"
                  placeholder={t("enter_tag_name")}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => onAddTagToPhrase(phrase, inlineTagInput)}
                  className="btn-icon phrase-mini-icon-btn"
                  title={t("add_tag")}
                >
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleInlineTagEdit(null)}
                  className="btn-icon phrase-mini-icon-btn"
                  title={t("confirm")}
                >
                  <Check size={12} />
                </button>
              </div>

              {candidateTags.length > 0 && (
                <div className="phrase-tag-suggestions hide-scrollbar">
                  {candidateTags.map((cTag) => {
                    const bg = resolveTagBg(cTag);
                    const fg = getTagTextColor(bg, theme);
                    return (
                      <button
                        key={cTag}
                        type="button"
                        onClick={() => onAddTagToPhrase(phrase, cTag)}
                        className="phrase-tag-suggest-btn"
                        style={{ background: bg, color: fg }}
                      >
                        +{cTag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(PhraseVaultCard);
