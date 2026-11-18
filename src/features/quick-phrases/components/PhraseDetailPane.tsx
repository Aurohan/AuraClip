import { memo, useMemo } from "react";
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  Edit2,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import PinGlyph from "../../../shared/components/PinGlyph";
import type { QuickPhrase } from "../../../shared/types";
import {
  detectPhraseKind,
  expandPhraseTemplateClient,
  extractInteractiveSlots,
  hasAnyPhraseTokens,
} from "../lib/phraseTemplateClient";

interface PhraseDetailPaneProps {
  phrase: QuickPhrase | null;
  isPinned: boolean;
  isRevealed: boolean;
  clipboardPreviewText: string;
  t: (key: string) => string;
  onPaste: (phrase: QuickPhrase) => void;
  onCopy: (phrase: QuickPhrase) => void;
  onTogglePin: (phrase: QuickPhrase) => void;
  onToggleReveal: (phrase: QuickPhrase) => void;
  onEdit: (phrase: QuickPhrase) => void;
  onDuplicate: (phrase: QuickPhrase) => void;
  onTransform: (phrase: QuickPhrase) => void;
  onDelete: (phrase: QuickPhrase) => void;
  onClose?: () => void;
}

function PhraseDetailPane({
  phrase,
  isPinned,
  isRevealed,
  clipboardPreviewText,
  t,
  onPaste,
  onCopy,
  onTogglePin,
  onToggleReveal,
  onEdit,
  onDuplicate,
  onTransform,
  onDelete,
  onClose,
}: PhraseDetailPaneProps) {
  const activeContent = phrase?.content ?? "";
  const hasTokens = useMemo(() => hasAnyPhraseTokens(activeContent), [activeContent]);
  const slots = useMemo(() => extractInteractiveSlots(activeContent), [activeContent]);
  const liveExpanded = useMemo(
    () =>
      hasTokens
        ? expandPhraseTemplateClient(activeContent, {
            clipboardText: clipboardPreviewText,
          })
        : "",
    [activeContent, clipboardPreviewText, hasTokens]
  );

  if (!phrase) {
    return <div className="detail-empty">{t("phrase_detail_empty")}</div>;
  }

  const kind = detectPhraseKind(phrase.content, phrase.isSensitive);
  const masked = Boolean(phrase.isSensitive && !isRevealed);

  return (
    <>
      <div className="detail-header">
        <div className="detail-context">
          {phrase.isSensitive && <Lock size={13} />}
          <span className="detail-source-name" title={phrase.title}>
            {phrase.title}
          </span>
          <span className="detail-content-type">{t(`phrase_kind_${kind}`)}</span>
          <span className="detail-media-info">
            {t("phrase_stats_uses").replace("{n}", String(phrase.useCount || 0))}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn-icon detail-close-btn"
            title={t("split_view")}
            aria-label={t("split_view")}
            onClick={onClose}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="detail-preview phrase-detail-body" key={`phrase-detail-${phrase.id}`}>
        {masked ? (
          <div className="detail-sensitive">
            <EyeOff size={20} />
            <span>{t("detail_sensitive_hidden")}</span>
          </div>
        ) : (
          <pre className={`detail-text${kind === "code" ? " is-code" : ""}`}>
            {phrase.content}
          </pre>
        )}

        {!masked && hasTokens && (
          <div className="phrase-live-preview-box">
            <span className="phrase-live-preview-label">
              <Sparkles size={11} />
              <span>
                {t("phrase_live_preview_label")}
                {slots.length > 0
                  ? ` (${t("phrase_slots_count").replace("{n}", String(slots.length))})`
                  : ""}
              </span>
            </span>
            <pre className="phrase-live-preview-body">{liveExpanded}</pre>
          </div>
        )}

        {!!phrase.tags?.length && (
          <section className="detail-annotations">
            <div className="detail-tags">
              {phrase.tags.map((tag) => (
                <span className="detail-tag" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="detail-actions-wrap">
        <div className="detail-actions" role="toolbar">
          {phrase.isSensitive && (
            <button
              type="button"
              className={`btn-icon detail-action${isRevealed ? " active" : ""}`}
              title={isRevealed ? t("hide") : t("reveal")}
              onClick={() => onToggleReveal(phrase)}
            >
              {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          <button
            type="button"
            className="btn-icon detail-action"
            title={t("copy")}
            onClick={() => onCopy(phrase)}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className={`btn-icon detail-action${isPinned ? " active" : ""}`}
            title={isPinned ? t("unpin") : t("pin")}
            onClick={() => onTogglePin(phrase)}
          >
            <PinGlyph pinned={isPinned} size={14} />
          </button>
          <button
            type="button"
            className="btn-icon detail-action"
            title={`${t("edit")} (Ctrl+E)`}
            onClick={() => onEdit(phrase)}
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            className="btn-icon detail-action"
            title={t("phrase_duplicate")}
            onClick={() => onDuplicate(phrase)}
          >
            <CopyPlus size={14} />
          </button>
          {!phrase.isSensitive && (
            <button
              type="button"
              className="btn-icon detail-action"
              title={t("transform_action")}
              onClick={() => onTransform(phrase)}
            >
              <Wand2 size={14} />
            </button>
          )}
          <button
            type="button"
            className="btn-icon detail-action is-danger"
            title={t("delete")}
            onClick={() => onDelete(phrase)}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            className="btn-icon detail-action is-primary"
            onClick={() => onPaste(phrase)}
          >
            <ClipboardPaste size={14} />
            <span>{t("detail_paste")}</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default memo(PhraseDetailPane);
