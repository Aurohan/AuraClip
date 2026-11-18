import { ClipboardPaste, Copy, ListOrdered, X } from "lucide-react";

export type BatchJoinerKey = "newline" | "blankline" | "space" | "comma";

export const BATCH_JOINERS: Record<BatchJoinerKey, string> = {
  newline: "\n",
  blankline: "\n\n",
  space: " ",
  comma: ", ",
};

interface BatchSelectionBarProps {
  count: number;
  joiner: BatchJoinerKey;
  onJoinerChange: (joiner: BatchJoinerKey) => void;
  onMergePaste: () => void;
  onMergeCopy: () => void;
  onEnqueueSequential: () => void;
  onClear: () => void;
  t: (key: string) => string;
}

export default function BatchSelectionBar({
  count,
  joiner,
  onJoinerChange,
  onMergePaste,
  onMergeCopy,
  onEnqueueSequential,
  onClear,
  t,
}: BatchSelectionBarProps) {
  if (count <= 0) return null;

  const joinerOptions: Array<{ key: BatchJoinerKey; label: string }> = [
    { key: "newline", label: t("batch_join_newline") },
    { key: "blankline", label: t("batch_join_blankline") },
    { key: "space", label: t("batch_join_space") },
    { key: "comma", label: t("batch_join_comma") },
  ];

  return (
    <div className="batch-selection-bar" role="region" aria-label={t("batch_bar_label")}>
      <div className="batch-selection-left">
        <span className="batch-count-pill">
          {t("batch_selected_count").replace("{n}", String(count))}
        </span>
        <div className="batch-joiner-group" role="group">
          {joinerOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`batch-joiner-chip${joiner === opt.key ? " is-active" : ""}`}
              onClick={() => onJoinerChange(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="batch-selection-actions">
        <button
          type="button"
          className="batch-action-btn"
          onClick={onEnqueueSequential}
          title={t("batch_enqueue_sequential")}
        >
          <ListOrdered size={13} />
          <span>{t("batch_enqueue_short")}</span>
        </button>
        <button
          type="button"
          className="batch-action-btn"
          onClick={onMergeCopy}
          title={t("copy")}
        >
          <Copy size={13} />
          <span>{t("copy")}</span>
        </button>
        <button
          type="button"
          className="batch-action-btn is-primary"
          onClick={onMergePaste}
        >
          <ClipboardPaste size={13} />
          <span>{t("batch_merge_paste")}</span>
        </button>
        <button
          type="button"
          className="btn-icon batch-close-btn"
          onClick={onClear}
          title={t("cancel")}
          aria-label={t("cancel")}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
