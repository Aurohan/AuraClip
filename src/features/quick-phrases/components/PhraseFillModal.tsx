import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Copy, Sparkles, X } from "lucide-react";
import type { QuickPhrase } from "../../../shared/types";
import {
  expandPhraseTemplateClient,
  extractInteractiveSlots,
} from "../lib/phraseTemplateClient";

interface PhraseFillModalProps {
  phrase: QuickPhrase | null;
  clipboardPreviewText: string;
  t: (key: string) => string;
  onConfirmPaste: (expanded: string) => void;
  onConfirmCopy: (expanded: string) => void;
  onClose: () => void;
}

export default function PhraseFillModal({
  phrase,
  clipboardPreviewText,
  t,
  onConfirmPaste,
  onConfirmCopy,
  onClose,
}: PhraseFillModalProps) {
  const slots = useMemo(
    () => (phrase ? extractInteractiveSlots(phrase.content) : []),
    [phrase]
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!phrase) return;
    const initial: Record<string, string> = {};
    for (const s of slots) {
      initial[s.name] = s.defaultValue;
    }
    setValues(initial);
    const id = requestAnimationFrame(() => {
      firstInputRef.current?.focus();
      firstInputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [phrase, slots]);

  const expandedPreview = useMemo(() => {
    if (!phrase) return "";
    return expandPhraseTemplateClient(phrase.content, {
      clipboardText: clipboardPreviewText,
      slotValues: values,
    });
  }, [phrase, clipboardPreviewText, values]);

  if (!phrase) return null;

  return (
    <div
      className="modal-overlay transform-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("phrase_fill_title")}
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
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            onConfirmCopy(expandedPreview);
          } else {
            onConfirmPaste(expandedPreview);
          }
        }
      }}
    >
      <div className="transform-modal-card phrase-fill-modal-card">
        <div className="transform-modal-header">
          <div className="transform-modal-title-group">
            <Sparkles size={15} className="transform-modal-icon" />
            <span>
              {t("phrase_fill_title")} · {phrase.title}
            </span>
          </div>
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

        <div className="phrase-fill-fields">
          {slots.map((slot, idx) => (
            <label key={slot.name} className="phrase-fill-field">
              <span className="phrase-fill-field-label">{slot.name}</span>
              <input
                ref={idx === 0 ? firstInputRef : undefined}
                type="text"
                className="app-input phrase-fill-input"
                value={values[slot.name] ?? ""}
                placeholder={slot.defaultValue || `${t("phrase_fill_placeholder")}${slot.name}`}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [slot.name]: e.target.value }))
                }
              />
            </label>
          ))}

          <div className="phrase-live-preview-box">
            <span className="phrase-live-preview-label">{t("phrase_live_preview_label")}</span>
            <pre className="phrase-live-preview-body">{expandedPreview}</pre>
          </div>
        </div>

        <div className="phrase-fill-footer">
          <span className="phrase-fill-hint">{t("phrase_fill_hint")}</span>
          <div className="phrase-fill-actions">
            <button
              type="button"
              className="batch-action-btn"
              onClick={() => onConfirmCopy(expandedPreview)}
            >
              <Copy size={12} />
              <span>{t("copy")}</span>
            </button>
            <button
              type="button"
              className="batch-action-btn is-primary"
              onClick={() => onConfirmPaste(expandedPreview)}
            >
              <ClipboardPaste size={12} />
              <span>{t("footer_hint_paste")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
