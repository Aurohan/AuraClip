import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardEntry } from "../../../shared/types";
import { BATCH_JOINERS, type BatchJoinerKey } from "../components/BatchSelectionBar";
import { extractImageOcrText } from "../../../shared/lib/searchMatch";
import { hasSensitiveTag } from "../../../shared/lib/sensitiveTags";
import { isTauriRuntime } from "../../../shared/lib/tauriRuntime";
import { derivePhraseTitleFromContent } from "../../quick-phrases/lib/phraseTemplateClient";

const BUILTIN_SENSITIVE_TAGS = new Set(["sensitive", "密码", "password"]);
const LIST_CONTENT_LIMIT = 1990;

interface UseBatchAndQueueOptions {
  history: ClipboardEntry[];
  navigableHistory: ClipboardEntry[];
  setHistory: Dispatch<SetStateAction<ClipboardEntry[]>>;
  t: (key: string) => string;
  pushToast: (msg: string, duration?: number) => void;
}

export function useBatchAndQueue({
  history,
  navigableHistory,
  setHistory,
  t,
  pushToast,
}: UseBatchAndQueueOptions) {
  const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);
  const [batchJoiner, setBatchJoiner] = useState<BatchJoinerKey>("newline");
  const [pasteQueueIds, setPasteQueueIds] = useState<number[]>([]);

  const batchOrderById = useMemo(() => {
    if (selectedBatchIds.length === 0) return undefined;
    const map: Record<number, number> = {};
    selectedBatchIds.forEach((id, idx) => {
      map[id] = idx + 1;
    });
    return map;
  }, [selectedBatchIds]);

  const handleBatchToggle = useCallback(
    (id: number, shiftKey: boolean) => {
      setSelectedBatchIds((prev) => {
        if (shiftKey && prev.length > 0) {
          const anchorId = prev[prev.length - 1];
          const anchorIdx = navigableHistory.findIndex((i) => i.id === anchorId);
          const targetIdx = navigableHistory.findIndex((i) => i.id === id);
          if (anchorIdx >= 0 && targetIdx >= 0) {
            const start = Math.min(anchorIdx, targetIdx);
            const end = Math.max(anchorIdx, targetIdx);
            const rangeIds = navigableHistory.slice(start, end + 1).map((i) => i.id);
            const merged = prev.slice();
            for (const rid of rangeIds) {
              if (!merged.includes(rid)) merged.push(rid);
            }
            return merged;
          }
        }
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      });
    },
    [navigableHistory]
  );

  const clearBatchSelection = useCallback(() => {
    setSelectedBatchIds([]);
  }, []);

  const resolveEntryPlainText = useCallback(async (found: ClipboardEntry): Promise<string> => {
    if (found.content_type === "image") {
      return extractImageOcrText(found);
    }
    if (found.content && found.content.length >= LIST_CONTENT_LIMIT && isTauriRuntime()) {
      try {
        const full = await invoke<string>("get_clipboard_content", { id: found.id });
        return full || found.content;
      } catch {
        return found.content;
      }
    }
    return found.content || "";
  }, []);

  const resolveBatchTexts = useCallback(async () => {
    const out: string[] = [];
    for (const id of selectedBatchIds) {
      const found = history.find((h) => h.id === id);
      if (!found) continue;
      const text = await resolveEntryPlainText(found);
      if (text) out.push(text);
    }
    return out;
  }, [selectedBatchIds, history, resolveEntryPlainText]);

  const handleMergePaste = useCallback(async () => {
    const texts = await resolveBatchTexts();
    if (texts.length === 0) return;
    const joined = texts.join(BATCH_JOINERS[batchJoiner]);
    setSelectedBatchIds([]);
    await invoke("paste_text_directly", { content: joined }).catch(console.error);
  }, [resolveBatchTexts, batchJoiner]);

  const handleMergeCopy = useCallback(async () => {
    const texts = await resolveBatchTexts();
    if (texts.length === 0) return;
    const joined = texts.join(BATCH_JOINERS[batchJoiner]);
    await navigator.clipboard.writeText(joined).catch(console.error);
    pushToast(t("batch_merged_copied").replace("{n}", String(texts.length)));
    setSelectedBatchIds([]);
  }, [resolveBatchTexts, batchJoiner, pushToast, t]);

  const handleEnqueueSequential = useCallback(async () => {
    if (selectedBatchIds.length === 0) return;
    const ids = selectedBatchIds.slice();
    await invoke("set_paste_queue", { itemIds: ids }).catch(console.error);
    setPasteQueueIds(ids);
    setSelectedBatchIds([]);
    pushToast(t("batch_enqueued_toast").replace("{n}", String(ids.length)));
  }, [selectedBatchIds, pushToast, t]);

  const handleExtractOcr = useCallback(
    async (item: ClipboardEntry) => {
      try {
        const existing = extractImageOcrText(item);
        const text =
          existing ||
          (await invoke<string>("extract_image_ocr", { id: item.id, force: false }));
        if (!text || !text.trim()) {
          pushToast(t("ocr_empty"));
          return;
        }
        setHistory((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, preview: `[OCR] ${text}` } : row
          )
        );
        await navigator.clipboard.writeText(text);
        pushToast(t("ocr_copied"));
      } catch (err) {
        console.error("extract_image_ocr error:", err);
        pushToast(t("ocr_empty"));
      }
    },
    [pushToast, setHistory, t]
  );

  const handleSaveAsPhrase = useCallback(
    async (item: ClipboardEntry) => {
      try {
        const content = (await resolveEntryPlainText(item)).trim();
        if (!content) return;
        const isSensitive = hasSensitiveTag(item.tags);
        const cleanTags = (item.tags || []).filter(
          (tg) => !BUILTIN_SENSITIVE_TAGS.has(tg.toLowerCase())
        );
        const title = derivePhraseTitleFromContent(
          item.note?.trim() || content,
          t("tab_quick_phrases")
        );
        await invoke("save_quick_phrase", {
          phrase: {
            id: 0,
            title,
            content,
            tags: cleanTags,
            isSensitive,
            sortOrder: 0,
            useCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        });
        pushToast(`${t("phrase_saved_from_clipboard")}: ${title}`);
      } catch (err) {
        console.error("handleSaveAsPhrase error:", err);
      }
    },
    [pushToast, resolveEntryPlainText, t]
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    const syncQueue = () => {
      invoke<number[]>("get_paste_queue")
        .then((ids) => {
          if (!disposed) setPasteQueueIds(ids || []);
        })
        .catch(() => {});
    };
    syncQueue();
    const u1 = listen("queue-item-pasted", syncQueue);
    const u2 = listen("queue-finished", () => {
      if (!disposed) setPasteQueueIds([]);
    });
    const u3 = listen("clipboard-updated", syncQueue);
    return () => {
      disposed = true;
      u1.then((off) => off()).catch(() => {});
      u2.then((off) => off()).catch(() => {});
      u3.then((off) => off()).catch(() => {});
    };
  }, []);

  const queueNextPreview = useMemo(() => {
    if (pasteQueueIds.length === 0) return "";
    const first = history.find((h) => h.id === pasteQueueIds[0]);
    if (!first) return `#${pasteQueueIds[0]}`;
    const raw =
      first.content_type === "image"
        ? extractImageOcrText(first) || t("type_image")
        : first.preview || first.content || "";
    const singleLine = raw.replace(/\s+/g, " ").trim();
    return singleLine.length > 42 ? `${singleLine.slice(0, 42)}…` : singleLine;
  }, [pasteQueueIds, history, t]);

  const clearPasteQueue = useCallback(() => {
    setPasteQueueIds([]);
    invoke("set_paste_queue", { itemIds: [] }).catch(console.error);
  }, []);

  return {
    selectedBatchIds,
    batchJoiner,
    setBatchJoiner,
    batchOrderById,
    handleBatchToggle,
    clearBatchSelection,
    handleMergePaste,
    handleMergeCopy,
    handleEnqueueSequential,
    handleExtractOcr,
    handleSaveAsPhrase,
    pasteQueueIds,
    queueNextPreview,
    clearPasteQueue,
  };
}
