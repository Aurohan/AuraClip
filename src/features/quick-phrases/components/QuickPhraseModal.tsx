import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppModal from "../../../shared/components/AppModal";
import type { QuickPhrase } from "../../../shared/types";
import { Tag, ShieldAlert } from "lucide-react";

interface QuickPhraseModalProps {
  open: boolean;
  onClose: () => void;
  initialPhrase?: Partial<QuickPhrase> | null;
  allExistingTags: string[];
  t: (key: string) => string;
  theme: string;
  onSave: (phrase: QuickPhrase) => Promise<void>;
}

export default function QuickPhraseModal({
  open,
  onClose,
  initialPhrase,
  allExistingTags,
  t,
  theme,
  onSave,
}: QuickPhraseModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSensitive, setIsSensitive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialPhrase?.title || "");
      setContent(initialPhrase?.content || "");
      setTags(initialPhrase?.tags || []);
      setTagInput("");
      setIsSensitive(initialPhrase?.isSensitive || false);
      setSaving(false);
    }
  }, [open, initialPhrase]);

  const handleAddTag = (rawTag: string) => {
    const trimmed = rawTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const phrase: QuickPhrase = {
        id: initialPhrase?.id || 0,
        title: title.trim() || content.trim().slice(0, 20),
        content: content.trim(),
        tags,
        isSensitive,
        sortOrder: initialPhrase?.sortOrder || 0,
        useCount: initialPhrase?.useCount || 0,
        createdAt: initialPhrase?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      for (const t of tags) {
        invoke("create_new_tag", { tagName: t }).catch(() => {});
      }
      await onSave(phrase);
      onClose();
    } catch (err) {
      console.error("Save phrase error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      theme={theme}
      panelClassName="modal-panel modal-form-dialog"
      ariaLabel={initialPhrase?.id ? t("edit_quick_phrase") : t("add_quick_phrase")}
    >
      <div className="tag-add-dialog-header" style={{ marginBottom: "14px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
          {initialPhrase?.id ? t("edit_quick_phrase") : t("add_quick_phrase")}
        </h3>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", opacity: 0.8 }}>
            {t("phrase_title_label")}
          </label>
          <input
            type="text"
            className="app-input"
            style={{ width: "100%", padding: "6px 10px", borderRadius: "6px" }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：常用手机号、工作邮箱、个人税号"
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", opacity: 0.8 }}>
            {t("phrase_content_label")} *
          </label>
          <textarea
            className="app-input"
            rows={4}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", resize: "vertical" }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在此输入将要直接填写的文本内容..."
            autoFocus
          />
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", marginBottom: "6px", opacity: 0.8 }}>
            <Tag size={12} />
            {t("phrase_tags_label")}
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
            {tags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  fontSize: "12px",
                  background: "rgba(79, 125, 255, 0.15)",
                  color: "var(--accent-color, #4f7dff)",
                  border: "1px solid rgba(79, 125, 255, 0.3)",
                  borderRadius: "12px",
                }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  style={{ border: "none", background: "none", cursor: "pointer", padding: "0 2px", color: "inherit" }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: "6px" }}>
            <input
              type="text"
              className="app-input"
              style={{ flex: 1, padding: "6px 10px", borderRadius: "6px" }}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }
              }}
              placeholder="输入标签名按回车或点添加..."
            />
            <button
              type="button"
              onClick={() => handleAddTag(tagInput)}
              className="btn-icon"
              style={{
                padding: "0 12px",
                borderRadius: "6px",
                border: "none",
                background: "var(--accent-color, #4f7dff)",
                color: "#fff",
                fontSize: "12px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              + 添加
            </button>
          </div>

          {allExistingTags.length > 0 && (
            <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
              <span style={{ fontSize: "11px", opacity: 0.6, alignSelf: "center" }}>候选:</span>
              {allExistingTags
                .filter((t) => !tags.includes(t))
                .slice(0, 8)
                .map((suggestTag) => (
                  <button
                    key={suggestTag}
                    type="button"
                    onClick={() => handleAddTag(suggestTag)}
                    style={{
                      border: "1px dashed rgba(128,128,128,0.3)",
                      background: "transparent",
                      color: "inherit",
                      fontSize: "11px",
                      borderRadius: "10px",
                      padding: "1px 6px",
                      cursor: "pointer",
                      opacity: 0.8,
                    }}
                  >
                    +{suggestTag}
                  </button>
                ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <input
            type="checkbox"
            id="phrase-is-sensitive"
            checked={isSensitive}
            onChange={(e) => setIsSensitive(e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          <label htmlFor="phrase-is-sensitive" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", cursor: "pointer" }}>
            <ShieldAlert size={13} color={isSensitive ? "#e67e22" : "inherit"} />
            {t("phrase_is_sensitive")}
          </label>
        </div>
      </div>

      <div className="modal-form-actions tag-add-dialog-actions" style={{ marginTop: "16px" }}>
        <button type="button" className="modal-button" onClick={onClose} disabled={saving}>
          {t("cancel")}
        </button>
        <button
          type="button"
          className="modal-button primary"
          onClick={handleSubmit}
          disabled={!content.trim() || saving}
        >
          {saving ? "..." : t("save")}
        </button>
      </div>
    </AppModal>
  );
}
