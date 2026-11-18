import auraClipHeaderLogo from "../../../assets/auraclip-header.ico";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, RefObject } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  Columns2,
  Hash,
  Search,
  Settings as SettingsIcon,
  Tag,
  Trash2,
  X
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import PinGlyph from "../../../shared/components/PinGlyph";
import { getTagColor } from "../../../shared/lib/utils";
import { TYPE_FILTERS } from "../../../shared/lib/typeFilters";
import { useWideWindow } from "../../../shared/hooks/useWideWindow";
import type { ClipboardSortMode } from "../types";

interface AppHeaderProps {
  t: (key: string) => string;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  showTagManager: boolean;
  setShowTagManager: (val: boolean) => void;
  tagManagerEnabled: boolean;
  isWindowPinned: boolean;
  setIsWindowPinned: (val: boolean) => void;
  clearHistory: () => void;
  showSearchBox: boolean;
  search: string;
  setSearch: (val: string) => void;
  setIsComposing: (val: boolean) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  showTagFilter: boolean;
  setShowTagFilter: (val: boolean) => void;
  allTags: string[];
  tagColors: Record<string, string>;
  searchIsFocused: boolean;
  setSearchIsFocused: (val: boolean) => void;
  setEditingTagsId: (val: number | null) => void;
  theme: string;
  colorMode: string;
  settingsTitle: string;
  typeFilter: string | null;
  setTypeFilter: (val: string | null) => void;
  mainTab?: "clipboard" | "phrases";
  setMainTab?: (val: "clipboard" | "phrases") => void;
  clipboardSortMode: ClipboardSortMode;
  onClipboardSortModeChange: (val: ClipboardSortMode) => void;
  splitViewEnabled?: boolean;
  onToggleSplitView?: () => void;
  onBack: () => void;
}

