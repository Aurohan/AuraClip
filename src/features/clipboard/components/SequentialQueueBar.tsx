import { FastForward, ListOrdered, X } from "lucide-react";

interface SequentialQueueBarProps {
  remainingCount: number;
  nextPreview: string;
  onPasteNext: () => void;
  onClearQueue: () => void;
  t: (key: string) => string;
}

export default function SequentialQueueBar({
  remainingCount,
  nextPreview,
  onPasteNext,
  onClearQueue,
  t,
}: SequentialQueueBarProps) {
  if (remainingCount <= 0) return null;

  return (
    <div className="sequential-queue-bar" role="status">
      <div className="sequential-queue-left">
        <span className="sequential-queue-badge">
          <ListOrdered size={12} />
          <span>{t("queue_remaining").replace("{n}", String(remainingCount))}</span>
        </span>
        {nextPreview && (
          <span className="sequential-queue-next" title={nextPreview}>
            {t("queue_next_prefix")} {nextPreview}
          </span>
        )}
      </div>
      <div className="sequential-queue-actions">
        <button
          type="button"
          className="sequential-queue-btn is-primary"
          onClick={onPasteNext}
        >
          <FastForward size={12} />
          <span>{t("queue_paste_next")}</span>
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={onClearQueue}
          title={t("queue_clear")}
          aria-label={t("queue_clear")}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
