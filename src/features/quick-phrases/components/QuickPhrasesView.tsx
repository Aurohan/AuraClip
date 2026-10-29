import { usePhraseTagScroll } from "../hooks/usePhraseTagScroll";
import type { ClipboardSortMode } from "../../app/types";
import { sortQuickPhrases } from "../lib/sortQuickPhrases";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import {
  Plus,
  Pin,
  PinOff,
  Copy,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  Tag as TagIcon,
  X,
  Lock,
  ArrowUp,
} from "lucide-react";
import { usePhrasePins } from "../hooks/usePhrasePins";
import type { QuickPhrase } from "../../../shared/types";
import { getTagColor, getTagTextColor } from "../../../shared/lib/utils";

interface QuickPhrasesViewProps {
  sortMode: ClipboardSortMode;
  t: (key: string) => string;
  theme: string;
  search: string;
  pushToast: (msg: string, duration?: number) => void;
  openConfirm: (options: {
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
  }) => void;
  onOpenTagManager?: () => void;
}

export default function QuickPhrasesView({
  sortMode,
  t,
  theme,
  search,
  pushToast,
  openConfirm,
  onOpenTagManager,
}: QuickPhrasesViewProps) {
  const { pins, togglePin } = usePhrasePins(pushToast);
  const [phrases, setPhrases] = useState<QuickPhrase[]>([]);
  const [savedTags, setSavedTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // States for inline card operations
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // Top bar tag creation & horizontal scrolling
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const {
    tagBarRef, trackRef, isDraggingThumbRef, tagScrollProgress, updateTagScrollMetrics,
    handleTagBarWheel, handleBarPointerDown, handleBarPointerMove, handleBarPointerUp,
    handleTrackClick, handleThumbPointerDown, handleThumbPointerMove, handleThumbPointerUp,
  } = usePhraseTagScroll();

  useEffect(() => {
    if (isCreatingTag && tagBarRef.current) {
      tagBarRef.current.scrollTo({
        left: tagBarRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
  }, [isCreatingTag]);

  // Tag custom colors state & realtime sync
  const [tagColors, setTagColors] = useState<Record<string, string>>({});

  const fetchTagColors = useCallback(async () => {
    try {
      const colors = await invoke<Record<string, string>>("get_tag_colors");
      if (colors) {
        setTagColors(colors);
      }
    } catch (e) {
      console.error("fetchTagColors error:", e);
    }
  }, []);

  useEffect(() => {
    fetchTagColors();
    let unlisten: (() => void) | undefined;
    listen("tag-colors-updated", () => {
      fetchTagColors();
    }).then((off) => {
      unlisten = off;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [fetchTagColors]);

  const handleUpdateTagColor = async (tag: string, newColor: string) => {
    try {
      setTagColors((prev) => ({ ...prev, [tag]: newColor }));
      await invoke("set_tag_color", { name: tag, color: newColor });
      await emit("tag-colors-updated");
      pushToast(`已修改 #${tag} 颜色`);
    } catch (err) {
      console.error("set_tag_color error:", err);
    }
  };

  const resolveTagBg = useCallback(
    (tName: string) => tagColors[tName] || getTagColor(tName, theme),
    [tagColors, theme]
  );

  // Card inline tag editing
  const [editingTagPhraseId, setEditingTagPhraseId] = useState<number | null>(null);
  const [inlineTagInput, setInlineTagInput] = useState("");

  // Card inline title/content editing
  const [editingContentPhraseId, setEditingContentPhraseId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSensitive, setEditSensitive] = useState(false);

  // Bottom new phrase creation form (replaces modal)
  const [isCreatingPhrase, setIsCreatingPhrase] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // 确保页面与祖先容器顶置，防止任何 scrollIntoView 导致 Header 移出可视范围
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const appContainer = document.querySelector(".app-container");
      if (appContainer) appContainer.scrollTop = 0;
      const mainContent = document.querySelector(".main-content");
      if (mainContent) mainContent.scrollTop = 0;
    }
  }, []);

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 80);
  };

  const scrollToTop = () => {
    listContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const [newPhraseTitle, setNewPhraseTitle] = useState("");
  const [newPhraseContent, setNewPhraseContent] = useState("");
  const [newPhraseTags, setNewPhraseTags] = useState<string[]>([]);
  const [newPhraseTagInput, setNewPhraseTagInput] = useState("");
  const [newPhraseSensitive, setNewPhraseSensitive] = useState(false);

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomCreateRef = useRef<HTMLDivElement | null>(null);

  const fetchPhrases = useCallback(async () => {
    try {
      const data = await invoke<QuickPhrase[]>("get_quick_phrases");
      setPhrases(data || []);
    } catch (err) {
      console.error("fetch quick phrases error:", err);
    }
  }, []);

  const fetchAllTags = useCallback(async () => {
    try {
      const tagCounts = await invoke<Record<string, number>>("get_all_tags_info");
      if (tagCounts) {
        setSavedTags(Object.keys(tagCounts));
      }
    } catch (err) {
      console.error("fetch tags error:", err);
    }
  }, []);

  useEffect(() => {
    fetchPhrases();
    fetchAllTags();
    let unlisten: (() => void) | null = null;
    listen("quick-phrases-changed", () => {
      fetchPhrases();
      fetchAllTags();
    }).then((off) => {
      unlisten = off;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [fetchPhrases, fetchAllTags]);

  // Extract all unique tags combining saved_tags and quick phrases
  const allTags = useMemo(() => {
    const set = new Set<string>();
    savedTags.forEach((t) => {
      if (t && t !== "sensitive") set.add(t);
    });
    phrases.forEach((p) => {
      p.tags?.forEach((tag) => {
        if (tag) set.add(tag);
      });
    });
    return Array.from(set);
  }, [savedTags, phrases]);

  useEffect(() => {
    updateTagScrollMetrics();
    const el = tagBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      updateTagScrollMetrics();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [allTags, updateTagScrollMetrics]);

  // Filtered by tag & search
  const filteredPhrases = useMemo(() => {
    return sortQuickPhrases(phrases.filter((p) => {
      if (selectedTag && !p.tags?.includes(selectedTag)) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const inTitle = p.title.toLowerCase().includes(q);
        const inContent = p.content.toLowerCase().includes(q);
        const inTags = p.tags?.some((t) => t.toLowerCase().includes(q));
        return inTitle || inContent || inTags;
      }
      return true;
    }), pins, sortMode);
  }, [phrases, selectedTag, search, pins, sortMode]);

  const toggleReveal = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 点击卡片直接：复制 + 关闭窗口 + 自动粘贴 (粘贴静音)
  const handleCardClick = async (phrase: QuickPhrase) => {
    try {
      await invoke("paste_quick_phrase", { id: phrase.id });
    } catch (err) {
      console.error("Paste quick phrase error:", err);
      try {
        await invoke("paste_text_directly", { content: phrase.content });
      } catch (e2) {
        console.error("Fallback paste error:", e2);
        pushToast("粘贴失败");
      }
    }
  };

  // 纯复制按钮：复制到剪贴板，播放复制音效，提示已复制，不关闭窗口
  const handleCopyOnly = async (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(phrase.content);
      setCopiedId(phrase.id);
      pushToast(`${t("phrase_copied")}: ${phrase.title}`);
      setTimeout(() => setCopiedId(null), 1800);
      invoke("mark_quick_phrase_used", { id: phrase.id }).catch(() => {});
    } catch (err) {
      console.error("Copy error:", err);
    }
  };

  const handleDelete = (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    openConfirm({
      title: t("phrase_delete_confirm_title"),
      message: `${t("phrase_delete_confirm_msg")} (${phrase.title})`,
      danger: true,
      onConfirm: async () => {
        try {
          await invoke("delete_quick_phrase", { id: phrase.id });
          fetchPhrases();
        } catch (err) {
          console.error("Delete error:", err);
        }
      },
    });
  };

  // 顶部新建全局分类标签
  const handleCreateTopTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setIsCreatingTag(false);
      return;
    }
    try {
      await invoke("create_new_tag", { tagName: trimmed });
      setIsCreatingTag(false);
      setNewTagName("");
      fetchAllTags();
      setSelectedTag(trimmed);
      pushToast(`已创建标签: #${trimmed}`);
    } catch (err) {
      console.error("create tag error:", err);
      setIsCreatingTag(false);
    }
  };



  // 卡片内联添加标签
  const handleAddTagToPhrase = async (phrase: QuickPhrase, tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;
    const currentTags = phrase.tags || [];
    if (currentTags.includes(trimmed)) return;
    const updatedTags = [...currentTags, trimmed];
    try {
      await invoke("create_new_tag", { tagName: trimmed }).catch(() => {});
      await invoke("save_quick_phrase", { phrase: { ...phrase, tags: updatedTags } });
      setInlineTagInput("");
      fetchPhrases();
      fetchAllTags();
    } catch (err) {
      console.error("add tag to phrase error:", err);
    }
  };

  // 卡片内联移除标签
  const handleRemoveTagFromPhrase = async (phrase: QuickPhrase, tagToRemove: string) => {
    const currentTags = phrase.tags || [];
    const updatedTags = currentTags.filter((t) => t !== tagToRemove);
    try {
      await invoke("save_quick_phrase", { phrase: { ...phrase, tags: updatedTags } });
      fetchPhrases();
      fetchAllTags();
    } catch (err) {
      console.error("remove tag from phrase error:", err);
    }
  };

  // 启动卡片内联标题/内容编辑
  const startEditingContent = (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingContentPhraseId(phrase.id);
    setEditTitle(phrase.title);
    setEditContent(phrase.content);
    setEditSensitive(phrase.isSensitive || false);
    setEditingTagPhraseId(null);
  };

  // 保存卡片内联标题/内容编辑
  const saveEditingContent = async (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editContent.trim()) {
      pushToast("内容不能为空");
      return;
    }
    try {
      const updated: QuickPhrase = {
        ...phrase,
        title: editTitle.trim() || editContent.trim().slice(0, 20),
        content: editContent.trim(),
        isSensitive: editSensitive,
        updatedAt: Date.now(),
      };
      await invoke("save_quick_phrase", { phrase: updated });
      setEditingContentPhraseId(null);
      fetchPhrases();
      pushToast("已保存修改");
    } catch (err) {
      console.error("Save content error:", err);
    }
  };

  // 保存底部新建短语
  const handleSaveNewPhrase = async () => {
    if (!newPhraseContent.trim()) {
      pushToast("请输入短语内容");
      return;
    }
    try {
      const phrase: QuickPhrase = {
        id: 0,
        title: newPhraseTitle.trim() || newPhraseContent.trim().slice(0, 20),
        content: newPhraseContent.trim(),
        tags: newPhraseTags,
        isSensitive: newPhraseSensitive,
        sortOrder: 0,
        useCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      for (const t of newPhraseTags) {
        invoke("create_new_tag", { tagName: t }).catch(() => {});
      }
      await invoke("save_quick_phrase", { phrase });
      setIsCreatingPhrase(false);
      setNewPhraseTitle("");
      setNewPhraseContent("");
      setNewPhraseTags([]);
      setNewPhraseTagInput("");
      setNewPhraseSensitive(false);
      fetchPhrases();
      fetchAllTags();
      pushToast("已成功新建常用短语");
    } catch (err) {
      console.error("Save new phrase error:", err);
    }
  };

  // 键盘快捷导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        isCreatingTag ||
        editingContentPhraseId !== null ||
        editingTagPhraseId !== null ||
        isCreatingPhrase
      ) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredPhrases.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredPhrases.length - 1)));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filteredPhrases.length > 0) {
        const item = filteredPhrases[focusedIndex];
        if (item) {
          e.preventDefault();
          handleCardClick(item);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    filteredPhrases,
    focusedIndex,
    isCreatingTag,
    editingContentPhraseId,
    editingTagPhraseId,
    isCreatingPhrase,
  ]);

  return (
    <div
      className="quick-phrases-view"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* 顶部标签筛选栏 (只保留分类胶囊与新建标签，彻底杜绝横向截断) */}
      {/* 顶部标签筛选栏整体容器 (左侧自适应可滑动标签栏 + 右侧固定标签管理按钮) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          paddingRight: "8px",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* 左侧可滚动标签区域 */}
        <div
          ref={tagBarRef}
          onScroll={updateTagScrollMetrics}
          onWheel={handleTagBarWheel}
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 10px 6px 12px",
            overflowX: "auto",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
            cursor: tagScrollProgress.canScroll ? "grab" : "default",
            userSelect: "none",
          }}
          className="hide-scrollbar"
        >
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`btn-icon ${selectedTag === null ? "active" : ""}`}
            style={{
              padding: "3px 12px",
              fontSize: "12px",
              borderRadius: "14px",
              height: "26px",
              border: "none",
              background:
                selectedTag === null
                  ? "linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)"
                  : "rgba(128, 128, 128, 0.1)",
              color: selectedTag === null ? "#ffffff" : "inherit",
              fontWeight: selectedTag === null ? 600 : 400,
              boxShadow:
                selectedTag === null ? "0 2px 6px rgba(129, 140, 248, 0.4)" : "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
          >
            {t("phrase_all_tags")}
          </button>

          {allTags.map((tag) => {
            const isSelected = selectedTag === tag;
            const bg = resolveTagBg(tag);

            return (
              <button
                key={tag}
                className="aurora-filter-chip"
                type="button"
                onClick={() => setSelectedTag(isSelected ? null : tag)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  document.getElementById(`tag-color-input-${tag}`)?.click();
                }}
                title={`点击筛选 #${tag}，右键修改颜色`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "14px",
                  height: "28px",
                  border: isSelected ? "none" : "1px solid rgba(147, 130, 245, 0.25)",
                  background: isSelected ? "var(--accent-color, #657cf1)" : `color-mix(in srgb, ${bg} 16%, var(--bg-panel, #fff))`,
                  color: isSelected ? "#ffffff" : "var(--text-primary, #334155)",
                  boxShadow: isSelected ? "0 2px 6px rgba(129, 140, 248, 0.4)" : "none",
                  padding: "0 12px",
                  gap: "6px",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: isSelected ? "#ffffff" : bg,
                    opacity: 0.8,
                  }}
                />
                <span style={{ fontSize: "12px", fontWeight: isSelected ? 600 : 500 }}>
                  #{tag}
                </span>
                <input
                  type="color"
                  id={`tag-color-input-${tag}`}
                  style={{ display: "none" }}
                  value={tagColors[tag] || bg}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleUpdateTagColor(tag, e.target.value)}
                />
              </button>
            );
          })}

          {/* 新建标签小按钮 / 内联输入框 */}
          {isCreatingTag ? (
            <div style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
              <input
                type="text"
                className="app-input"
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateTopTag();
                  } else if (e.key === "Escape") {
                    setIsCreatingTag(false);
                    setNewTagName("");
                  }
                }}
                onBlur={() => {
                  if (newTagName.trim()) {
                    handleCreateTopTag();
                  } else {
                    setIsCreatingTag(false);
                    setNewTagName("");
                  }
                }}
                placeholder="回车创建标签..."
                style={{
                  height: "26px",
                  padding: "2px 10px",
                  fontSize: "12px",
                  borderRadius: "14px",
                  width: "110px",
                  border: "1px solid var(--accent-color, #7c6dfa)",
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreatingTag(true)}
              className="btn-icon"
              title="新建分类标签"
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                borderRadius: "14px",
                height: "26px",
                border: "1px dashed rgba(147, 130, 245, 0.4)",
                background: "transparent",
                color: "inherit",
                opacity: 0.8,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                flexShrink: 0,
              }}
            >
              <Plus size={12} />
              <span>标签</span>
            </button>
          )}
        </div>

        {/* 右侧常驻固定“标签管理”小图标 (类似于剪贴板顶栏的小标签图标，点击直达全屏标签管理) */}
        {onOpenTagManager && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingLeft: "6px",
              borderLeft: "1px solid rgba(147, 130, 245, 0.2)",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              className="btn-icon"
              onClick={onOpenTagManager}
              title="标签管理 (点击进入全屏标签管理，可自定义标签颜色、名称等)"
              aria-label="标签管理"
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(147, 130, 245, 0.15)",
                color: "#7c6dfa",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <TagIcon size={15} />
            </button>
          </div>
        )}
      </div>

      {/* 标签栏底部淡蓝紫色微型可拖拽滚动轨 (当标签溢出时出现) */}
      {tagScrollProgress.canScroll ? (
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          title="点击轨道或左右拖动滑块查看更多分类标签"
          style={{
            height: "14px",
            padding: "4px 14px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            flexShrink: 0,
            borderBottom: "1px solid rgba(147, 130, 245, 0.15)",
            background: "transparent",
            position: "relative",
          }}
        >
          {/* 轨道背景槽 (极简半透明淡蓝紫底色) */}
          <div
            style={{
              width: "100%",
              height: "6px",
              borderRadius: "6px",
              background: "rgba(147, 130, 245, 0.15)",
              position: "relative",
            }}
          >
            {/* 可拖动滑块 (淡蓝紫色极光渐变，圆润灵敏) */}
            <div
              onPointerDown={handleThumbPointerDown}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${tagScrollProgress.thumbLeftRatio * (100 - tagScrollProgress.thumbWidthRatio * 100)}%`,
                width: `${tagScrollProgress.thumbWidthRatio * 100}%`,
                minWidth: "36px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)",
                boxShadow: "none",
                cursor: "pointer",
                touchAction: "none",
                transition: isDraggingThumbRef.current ? "none" : "box-shadow 0.15s ease",
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ height: "1px", background: "rgba(128,128,128,0.12)", flexShrink: 0 }} />
      )}

      {/* 常用语紧凑单列滚动列表 */}
      <div
        ref={listContainerRef}
        className="quick-phrases-scroll-container"
        onScroll={handleListScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "4px var(--layout-list-padding-x)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "4px",
          alignContent: "start",
        }}
      >
        {filteredPhrases.length === 0 && !isCreatingPhrase ? (
          <div
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "36px 20px",
              opacity: 0.6,
              fontSize: "13px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Sparkles size={28} opacity={0.5} />
            <p style={{ margin: 0 }}>{t("phrase_empty_tip")}</p>
          </div>
        ) : (
          filteredPhrases.map((phrase, idx) => {
            const isRevealed = revealedIds.has(phrase.id);
            const isFocused = idx === focusedIndex;
            const isJustCopied = copiedId === phrase.id;
            const isEditingTag = editingTagPhraseId === phrase.id;
            const isEditingContent = editingContentPhraseId === phrase.id;

            // 候选标签（已存在但该短语尚未添加的标签）
            const phraseExistingTags = new Set(phrase.tags || []);
            const candidateTags = allTags
              .filter((t) => !phraseExistingTags.has(t))
              .filter((t) => !inlineTagInput || t.toLowerCase().includes(inlineTagInput.toLowerCase()));

            return (
              <div
                key={phrase.id}
                className="aurora-phrase-card"
                onClick={() => {
                  if (!isEditingTag && !isEditingContent) {
                    handleCardClick(phrase);
                  }
                }}
                onMouseEnter={() => setFocusedIndex(idx)}
                title={isEditingTag || isEditingContent ? "" : "点击直接填入当前光标位置"}
                style={{
                  gridColumn: "1 / -1",
                  padding: "var(--layout-item-padding)",
                  borderRadius: "var(--card-radius)",
                  background: isJustCopied ? "rgba(16, 185, 129, 0.12)" : isFocused ? "var(--card-selected-background)" : "var(--layout-item-background)",
                  border: isFocused ? "1px solid var(--card-selected-border-color)" : "var(--card-border)",
                  cursor: isEditingTag || isEditingContent ? "default" : "pointer",
                  display: isEditingTag || isEditingContent ? "flex" : "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  alignItems: "center",
                  columnGap: "8px",
                  rowGap: "2px",
                  flexDirection: "column",
                  transition: "background var(--duration-base), border-color var(--duration-base)",
                  position: "relative",
                  boxShadow: "var(--card-shadow)",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              >
                {/* 状态 1: 正在内联编辑内容 */}
                {isEditingContent ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-color, #4f7dff)" }}>
                        编辑常用短语
                      </span>
                      <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", opacity: 0.8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={editSensitive}
                          onChange={(e) => setEditSensitive(e.target.checked)}
                        />
                        <Lock size={11} />
                        设为保密
                      </label>
                    </div>

                    <input
                      type="text"
                      className="app-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="标题 (如: 常用手机号)"
                      style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px" }}
                    />

                    <textarea
                      className="app-input"
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="内容..."
                      style={{ padding: "6px 8px", fontSize: "12px", borderRadius: "4px", resize: "vertical" }}
                      autoFocus
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "2px" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingContentPhraseId(null);
                        }}
                        className="btn-icon"
                        style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "4px" }}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={(e) => saveEditingContent(phrase, e)}
                        className="btn-icon"
                        style={{
                          padding: "4px 12px",
                          fontSize: "11px",
                          borderRadius: "4px",
                          background: "var(--accent-color, #4f7dff)",
                          color: "#fff",
                          fontWeight: 600,
                        }}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 标题栏与操作按钮 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px", gridColumn: "1 / -1", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
                        {phrase.isSensitive && (
                          <Lock size={11} style={{ opacity: 0.65, flexShrink: 0, color: "var(--accent-color, #4f7dff)" }} />
                        )}
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "var(--layout-meta-font-size)",
                            color: "var(--text-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            letterSpacing: "0.2px",
                          }}
                          title={phrase.title}
                        >
                          {phrase.title}
                        </span>
                        {pins.includes(phrase.id) && <Pin size={10} aria-label="已置顶" style={{ color: "var(--accent-color)", flexShrink: 0 }} />}

                        {isJustCopied && (
                          <span
                            style={{
                              fontSize: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "2px",
                              color: "#10b981",
                              fontWeight: 600,
                              flexShrink: 0,
                              marginLeft: "2px",
                            }}
                          >
                            <Check size={10} /> 复制
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: "10px", color: "var(--text-secondary)", opacity: 0.72, whiteSpace: "nowrap" }}>
                        使用 {phrase.useCount || 0} 次 · {new Date(phrase.updatedAt || phrase.createdAt).toLocaleDateString()}
                      </span>
                      {/* 动作按钮区 */}
                      <div
                        className="item-actions aurora-phrase-actions"
                        style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {phrase.isSensitive && (
                          <button
                            type="button"
                            onClick={(e) => toggleReveal(phrase.id, e)}
                            className="btn-icon"
                            title={isRevealed ? "隐藏内容" : "显示明文"}
                            style={{ padding: "3px", opacity: 0.7 }}
                          >
                            {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleCopyOnly(phrase, e)}
                          className="btn-icon"
                          title="仅复制到剪贴板"
                          style={{ padding: "3px", opacity: 0.8 }}
                        >
                          {isJustCopied ? <Check size={12} color="#10b981" /> : <Copy size={13} />}
                        </button>

                        <button type="button" className="btn-icon" title={pins.includes(phrase.id) ? "取消置顶" : "置顶"}
                          aria-label={pins.includes(phrase.id) ? "取消置顶" : "置顶"}
                          onClick={(e) => { e.stopPropagation(); void togglePin(phrase.id); }}>
                          {pins.includes(phrase.id) ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>

                        {/* 标签管理按钮：完全复用剪贴板端，点击展开内联标签面板 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTagPhraseId(isEditingTag ? null : phrase.id);
                            setInlineTagInput("");
                          }}
                          className={`btn-icon ${isEditingTag ? "active" : ""}`}
                          title="管理标签"
                          style={{
                            padding: "3px",
                            color: isEditingTag ? "var(--accent-color, #4f7dff)" : "inherit",
                            opacity: isEditingTag ? 1 : 0.7,
                          }}
                        >
                          <TagIcon size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => startEditingContent(phrase, e)}
                          className="btn-icon"
                          title="编辑短语"
                          style={{ padding: "3px", opacity: 0.7 }}
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleDelete(phrase, e)}
                          className="btn-icon"
                          title={t("delete")}
                          style={{ padding: "3px", opacity: 0.7, color: "var(--danger-color, #e74c3c)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* 内容预览 */}
                    <div
                      style={{
                        fontSize: "var(--clipboard-item-font-size)",
                        color: "var(--text-primary)",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: phrase.isSensitive && !isRevealed ? "monospace" : "inherit",
                        letterSpacing: phrase.isSensitive && !isRevealed ? "2px" : "normal",
                        padding: 0,
                      }}
                    >
                      {phrase.isSensitive && !isRevealed ? "••••••••••••••••" : phrase.content}
                    </div>

                    {/* 标签展示区与内联标签编辑器 (对标剪贴板端 Image 2) */}
                    <div
                      className={`item-tags-container${isEditingTag ? " tag-edit-active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "4px",
                        marginTop: 0,
                        justifyContent: "flex-end",
                        minWidth: 0,
                      }}
                    >
                      {phrase.tags?.map((t) => {
                        const bg = resolveTagBg(t);
                        return (
                          <span
                            key={t}
                            className="tag-chip"
                            style={{
                              background: `color-mix(in srgb, ${bg} 17%, var(--bg-panel, #fff))`,
                              color: "var(--text-secondary, #536179)",
                              fontSize: "11px",
                              padding: "2px 7px",
                              borderRadius: "10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            #{t}
                            {isEditingTag && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveTagFromPhrase(phrase, t);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  color: "inherit",
                                  opacity: 0.75,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <X size={10} />
                              </button>
                            )}
                          </span>
                        );
                      })}

                      {!isEditingTag && !phrase.tags?.length && (
                        <button type="button" className="aurora-add-tag" onClick={(e) => {
                          e.stopPropagation();
                          setEditingTagPhraseId(phrase.id);
                          setInlineTagInput("");
                        }} aria-label="为短语添加标签">＋ 添加标签</button>
                      )}

                      {/* 内联添加标签控件与候选弹层 */}
                      {isEditingTag && (
                        <div
                          className="tag-edit-anchor"
                          style={{
                            position: "relative",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <div
                            className="tag-edit-input-row"
                            style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}
                          >
                            <input
                              type="text"
                              value={inlineTagInput}
                              onChange={(e) => setInlineTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddTagToPhrase(phrase, inlineTagInput);
                                } else if (e.key === "Escape") {
                                  setEditingTagPhraseId(null);
                                }
                              }}
                              className="tag-input"
                              placeholder="输入标签名..."
                              autoFocus
                              style={{
                                background: "var(--bg-input, rgba(128,128,128,0.1))",
                                border: "1px solid rgba(128,128,128,0.2)",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                fontSize: "11px",
                                color: "var(--text-primary)",
                                outline: "none",
                                width: "80px",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddTagToPhrase(phrase, inlineTagInput)}
                              className="btn-icon"
                              style={{ padding: "2px", height: "20px", width: "20px" }}
                              title="添加新标签"
                            >
                              <Plus size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTagPhraseId(null)}
                              className="btn-icon"
                              style={{ padding: "2px", height: "20px", width: "20px" }}
                              title="完成"
                            >
                              <Check size={12} color="#10b981" />
                            </button>
                          </div>

                          {/* 候选已有标签浮层 (点选直接一键附加) */}
                          {candidateTags.length > 0 && (
                            <div
                              className="tag-edit-suggestions-popover hide-scrollbar"
                              style={{
                                position: "absolute",
                                left: 0,
                                top: "calc(100% + 4px)",
                                zIndex: 60,
                                background: "var(--popover-background, #1e1e24)",
                                border: "1px solid rgba(128,128,128,0.25)",
                                borderRadius: "6px",
                                padding: "4px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px",
                                minWidth: "120px",
                                maxWidth: "200px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                              }}
                            >
                              {candidateTags.map((cTag) => {
                                const bg = resolveTagBg(cTag);
                                const fg = getTagTextColor(bg, theme);
                                return (
                                  <button
                                    key={cTag}
                                    type="button"
                                    onClick={() => handleAddTagToPhrase(phrase, cTag)}
                                    className="tag-suggest-item"
                                    title={`点击添加 #${cTag}`}
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      padding: "1px 2px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <span
                                      className="tag-suggest-pill"
                                      style={{
                                        background: bg,
                                        color: fg,
                                        fontSize: "10px",
                                        padding: "1px 6px",
                                        borderRadius: "6px",
                                      }}
                                    >
                                      +{cTag}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                  </>
                )}
              </div>
            );
          })
        )}

        {/* 底部新建常用短语按钮与内联创建表单 */}
        {isCreatingPhrase ? (
          <div
            ref={bottomCreateRef}
            style={{
              gridColumn: "1 / -1",
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(79, 125, 255, 0.08)",
              border: "1px solid var(--accent-color, #4f7dff)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              boxShadow: "0 2px 10px rgba(79, 125, 255, 0.2)",
              marginTop: "4px",
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-color, #4f7dff)" }}>
                新建常用短语
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", opacity: 0.8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newPhraseSensitive}
                  onChange={(e) => setNewPhraseSensitive(e.target.checked)}
                />
                <Lock size={11} />
                设为保密 (默认以••••显示)
              </label>
            </div>

            <input
              type="text"
              className="app-input"
              value={newPhraseTitle}
              onChange={(e) => setNewPhraseTitle(e.target.value)}
              placeholder="常用语标题 (如: 个人手机号、工作邮箱、税号)"
              style={{ padding: "6px 10px", fontSize: "12px", borderRadius: "6px" }}
            />

            <textarea
              className="app-input"
              rows={3}
              value={newPhraseContent}
              onChange={(e) => setNewPhraseContent(e.target.value)}
              placeholder="输入常用内容 (点击后将直接填入当前光标位置)..."
              style={{ padding: "8px 10px", fontSize: "12px", borderRadius: "6px", resize: "vertical" }}
              autoFocus
            />

            {/* 标签直选区：点选已有标签，或输入新标签 */}
            <div>
              <div style={{ fontSize: "11px", opacity: 0.7, marginBottom: "4px" }}>短语分类标签:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginBottom: "6px" }}>
                {newPhraseTags.map((t) => {
                  const bg = resolveTagBg(t);
                  const fg = getTagTextColor(bg, theme);
                  return (
                    <span
                      key={t}
                      style={{
                        background: bg,
                        color: fg,
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      #{t}
                      <button
                        type="button"
                        onClick={() => setNewPhraseTags(newPhraseTags.filter((tag) => tag !== t))}
                        style={{ background: "none", border: "none", padding: 0, color: "inherit", cursor: "pointer" }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}

                <div style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <input
                    type="text"
                    value={newPhraseTagInput}
                    onChange={(e) => setNewPhraseTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        const tr = newPhraseTagInput.trim();
                        if (tr && !newPhraseTags.includes(tr)) {
                          setNewPhraseTags([...newPhraseTags, tr]);
                          setNewPhraseTagInput("");
                        }
                      }
                    }}
                    placeholder="输入标签按回车..."
                    style={{
                      padding: "2px 6px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      width: "90px",
                      background: "rgba(128,128,128,0.1)",
                      border: "1px solid rgba(128,128,128,0.2)",
                      outline: "none",
                      color: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const tr = newPhraseTagInput.trim();
                      if (tr && !newPhraseTags.includes(tr)) {
                        setNewPhraseTags([...newPhraseTags, tr]);
                        setNewPhraseTagInput("");
                      }
                    }}
                    className="btn-icon"
                    style={{ padding: "2px", height: "20px", width: "20px" }}
                  >
                    <Plus size={11} />
                  </button>
                </div>
              </div>

              {/* 快速点选全局已有标签 */}
              {allTags.filter((t) => !newPhraseTags.includes(t)).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" }}>
                  <span style={{ fontSize: "10px", opacity: 0.5 }}>点击直接添加已有标签:</span>
                  {allTags
                    .filter((t) => !newPhraseTags.includes(t))
                    .map((existTag) => {
                      const bg = resolveTagBg(existTag);
                      const fg = getTagTextColor(bg, theme);
                      return (
                        <button
                          key={existTag}
                          type="button"
                          onClick={() => setNewPhraseTags([...newPhraseTags, existTag])}
                          style={{
                            background: bg,
                            color: fg,
                            border: "none",
                            borderRadius: "6px",
                            padding: "1px 6px",
                            fontSize: "10px",
                            cursor: "pointer",
                          }}
                        >
                          +{existTag}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
              <button
                type="button"
                onClick={() => setIsCreatingPhrase(false)}
                className="btn-icon"
                style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px" }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveNewPhrase}
                className="btn-icon"
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  background: "var(--accent-color, #4f7dff)",
                  color: "#ffffff",
                  fontWeight: 600,
                  boxShadow: "0 2px 6px rgba(79, 125, 255, 0.35)",
                }}
              >
                保存并创建
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsCreatingPhrase(true);
              setTimeout(() => {
                if (listContainerRef.current) {
                  listContainerRef.current.scrollTo({
                    top: listContainerRef.current.scrollHeight,
                    behavior: "smooth",
                  });
                }
              }, 60);
            }}
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px dashed rgba(79, 125, 255, 0.45)",
              background: "rgba(79, 125, 255, 0.05)",
              color: "var(--accent-color, #4f7dff)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
              marginTop: "4px",
              marginBottom: "12px",
              flexShrink: 0,
            }}
          >
            <Plus size={15} />
            <span>新建常用短语</span>
          </button>
        )}
      </div>

      {/* 回到顶部悬浮按钮 (与剪切板一致，滚落时出现，一键无缝滑回顶端) */}
      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="btn-icon"
          style={{
            position: "absolute",
            right: "20px",
            bottom: "20px",
            zIndex: 40,
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "var(--accent-color, #4f7dff)",
            color: "#ffffff",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          aria-label="回到顶部"
          title="回到顶部"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </div>
  );
}
