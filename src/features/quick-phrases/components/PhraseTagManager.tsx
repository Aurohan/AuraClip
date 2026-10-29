import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import {
  Search,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Edit2,
  Copy,
  Check,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  X,
} from "lucide-react";
import { usePhrasePins } from "../hooks/usePhrasePins";
import { usePhraseTagFilters } from "../hooks/usePhraseTagFilters";
import type { QuickPhrase } from "../../../shared/types";
import { getTagColor, getTagTextColor } from "../../../shared/lib/utils";

interface PhraseTagManagerProps {
  t: (key: string) => string;
  theme: string;
  pushToast: (msg: string, duration?: number) => void;
  openConfirm: (options: {
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
  }) => void;
  initialTag?: string | null;
}

export default function PhraseTagManager({
  t,
  theme,
  pushToast,
  openConfirm,
  initialTag,
}: PhraseTagManagerProps) {
  const { pins, togglePin } = usePhrasePins(pushToast);
  const [phrases, setPhrases] = useState<QuickPhrase[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [tagSearch, setTagSearch] = useState("");
  const [phraseSearch, setPhraseSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);

  // Sidebar tag editing / creation
  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  // Phrase card interactions
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);

  // Edit phrase modal
  const [editingPhrase, setEditingPhrase] = useState<QuickPhrase | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSensitive, setEditSensitive] = useState(false);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");

  // New phrase under selected tag
  const [isCreatingPhrase, setIsCreatingPhrase] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newSensitive, setNewSensitive] = useState(false);

  // Fetch phrases
  const fetchPhrases = useCallback(async () => {
    try {
      const data = await invoke<QuickPhrase[]>("get_quick_phrases");
      setPhrases(data || []);
    } catch (err) {
      console.error("fetchPhrases in PhraseTagManager error:", err);
    }
  }, []);

  // Fetch tag colors
  const fetchTagColors = useCallback(async () => {
    try {
      const colors = await invoke<Record<string, string>>("get_tag_colors");
      if (colors) setTagColors(colors);
    } catch (err) {
      console.error("fetchTagColors error:", err);
    }
  }, []);

  useEffect(() => {
    fetchPhrases();
    fetchTagColors();

    let unlistenPhrases: (() => void) | undefined;
    let unlistenColors: (() => void) | undefined;

    listen("quick-phrases-changed", () => {
      fetchPhrases();
    }).then((off) => {
      unlistenPhrases = off;
    });

    listen("tag-colors-updated", () => {
      fetchTagColors();
    }).then((off) => {
      unlistenColors = off;
    });

    return () => {
      if (unlistenPhrases) unlistenPhrases();
      if (unlistenColors) unlistenColors();
    };
  }, [fetchPhrases, fetchTagColors]);

  const { filteredTagList, displayPhrases } = usePhraseTagFilters(
    phrases, pins, tagSearch, selectedTag, phraseSearch,
  );

  const resolveTagBg = useCallback(
    (tagName: string) => tagColors[tagName] || getTagColor(tagName, theme),
    [tagColors, theme]
  );

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

  // Create new tag in sidebar
  const handleCreateTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setIsCreatingTag(false);
      return;
    }
    setIsCreatingTag(false);
    setNewTagName("");
    setSelectedTag(trimmed);
    pushToast(`已创建短语标签: #${trimmed}`);
  };

  // Rename tag globally across quick phrases
  const handleRenameTag = async (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingTagName(null);
      return;
    }
    try {
      await invoke("rename_phrase_tag", { oldName, newName: trimmed });
      if (selectedTag === oldName) setSelectedTag(trimmed);
      setEditingTagName(null);
      fetchPhrases();
      pushToast(`标签 #${oldName} 已重命名为 #${trimmed}`);
    } catch (err) {
      console.error("rename tag error:", err);
      pushToast("重命名标签失败");
      setEditingTagName(null);
    }
  };

  // Delete tag globally from all quick phrases
  const handleDeleteTag = (tagName: string) => {
    openConfirm({
      title: "删除短语标签",
      message: `确定要删除标签 #${tagName} 吗？这会从所有包含它的常用短语中移除此标签，短语本身不会被删除。`,
      danger: true,
      onConfirm: async () => {
        try {
          await invoke("delete_phrase_tag", { tagName });
          if (selectedTag === tagName) setSelectedTag(null);
          fetchPhrases();
          pushToast(`已删除短语标签 #${tagName}`);
        } catch (err) {
          console.error("delete phrase tag error:", err);
          pushToast("删除标签失败");
        }
      },
    });
  };

  // Copy phrase content
  const handleCopy = async (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(phrase.content);
      setCopiedId(phrase.id);
      pushToast(`已复制: ${phrase.title}`);
      setTimeout(() => setCopiedId(null), 1800);
      invoke("mark_quick_phrase_used", { id: phrase.id }).catch(() => {});
    } catch (err) {
      console.error("copy error:", err);
    }
  };

  const handlePaste = async (phrase: QuickPhrase) => {
    try {
      await invoke("paste_quick_phrase", { id: phrase.id });
    } catch (err) {
      console.error("paste quick phrase error:", err);
      pushToast("粘贴失败");
    }
  };

  // Remove tag from a specific phrase
  const handleRemoveTagFromPhrase = async (phrase: QuickPhrase, tagToRemove: string) => {
    const updatedTags = (phrase.tags || []).filter((t) => t !== tagToRemove);
    try {
      await invoke("save_quick_phrase", { phrase: { ...phrase, tags: updatedTags } });
      fetchPhrases();
      pushToast(`已从短语中移除 #${tagToRemove}`);
    } catch (err) {
      console.error("remove tag error:", err);
    }
  };

  // Start editing phrase
  const handleStartEditPhrase = (phrase: QuickPhrase, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPhrase(phrase);
    setEditTitle(phrase.title);
    setEditContent(phrase.content);
    setEditSensitive(phrase.isSensitive || false);
    setEditTags(phrase.tags || []);
    setEditTagInput("");
  };

  // Save edited phrase
  const handleSaveEditPhrase = async () => {
    if (!editingPhrase) return;
    if (!editContent.trim()) {
      pushToast("短语内容不能为空");
      return;
    }
    try {
      const updated: QuickPhrase = {
        ...editingPhrase,
        title: editTitle.trim() || editContent.trim().slice(0, 20),
        content: editContent.trim(),
        isSensitive: editSensitive,
        tags: editTags,
        updatedAt: Date.now(),
      };
      await invoke("save_quick_phrase", { phrase: updated });
      setEditingPhrase(null);
      fetchPhrases();
      pushToast("短语已保存");
    } catch (err) {
      console.error("save phrase error:", err);
    }
  };

  // Create new phrase under currently selected tag
  const handleCreatePhraseUnderTag = async () => {
    if (!newContent.trim()) {
      pushToast("请输入短语内容");
      return;
    }
    const tags = selectedTag ? [selectedTag] : [];
    const phrase: QuickPhrase = {
      id: 0,
      title: newTitle.trim() || newContent.trim().slice(0, 20),
      content: newContent.trim(),
      tags,
      isSensitive: newSensitive,
      sortOrder: 0,
      useCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await invoke("save_quick_phrase", { phrase });
      setIsCreatingPhrase(false);
      setNewTitle("");
      setNewContent("");
      setNewSensitive(false);
      fetchPhrases();
      pushToast(selectedTag ? `已在 #${selectedTag} 下新建短语` : "已新建短语");
    } catch (err) {
      console.error("create phrase error:", err);
    }
  };

  const toggleReveal = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="phrase-tag-manager-container"
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        position: "relative",
        background: "var(--bg-content, linear-gradient(180deg, #f5f8fc 0%, #edf2f8 100%))",
        color: "var(--text-primary, #182235)",
      }}
    >
      {/* 左侧：精简浅色分类栏 (宽度 155px) */}
      <div
        className="phrase-tag-sidebar"
        style={{
          width: "155px",
          minWidth: "140px",
          maxWidth: "180px",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--pane-divider, var(--line-soft, rgba(24, 34, 53, 0.12)))",
          background: "var(--pane-sidebar-background, var(--bg-panel, rgba(255, 255, 255, 0.78)))",
          backdropFilter: "var(--shell-backdrop-filter, blur(12px))",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        {/* 侧栏顶端：新建与搜索 */}
        <div style={{ padding: "8px 8px 6px 8px", borderBottom: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))" }}>
          {isCreatingTag ? (
            <input
              type="text"
              autoFocus
              className="app-input"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateTag();
                } else if (e.key === "Escape") {
                  setIsCreatingTag(false);
                  setNewTagName("");
                }
              }}
              onBlur={() => {
                if (newTagName.trim()) {
                  handleCreateTag();
                } else {
                  setIsCreatingTag(false);
                  setNewTagName("");
                }
              }}
              placeholder="回车确认创建..."
              style={{
                width: "100%",
                height: "26px",
                fontSize: "11.5px",
                padding: "2px 6px",
                borderRadius: "5px",
                border: "1px solid var(--accent-color, #6366f1)",
                boxSizing: "border-box",
                background: "var(--bg-input, rgba(255, 255, 255, 0.96))",
                color: "var(--text-primary, #182235)",
              }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "var(--bg-input, rgba(255, 255, 255, 0.96))",
                  border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))",
                  borderRadius: "5px",
                  padding: "0 6px",
                  height: "26px",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <Search size={12} color="var(--text-secondary, #536179)" style={{ marginRight: "4px", flexShrink: 0 }} />
                <input
                  type="text"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="搜索标签..."
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary, #182235)",
                    fontSize: "11px",
                    width: "100%",
                    outline: "none",
                  }}
                />
                {tagSearch && (
                  <button
                    type="button"
                    onClick={() => setTagSearch("")}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsCreatingTag(true)}
                title="新建分类标签"
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "5px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(99, 102, 241, 0.1)",
                  color: "#6366f1",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <Plus size={13} />
              </button>
            </div>
          )}
        </div>

        {/* 侧栏标签列表 */}
        <div
          className="hide-scrollbar"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 6px 8px 6px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {/* 全部常用短语选项 */}
          <div
            onClick={() => setSelectedTag(null)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "11.5px",
              background:
                selectedTag === null
                  ? "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.18) 100%)"
                  : "transparent",
              border: selectedTag === null ? "1px solid rgba(99, 102, 241, 0.35)" : "1px solid transparent",
              fontWeight: selectedTag === null ? 600 : 400,
              color: selectedTag === null ? "#4f46e5" : "#334155",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
              <Sparkles size={12} color="#6366f1" style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                全部短语
              </span>
            </div>
            <span
              style={{
                fontSize: "10px",
                opacity: 0.8,
                background: selectedTag === null ? "rgba(99, 102, 241, 0.15)" : "rgba(0, 0, 0, 0.06)",
                color: selectedTag === null ? "#4f46e5" : "#64748b",
                padding: "1px 5px",
                borderRadius: "8px",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {phrases.length}
            </span>
          </div>

          {filteredTagList.map(({ name, count }) => {
            const isSelected = selectedTag === name;
            const isEditing = editingTagName === name;
            const bg = resolveTagBg(name);

            return (
              <div
                key={name}
                onClick={() => !isEditing && setSelectedTag(name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  document.getElementById(`tag-sidebar-color-${name}`)?.click();
                }}
                title={`#${name} · 共 ${count} 条短语\n右键可更改颜色`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 6px 5px 8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "11.5px",
                  background: isSelected
                    ? "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.18) 100%)"
                    : "transparent",
                  border: isSelected ? "1px solid rgba(99, 102, 241, 0.35)" : "1px solid transparent",
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? "#4f46e5" : "#334155",
                  transition: "all 0.15s ease",
                  position: "relative",
                }}
              >
                {/* 颜色圆点 + 标签名 */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      document.getElementById(`tag-sidebar-color-${name}`)?.click();
                    }}
                    title="点击修改颜色"
                    style={{
                      width: "9px",
                      height: "9px",
                      borderRadius: "50%",
                      background: bg,
                      border: "1px solid rgba(0, 0, 0, 0.15)",
                      flexShrink: 0,
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    }}
                  />
                  <input
                    type="color"
                    id={`tag-sidebar-color-${name}`}
                    style={{ display: "none" }}
                    value={tagColors[name] || bg}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleUpdateTagColor(name, e.target.value)}
                  />

                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      className="app-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleRenameTag(name);
                        } else if (e.key === "Escape") {
                          setEditingTagName(null);
                        }
                      }}
                      onBlur={() => handleRenameTag(name)}
                      style={{
                        height: "20px",
                        fontSize: "11px",
                        padding: "1px 4px",
                        borderRadius: "3px",
                        width: "100%",
                        background: "var(--bg-input, rgba(255, 255, 255, 0.96))",
                        color: "var(--text-primary, #182235)",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      #{name}
                    </span>
                  )}
                </div>

                {/* 数量与编辑/删除按钮 */}
                <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
                  {isSelected && !isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTagName(name);
                          setRenameValue(name);
                        }}
                        className="btn-icon"
                        title="重命名标签"
                        style={{ padding: "1px", opacity: 0.7, color: "#4f46e5" }}
                      >
                        <Edit2 size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(name);
                        }}
                        className="btn-icon"
                        title="删除标签"
                        style={{ padding: "1px", opacity: 0.7, color: "var(--danger-color, #ef4444)" }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </>
                  )}
                  <span
                    style={{
                      fontSize: "10px",
                      opacity: 0.8,
                      background: isSelected ? "rgba(99, 102, 241, 0.15)" : "rgba(0, 0, 0, 0.06)",
                      color: isSelected ? "#4f46e5" : "#64748b",
                      padding: "1px 4px",
                      borderRadius: "6px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧：随当前主题透出窗口材质的主展示区 */}
      <div
        className="phrase-tag-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        {/* 顶部标题栏 */}
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            flexShrink: 0,
            background: "var(--advanced-surface-background, rgba(255, 255, 255, 0.48))",
            backdropFilter: "var(--shell-backdrop-filter, blur(12px))",
          }}
        >
          {/* 左侧：当前标签标题与计数 */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flex: 1 }}>
            {selectedTag ? (
              <>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: resolveTagBg(selectedTag),
                    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "13.5px",
                    fontWeight: 700,
                    color: "#4f46e5",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  #{selectedTag}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ({displayPhrases.length} 条短语)
                </span>
              </>
            ) : (
              <>
                <Sparkles size={14} color="#6366f1" style={{ flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: "13.5px",
                    fontWeight: 700,
                    color: "#0f172a",
                    whiteSpace: "nowrap",
                  }}
                >
                  全部常用短语
                </span>
                <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap" }}>
                  ({phrases.length} 条短语)
                </span>
              </>
            )}
          </div>

          {/* 右侧：紧凑搜索与新建短语按钮 (单行无折行) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            {/* 搜索框 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--bg-input, rgba(255, 255, 255, 0.96))",
                border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))",
                borderRadius: "5px",
                padding: "0 6px",
                height: "26px",
                width: "110px",
              }}
            >
              <Search size={11} color="var(--text-secondary, #536179)" style={{ marginRight: "4px", flexShrink: 0 }} />
              <input
                type="text"
                value={phraseSearch}
                onChange={(e) => setPhraseSearch(e.target.value)}
                placeholder={t("quick_phrases_search_placeholder") || "搜索短语..."}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary, #182235)",
                  fontSize: "11px",
                  width: "100%",
                  outline: "none",
                }}
              />
            </div>

            {/* 新建短语按钮 (高度 26px，单行不折行) */}
            <button
              type="button"
              onClick={() => setIsCreatingPhrase(true)}
              className="btn-icon"
              style={{
                height: "26px",
                padding: "0 9px",
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "5px",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                color: "#ffffff",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 5px rgba(99, 102, 241, 0.25)",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <Plus size={12} />
              <span>新建短语</span>
            </button>
          </div>
        </div>

        {/* 新建短语折叠面板 */}
        {isCreatingPhrase && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(99, 102, 241, 0.05)",
              borderBottom: "1px solid rgba(99, 102, 241, 0.18)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#4f46e5" }}>
                {selectedTag ? `在 #${selectedTag} 下新建短语` : "新建常用短语"}
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#475569", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newSensitive}
                  onChange={(e) => setNewSensitive(e.target.checked)}
                />
                <Lock size={11} />
                设为保密
              </label>
            </div>

            <input
              type="text"
              className="app-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="短语标题 (如: 个人邮箱、DeepSeek API)"
              style={{ padding: "4px 8px", fontSize: "11.5px", borderRadius: "5px", background: "var(--bg-input, rgba(255, 255, 255, 0.96))", border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))" }}
            />

            <textarea
              className="app-input"
              rows={2}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="短语内容..."
              style={{ padding: "5px 8px", fontSize: "11.5px", borderRadius: "5px", resize: "vertical", background: "var(--bg-input, rgba(255, 255, 255, 0.96))", border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))" }}
              autoFocus
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setIsCreatingPhrase(false)}
                className="btn-icon"
                style={{ padding: "3px 8px", fontSize: "11px", borderRadius: "4px", background: "transparent", color: "#64748b" }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreatePhraseUnderTag}
                className="btn-icon"
                style={{
                  padding: "3px 10px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  background: "var(--accent-color, #4f46e5)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                保存创建
              </button>
            </div>
          </div>
        )}

        {/* 短语卡片流式滚动列表 (白底卡片、清爽质感) */}
        <div
          className="hide-scrollbar"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {displayPhrases.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "36px 16px",
                color: "#64748b",
                fontSize: "12.5px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Sparkles size={28} opacity={0.4} />
              <p style={{ margin: 0 }}>
                {selectedTag
                  ? `标签 #${selectedTag} 下暂无常用短语`
                  : "暂无符合条件的常用短语"}
              </p>
              <button
                type="button"
                onClick={() => setIsCreatingPhrase(true)}
                className="btn-icon"
                style={{
                  padding: "4px 10px",
                  fontSize: "11.5px",
                  borderRadius: "5px",
                  background: "rgba(99, 102, 241, 0.1)",
                  color: "#4f46e5",
                  border: "1px dashed rgba(99, 102, 241, 0.4)",
                  cursor: "pointer",
                }}
              >
                + 添加常用短语
              </button>
            </div>
          ) : (
            displayPhrases.map((phrase) => {
              const isRevealed = revealedIds.has(phrase.id);
              const isJustCopied = copiedId === phrase.id;
              const isHovered = hoveredCardId === phrase.id;

              return (
                <div
                  key={phrase.id}
                  className="aurora-phrase-card phrase-manager-card"
                  onMouseEnter={() => setHoveredCardId(phrase.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: isJustCopied
                      ? "rgba(16, 185, 129, 0.1)"
                      : "var(--advanced-card-background, rgba(255, 255, 255, 0.45))",
                    border: isJustCopied
                      ? "1px solid rgba(16, 185, 129, 0.6)"
                      : isHovered
                      ? "1px solid color-mix(in srgb, var(--accent-color) 35%, transparent)"
                      : "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))",
                    boxShadow: isHovered
                      ? "var(--shadow-xs, 0 4px 10px rgba(15, 23, 42, 0.08))"
                      : "none",
                    backdropFilter: "var(--shell-backdrop-filter, blur(12px))",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    transition: "all 0.15s ease",
                    minWidth: 0,
                    boxSizing: "border-box",
                  }}
                >
                  {/* 标题行与右上角操作组 */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, flex: 1 }}>
                      {phrase.isSensitive && (
                        <Lock size={12} color="#6366f1" style={{ flexShrink: 0 }} />
                      )}
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "13px",
                          color: "var(--text-primary, #182235)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={phrase.title}
                      >
                        {phrase.title}
                      </span>
                      {pins.includes(phrase.id) && <Pin size={10} aria-label="已置顶" style={{ color: "var(--accent-color)", flexShrink: 0 }} />}
                      {isJustCopied && (
                        <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 600, flexShrink: 0 }}>
                          已复制
                        </span>
                      )}
                    </div>

                    {/* 操作按钮区：复制常驻，编辑与删除悬停浮现 */}
                    <div className="item-actions aurora-phrase-actions" style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      <button type="button" className="btn-icon" title={pins.includes(phrase.id) ? "取消置顶" : "置顶"}
                        onClick={(e) => { e.stopPropagation(); void togglePin(phrase.id); }}>
                        {pins.includes(phrase.id) ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                      {phrase.isSensitive && (
                        <button
                          type="button"
                          onClick={(e) => toggleReveal(phrase.id, e)}
                          className="btn-icon"
                          title={isRevealed ? "隐藏内容" : "显示明文"}
                          style={{ padding: "3px", color: "#64748b" }}
                        >
                          {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}

                      {/* 复制按钮 */}
                      <button
                        type="button"
                        onClick={(e) => handleCopy(phrase, e)}
                        className="btn-icon"
                        title="复制到剪贴板"
                        style={{
                          padding: "3px",
                          color: isJustCopied ? "#10b981" : "#475569",
                          borderRadius: "4px",
                        }}
                      >
                        {isJustCopied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                      </button>

                      {/* 编辑按钮 */}
                      <button
                          type="button"
                          onClick={(e) => handleStartEditPhrase(phrase, e)}
                          className="btn-icon"
                          title="编辑短语"
                          style={{ padding: "3px", color: "#475569" }}
                        >
                          <Edit2 size={13} />
                      </button>

                      {/* 删除按钮 */}
                      <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openConfirm({
                              title: "删除常用短语",
                              message: `确定要彻底删除常用短语 "${phrase.title}" 吗？`,
                              danger: true,
                              onConfirm: async () => {
                                await invoke("delete_quick_phrase", { id: phrase.id });
                                fetchPhrases();
                                pushToast("已删除常用短语");
                              },
                            });
                          }}
                          className="btn-icon"
                          title="彻底删除短语"
                          style={{ padding: "3px", color: "var(--danger-color, #ef4444)" }}
                        >
                          <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 点击内容将短语粘贴到当前光标位置 */}
                  <button
                    type="button"
                    onClick={() => handlePaste(phrase)}
                    title="点击粘贴到当前光标位置"
                    style={{
                      width: "100%",
                      padding: "2px 0 0",
                      border: "none",
                      background: "transparent",
                      color: "var(--text-secondary, #536179)",
                      font: "inherit",
                      fontSize: "11.5px",
                      textAlign: "left",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: phrase.isSensitive && !isRevealed ? "monospace" : "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {phrase.isSensitive && !isRevealed ? "••••••••••••••••" : phrase.content}
                  </button>

                  {/* 底部：标签分类与时间 */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "4px",
                      marginTop: "2px",
                    }}
                  >
                    {/* 标签流与一键解绑 */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px", minWidth: 0, flex: 1 }}>
                      {phrase.tags?.map((t) => {
                        const bg = resolveTagBg(t);

                        return (
                          <span
                            key={t}
                            style={{
                              background: `color-mix(in srgb, ${bg} 17%, var(--bg-panel, #fff))`,
                              color: "var(--text-secondary, #536179)",
                              fontSize: "10px",
                              padding: "1px 5px",
                              borderRadius: "8px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "2px",
                            }}
                          >
                            #{t}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveTagFromPhrase(phrase, t);
                              }}
                              title={`从此短语移除 #${t}`}
                              style={{
                                border: "none",
                                background: "transparent",
                                padding: 0,
                                color: "inherit",
                                opacity: 0.7,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              <X size={9} />
                            </button>
                          </span>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: "10px", color: "#94a3b8", flexShrink: 0 }}>
                      使用 {phrase.useCount || 0} 次
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 编辑短语模态弹窗 (纯白卡片) */}
      {editingPhrase && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 100,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setEditingPhrase(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "380px",
              background: "var(--bg-panel, rgba(255, 255, 255, 0.78))",
              borderRadius: "8px",
              border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))",
              boxShadow: "0 12px 36px rgba(0, 0, 0, 0.15)",
              backdropFilter: "var(--shell-backdrop-filter, blur(16px))",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#4f46e5" }}>
                编辑常用短语
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#475569", cursor: "pointer" }}>
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
              placeholder="短语标题"
              style={{ padding: "5px 8px", fontSize: "12px", borderRadius: "5px", background: "var(--bg-input, rgba(255, 255, 255, 0.96))", border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))" }}
            />

            <textarea
              className="app-input"
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="短语内容..."
              style={{ padding: "6px 8px", fontSize: "12px", borderRadius: "5px", resize: "vertical", background: "var(--bg-input, rgba(255, 255, 255, 0.96))", border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))" }}
            />

            {/* 标签管理行 */}
            <div>
              <div style={{ fontSize: "10.5px", color: "#64748b", marginBottom: "3px" }}>标签:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center" }}>
                {editTags.map((t) => {
                  const bg = resolveTagBg(t);
                  const fg = getTagTextColor(bg, theme);
                  return (
                    <span
                      key={t}
                      style={{
                        background: bg,
                        color: fg,
                        fontSize: "10.5px",
                        padding: "1px 6px",
                        borderRadius: "8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                    >
                      #{t}
                      <button
                        type="button"
                        onClick={() => setEditTags(editTags.filter((tag) => tag !== t))}
                        style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer" }}
                      >
                        <X size={9} />
                      </button>
                    </span>
                  );
                })}
                <input
                  type="text"
                  value={editTagInput}
                  onChange={(e) => setEditTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const tr = editTagInput.trim();
                      if (tr && !editTags.includes(tr)) {
                        setEditTags([...editTags, tr]);
                        setEditTagInput("");
                      }
                    }
                  }}
                  placeholder="添加标签按回车..."
                  style={{
                    padding: "2px 6px",
                    fontSize: "10.5px",
                    borderRadius: "4px",
                    width: "90px",
                    background: "var(--bg-input, rgba(255, 255, 255, 0.96))",
                    border: "1px solid var(--line-soft, rgba(24, 34, 53, 0.12))",
                    color: "var(--text-primary, #182235)",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "4px" }}>
              <button
                type="button"
                onClick={() => setEditingPhrase(null)}
                className="btn-icon"
                style={{ padding: "4px 10px", fontSize: "11.5px", borderRadius: "4px", background: "transparent", color: "#64748b" }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEditPhrase}
                className="btn-icon"
                style={{
                  padding: "4px 12px",
                  fontSize: "11.5px",
                  borderRadius: "4px",
                  background: "var(--accent-color, #4f46e5)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
