import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Check, ClipboardPaste, Copy, Search, Wand2, X } from "lucide-react";
import type { ClipboardEntry } from "../../../shared/types";
import { computeTextTransforms, type TextTransformItem } from "../../../shared/lib/textTransforms";
import { extractImageOcrText } from "../../../shared/lib/searchMatch";
import { matchesTextOrPinyin } from "../../../shared/lib/pinyinMatch";

interface TransformMenuModalProps {
  item: ClipboardEntry | null;
  t: (key: string) => string;
  pushToast: (msg: string, duration?: number) => void;
  onClose: () => void;
}

const LIST_CONTENT_LIMIT = 1990;

export default function TransformMenuModal({
  item,
  t,
  pushToast,
  onClose,
}: TransformMenuModalProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullText, setFullText] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!item) return;
    setQuery("");
    setActiveIndex(0);
    if (item.content_type === "image") {
      const existingOcr = extractImageOcrText(item);
      if (existingOcr) {
        setFullText(existingOcr);
      } else {
        setFullText("");
        invoke<string>("extract_image_ocr", { id: item.id, force: false })
          .then((ocr) => setFullText(ocr || ""))
          .catch(() => {});
      }
      return;
    }

    setFullText(item.content || "");
    if (item.content && item.content.length >= LIST_CONTENT_LIMIT) {
      invoke<string>("get_clipboard_content", { id: item.id })
        .then((res) => {
          if (res) setFullText(res);
        })
        .catch(() => {});
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [item]);

  const allTransforms = useMemo(() => computeTextTransforms(fullText), [fullText]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allTransforms;
    return allTransforms.filter((tr) => {
      const label = t(tr.labelKey);
      return (
        matchesTextOrPinyin(label, q) ||
        matchesTextOrPinyin(tr.keywords, q) ||
        tr.result.toLowerCase().includes(q.toLowerCase())
      );
    });
  }, [allTransforms, query, t]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!item) return null;

  const handlePasteTransform = async (tr: TextTransformItem) => {
    try {
      onClose();
      await invoke("paste_text_directly", { content: tr.result });
    } catch (err) {
      console.error("paste_text_directly error:", err);
      pushToast(t("transform_failed"));
    }
  };

  const handleCopyTransform = async (tr: TextTransformItem) => {
    try {
      await navigator.clipboard.writeText(tr.result);
      setCopiedId(tr.id);
      pushToast(t("copied"));
      setTimeout(() => setCopiedId(null), 1400);
    } catch (err) {
      console.error("copy transform error:", err);
    }
  };

  return createPortal(
    <div
      className="modal-overlay transform-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("transform_title")}
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
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((prev) =>
            filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0
          );
          return;
        }
        if (e.key === "Enter" && filtered[activeIndex]) {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            void handleCopyTransform(filtered[activeIndex]);
          } else {
            void handlePasteTransform(filtered[activeIndex]);
          }
        }
      }}
    >
      <div className="transform-modal-card">
        <div className="transform-modal-header">
          <div className="transform-modal-title-group">
            <Wand2 size={15} className="transform-modal-icon" />
            <span>{t("transform_title")}</span>
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

        <div className="transform-search-bar">
          <Search size={14} className="transform-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="transform-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("transform_search_placeholder")}
          />
          <kbd className="app-footer-kbd">Ctrl+K</kbd>
        </div>

        <div className="transform-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="transform-empty">{t("transform_empty")}</div>
          ) : (
            filtered.map((tr, idx) => {
              const isSelected = idx === activeIndex;
              const previewText =
                tr.result.length > 180 ? `${tr.result.slice(0, 180)}…` : tr.result;
              return (
                <div
                  key={tr.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`transform-option${isSelected ? " is-selected" : ""}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => void handlePasteTransform(tr)}
                >
                  <div className="transform-option-main">
                    <span className="transform-option-label">{t(tr.labelKey)}</span>
                    <code className="transform-option-preview">{previewText}</code>
                  </div>
                  <div className="transform-option-actions">
                    <button
                      type="button"
                      className="btn-icon"
                      title={t("copy")}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyTransform(tr);
                      }}
                    >
                      {copiedId === tr.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <span className="transform-paste-pill">
                      <ClipboardPaste size={12} />
                      <span>↵</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="transform-modal-footer">
          <span>{t("transform_footer_hint")}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