const AppHeader = ({
  t,
  showSettings,
  setShowSettings,
  showTagManager,
  setShowTagManager,
  tagManagerEnabled,
  isWindowPinned,
  setIsWindowPinned,
  clearHistory,
  showSearchBox,
  search,
  setSearch,
  setIsComposing,
  searchInputRef,
  showTagFilter,
  setShowTagFilter,
  allTags,
  tagColors,
  setSearchIsFocused,
  setEditingTagsId,
  theme,
  settingsTitle,
  typeFilter,
  setTypeFilter,
  mainTab,
  setMainTab,
  clipboardSortMode,
  onClipboardSortModeChange,
  splitViewEnabled,
  onToggleSplitView,
  onBack
}: AppHeaderProps) => {
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const isWide = useWideWindow();

  const getTypeName = (type: string) => {
    switch (type) {
      case "code": return t("type_code");
      case "link":
      case "url": return t("type_url");
      case "file": return t("type_file");
      case "image": return t("type_image");
      case "video": return t("type_video");
      case "rich_text": return t("type_rich_text");
      default: return t("type_text");
    }
  };

  const searchVisible = showSearchBox || search.trim().length > 0;
  const sortOptions: Array<{ value: ClipboardSortMode; label: string }> = [
    { value: "activity", label: t("clipboard_sort_activity") },
    { value: "created", label: mainTab === "phrases" ? "最近创建" : t("clipboard_sort_created") },
    { value: "last_used", label: t("clipboard_sort_last_used") },
    { value: "usage", label: t("clipboard_sort_usage") }
  ];
  const activeSortLabel =
    sortOptions.find((option) => option.value === clipboardSortMode)?.label ||
    t("clipboard_sort_activity");

  useEffect(() => {
    if (!sortMenuOpen && !showTagFilter) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (sortMenuOpen && !sortMenuRef.current?.contains(target)) {
        setSortMenuOpen(false);
      }
      if (showTagFilter && !searchWrapRef.current?.contains(target)) {
        setShowTagFilter(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSortMenuOpen(false);
        setShowTagFilter(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortMenuOpen, showTagFilter, setShowTagFilter]);

  useEffect(() => {
    if (!searchVisible) {
      setSortMenuOpen(false);
      setShowTagFilter(false);
    }
  }, [searchVisible, setShowTagFilter]);

  const typeFiltersRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = typeFiltersRef.current;
    const active = row?.querySelector<HTMLElement>(".btn-icon.active");
    if (!row || !active) return;
    const rowBox = row.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.left < rowBox.left) row.scrollLeft -= rowBox.left - box.left;
    else if (box.right > rowBox.right) row.scrollLeft += box.right - rowBox.right;
  }, [typeFilter]);

  const headerTitle = showTagManager && tagManagerEnabled
    ? (mainTab === "phrases" ? "短语标签管理" : t("tag_manager"))
    : showSettings
      ? settingsTitle
      : t("app_name");

  const hideWindow = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    invoke("hide_window_cmd").catch(console.error);
  };

  const hasTagButton = mainTab !== "phrases" && allTags.length > 0;
  const hasClearButton = search.length > 0;
  const trailingCount = 1 + (hasTagButton ? 1 : 0) + (hasClearButton ? 1 : 0);

  return (
    <header
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea, [role="button"]')) {
          return;
        }
        if (searchInputRef.current && document.activeElement === searchInputRef.current) {
          searchInputRef.current.blur();
        }
        e.preventDefault();
        getCurrentWindow().startDragging();
      }}
    >
      <div className="header-top">
        <div className="header-leading">
          {(showSettings || showTagManager) && (
            <button className="btn-icon header-back-btn" onClick={onBack} aria-label={t("back")} title={t("back")}>
              <ChevronLeft size={16} />
            </button>
          )}
          {showSettings || showTagManager ? (
            <span className="header-title page-header-title is-page-title">{headerTitle}</span>
          ) : (
            <>
              <img
                className="auraclip-header-brand"
                src={auraClipHeaderLogo}
                alt="AuraClip"
                draggable={false}
              />
              {setMainTab && (
                <div
                  className="main-tabs-segmented"
                  role="tablist"
                  data-active={mainTab === "phrases" ? "phrases" : "clipboard"}
                >
                  <span className="main-tabs-indicator" aria-hidden />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mainTab !== "phrases"}
                    className={`main-tab${mainTab !== "phrases" ? " is-active" : ""}`}
                    onClick={() => setMainTab("clipboard")}
                  >
                    {t("tab_history")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mainTab === "phrases"}
                    className={`main-tab${mainTab === "phrases" ? " is-active" : ""}`}
                    onClick={() => setMainTab("phrases")}
                  >
                    {t("tab_quick_phrases")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="header-drag-region" />

        <div className="header-actions">
          {!showSettings && !showTagManager && (
            <>
              {isWide && onToggleSplitView && (
                <button
                  type="button"
                  className={`btn-icon header-tool-btn ${splitViewEnabled ? "active" : ""}`}
                  title={t("split_view")}
                  aria-label={t("split_view")}
                  onClick={onToggleSplitView}
                >
                  <Columns2 size={15} />
                </button>
              )}
              {tagManagerEnabled && (
                <button
                  type="button"
                  className="btn-icon header-tool-btn"
                  title={t("tag_manager")}
                  aria-label={t("tag_manager")}
                  onClick={() => setShowTagManager(true)}
                >
                  <Tag size={15} />
                </button>
              )}
              {mainTab !== "phrases" && (
                <button
                  type="button"
                  className="btn-icon header-tool-btn"
                  title={t("clear_history")}
                  aria-label={t("clear_history")}
                  onClick={clearHistory}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                type="button"
                className="btn-icon header-tool-btn"
                title={t("settings")}
                aria-label={t("settings")}
                onClick={() => setShowSettings(true)}
              >
                <SettingsIcon size={15} />
              </button>
              <span className="header-chrome-divider" aria-hidden="true" />
            </>
          )}

          <button
            type="button"
            className={`btn-icon header-tool-btn header-pin-btn ${isWindowPinned ? "active" : ""}`}
            title={isWindowPinned ? t("window_pin_unlock") : t("window_pin_lock")}
            aria-label={isWindowPinned ? t("window_pin_unlock") : t("window_pin_lock")}
            aria-pressed={isWindowPinned}
            onClick={() => {
              const newVal = !isWindowPinned;
              setIsWindowPinned(newVal);
              invoke("set_window_pinned", { pinned: newVal }).catch(console.error);
            }}
          >
            <PinGlyph pinned={isWindowPinned} size={14} />
            {isWindowPinned && <span className="header-pin-dot" aria-hidden="true" />}
          </button>

          <button
            type="button"
            className="btn-icon header-tool-btn windows-close-btn"
            title={t("hide")}
            aria-label={t("hide")}
            onClick={hideWindow}
          >
            <X size={15} strokeWidth={2.1} />
          </button>
        </div>
      </div>

      {!showSettings && !showTagManager && (
        <div
          className={`search-reveal${searchVisible ? " is-open" : ""}`}
          aria-hidden={!searchVisible}
        >
          <div className="search-reveal-inner">
            <div className="search-container">
              <div ref={searchWrapRef} className="search-input-wrap">
                <div className="search-input-row">
                  <span className="search-prompt" aria-hidden="true">
                    {theme === "terminal" ? "➜" : "%"}
                  </span>
                  <Search size={14} className="search-icon" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className={`search-input has-sort-control trailing-${trailingCount} ${showTagFilter && allTags.length > 0 ? "dropdown-open" : ""}`}
                    placeholder={
                      mainTab === "phrases"
                        ? t("quick_phrases_search_placeholder")
                        : theme === "terminal"
                        ? t("search_placeholder_terminal")
                        : t("search_placeholder")
                    }
                    value={search}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={(e) => {
                      setIsComposing(false);
                      setSearch((e.target as HTMLInputElement).value);
                    }}
                    onChange={(e) => {
                      setSearch(e.target.value);
                    }}
                    onFocus={() => {
                      setSortMenuOpen(false);
                      setSearchIsFocused(true);
                      setEditingTagsId(null);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setSearchIsFocused(false);
                      }, 150);
                    }}
                  />

                  <div className="search-trailing-controls">
                    {hasClearButton && (
                      <button
                        type="button"
                        className="clipboard-sort-trigger search-clear-trigger"
                        aria-label={t("clear_search")}
                        title={t("clear_search")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearch("");
                          searchInputRef.current?.focus();
                        }}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}

                    {hasTagButton && (
                      <button
                        type="button"
                        className={`clipboard-sort-trigger search-tag-trigger${showTagFilter ? " is-open" : ""}${search.startsWith("tag:") ? " has-custom-sort" : ""}`}
                        aria-label={t("filter_by_tag")}
                        aria-expanded={showTagFilter}
                        title={t("filter_by_tag")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSortMenuOpen(false);
                          setShowTagFilter(!showTagFilter);
                        }}
                      >
                        <Hash size={13} aria-hidden="true" />
                      </button>
                    )}

                    <div ref={sortMenuRef} className="clipboard-sort-anchor">
                      <button
                        type="button"
                        className={`clipboard-sort-trigger${sortMenuOpen ? " is-open" : ""}${clipboardSortMode !== "activity" ? " has-custom-sort" : ""}`}
                        aria-label={`${t("clipboard_sort")}: ${activeSortLabel}`}
                        aria-haspopup="menu"
                        aria-expanded={sortMenuOpen}
                        title={`${t("clipboard_sort")}: ${activeSortLabel}`}
                        onClick={() => {
                          setShowTagFilter(false);
                          setSortMenuOpen((open) => !open);
                        }}
                      >
                        <ArrowUpDown size={13} aria-hidden="true" />
                      </button>
                      {sortMenuOpen && (
                        <div className="clipboard-sort-menu" role="menu" aria-label={t("clipboard_sort")}>
                          <div className="clipboard-sort-menu-title">{t("clipboard_sort")}</div>
                          {sortOptions.map((option) => {
                            const selected = option.value === clipboardSortMode;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={selected}
                                className={`clipboard-sort-option${selected ? " is-selected" : ""}`}
                                onClick={() => {
                                  onClipboardSortModeChange(option.value);
                                  setSortMenuOpen(false);
                                }}
                              >
                                <span>{option.label}</span>
                                <Check
                                  size={13}
                                  aria-hidden="true"
                                  className={selected ? undefined : "clipboard-sort-check-placeholder"}
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {showTagFilter && allTags.length > 0 && (
                  <div className="tags-dropdown">
                    <div className="tags-list">
                      {allTags.map(tag => {
                        const tagColor = tagColors[tag] || getTagColor(tag, theme);
                        return (
                          <button
                            type="button"
                            className="tag-chip tag-filter-chip"
                            key={tag}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSearch("tag:" + tag);
                              setShowTagFilter(false);
                            }}
                            data-tag={tag}
                            style={{
                              "--tag-color": tagColor,
                            } as CSSProperties}
                          >
                            <span
                              className="tag-color-dot"
                              style={{ backgroundColor: tagColor }}
                              aria-hidden="true"
                            />
                            <span className="tag-name">{tag}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {mainTab !== "phrases" && (
                <div
                  ref={typeFiltersRef}
                  className="search-type-filters hide-scrollbar"
                  onWheel={(e) => {
                    e.stopPropagation();
                    if (e.deltaY !== 0) {
                      e.currentTarget.scrollLeft += e.deltaY;
                    }
                  }}
                >
                  {TYPE_FILTERS.map(type => (
                    <button
                      key={type ?? "all"}
                      type="button"
                      className={`btn-icon type-filter-chip${typeFilter === type ? " active" : ""}`}
                      onClick={() => setTypeFilter(type)}
                      aria-pressed={typeFilter === type}
                      title={type === null ? t("type_all") : getTypeName(type)}
                    >
                      {type === null ? t("type_all") : getTypeName(type)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default AppHeader;
