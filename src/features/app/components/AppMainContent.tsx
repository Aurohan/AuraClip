import type { ClipboardSortMode, QuickPasteModifier } from "../types";
import { lazy, memo, Suspense, useCallback, type ComponentProps, type RefObject, type ReactNode } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import type { DragControls } from "framer-motion";
import { Clipboard } from "lucide-react";
import ScrollToTopButton from "../../../shared/components/ScrollToTopButton";
import { VirtualClipboardList } from "../../clipboard/components/VirtualClipboardList";
import type { ClipboardEntry } from "../../../shared/types";
import type { VirtualClipboardListHandle } from "../../clipboard/types";
import type SettingsPanelType from "../../settings/components/SettingsPanel";

const QuickPhrasesView = lazy(() => import("../../quick-phrases/components/QuickPhrasesView"));
const PhraseTagManager = lazy(() => import("../../quick-phrases/components/PhraseTagManager"));
const SettingsPanel = lazy(() => import("../../settings/components/SettingsPanel"));
const TagManager = lazy(() => import("../../tag/components/TagManager"));

type SettingsPanelProps = ComponentProps<typeof SettingsPanelType>;
type RenderItem = (
  item: ClipboardEntry,
  index: number,
  dragControls?: DragControls,
  disableLayout?: boolean
) => ReactNode;

interface AppMainContentProps {
  phraseSortMode: ClipboardSortMode;
  quickPasteModifier?: QuickPasteModifier;
  clipboardPreviewText?: string;
  splitViewEnabled?: boolean;
  onCloseSplitView?: () => void;
  onPhraseCountsChange?: (total: number, filtered: number, isFiltered: boolean) => void;
  onOpenTransformText?: (title: string, content: string) => void;
  t: (key: string) => string;
  mainTab?: "clipboard" | "phrases";
  pushToast: (msg: string, duration?: number) => void;
  openConfirm: (options: { title: string; message: string; danger?: boolean; onConfirm: () => Promise<void> | void }) => void;
  theme: string;
  privacyProtection: boolean;
  showSettings: boolean;
  showTagManager: boolean;
  setShowTagManager?: (val: boolean) => void;
  tagManagerEnabled: boolean;
  settingsPanelProps: SettingsPanelProps;
  filteredHistory: ClipboardEntry[];
  search: string;
  pinnedItems: ClipboardEntry[];
  unpinnedItems: ClipboardEntry[];
  compactMode: boolean;
  selectedIndex: number;
  isKeyboardMode: boolean;
  virtualListRef: RefObject<VirtualClipboardListHandle | null>;
  pinnedOrderIds: number[];
  isDraggingPinned: boolean;
  handlePinnedIdsReorder: (newOrderIds: number[]) => void;
  handlePinnedDragStart: () => void;
  handlePinnedDragEnd: () => void;
  renderItemContent: RenderItem;
  loadMoreHistory: () => void;
  handleListScroll: (offset: number) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  showScrollTop: boolean;
  onScrollTop: () => void;
}

const SortableItem = memo(({
  item,
  index,
  renderItem,
  isFirst,
  onDragStart,
  onDragEnd,
  compactMode
}: {
  item: ClipboardEntry;
  index: number;
  renderItem: RenderItem;
  isFirst?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  compactMode: boolean;
}) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={isFirst ? "first-virtual-item" : undefined}
      style={{
        listStyle: "none",
        overflow: "visible",
        paddingTop: isFirst ? "4px" : undefined
      }}
    >
      <div style={{ paddingBottom: compactMode ? "2px" : "4px" }}>
        {renderItem(item, index, controls, true)}
      </div>
    </Reorder.Item>
  );
});

const AppMainContent = ({
  phraseSortMode,
  quickPasteModifier,
  clipboardPreviewText,
  splitViewEnabled,
  onCloseSplitView,
  onPhraseCountsChange,
  onOpenTransformText,
  t,
  mainTab,
  pushToast,
  openConfirm,
  theme,
  privacyProtection,
  showSettings,
  showTagManager,
  setShowTagManager: _setShowTagManager,
  tagManagerEnabled,
  settingsPanelProps,
  filteredHistory,
  search,
  pinnedItems,
  unpinnedItems,
  compactMode,
  selectedIndex,
  isKeyboardMode,
  virtualListRef,
  pinnedOrderIds,
  isDraggingPinned,
  handlePinnedIdsReorder,
  handlePinnedDragStart,
  handlePinnedDragEnd,
  renderItemContent,
  loadMoreHistory,
  handleListScroll,
  hasMore,
  isLoadingMore,
  showScrollTop,
  onScrollTop
}: AppMainContentProps) => {
  const orderedPinnedIds = pinnedOrderIds;

  // Hooks must run before the view-specific early returns below.
  // Same wrapper for every row so the top card does not remount when a new
  // copy pushes it down to index 1.
  const renderVirtualItem = useCallback((item: ClipboardEntry, index: number, isFirst?: boolean) => {
    const el = renderItemContent(item, pinnedItems.length + index, undefined, true);
    const first = isFirst && pinnedItems.length === 0;
    return (
      <div
        className={first ? "first-virtual-item" : undefined}
        style={first ? { height: "100%", paddingTop: "4px" } : undefined}
      >
        {el}
      </div>
    );
  }, [renderItemContent, pinnedItems.length]);

  if (mainTab === "phrases" && !showSettings && !showTagManager) {
    return (
      <motion.div
        className="main-pane-enter-right"
        initial={false}
        style={{
          height: "100%",
          width: "100%",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        <Suspense fallback={null}>
          <QuickPhrasesView
            sortMode={phraseSortMode}
            t={t}
            theme={theme}
            search={search}
            quickPasteModifier={quickPasteModifier}
            clipboardPreviewText={clipboardPreviewText}
            splitViewEnabled={splitViewEnabled}
            onCloseSplitView={onCloseSplitView}
            onCountsChange={onPhraseCountsChange}
            onOpenTransformText={onOpenTransformText}
            pushToast={pushToast}
            openConfirm={openConfirm}
          />
        </Suspense>
      </motion.div>
    );
  }

  if (showTagManager && tagManagerEnabled) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        style={{ height: "100%", overflow: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column" }}
      >
        <Suspense fallback={null}>
          {mainTab === "phrases" ? (
            <PhraseTagManager
              t={t}
              theme={theme}
              pushToast={pushToast}
              openConfirm={openConfirm}
            />
          ) : (
            <TagManager t={t} theme={theme} privacyProtection={privacyProtection} />
          )}
        </Suspense>
      </motion.div>
    );
  }

  if (showSettings) {
    return (
      <div className="settings-view">
        <Suspense fallback={null}>
          <SettingsPanel {...settingsPanelProps} />
        </Suspense>
      </div>
    );
  }

  if (filteredHistory.length === 0) {
    return (
      <div className="empty-state">
        <Clipboard size={40} opacity={0.2} style={{ marginBottom: "12px" }} />
        {search ? (
          <p>{t("no_records")}</p>
        ) : (
          <>
            <p
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: "bold",
                color: "var(--text-primary)",
                marginBottom: "4px"
              }}
            >
              {t("empty_title")}
            </p>
            <p style={{ fontSize: 'var(--font-size-sm)', opacity: 0.6 }}>{t("empty_desc")}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {filteredHistory.length > 0 && (
        <div className="history-list-container main-pane-enter-left">
          <VirtualClipboardList
            ref={virtualListRef}
            items={unpinnedItems}
            compactMode={compactMode}
            selectedIndex={selectedIndex - pinnedItems.length}
            isKeyboardMode={isKeyboardMode}
            header={
              pinnedItems.length > 0 ? (
                <div className="pinned-section-block">
                  <div className="list-section-header is-pinned">
                    <span className="list-section-title">{t("section_pinned")}</span>
                    <span className="list-section-count">{pinnedItems.length}</span>
                  </div>
                  <Reorder.Group
                    axis="y"
                    values={orderedPinnedIds}
                    onReorder={handlePinnedIdsReorder}
                    className={isDraggingPinned ? "pinned-reorder dragging" : "pinned-reorder"}
                    style={{ listStyle: "none", padding: 0 }}
                  >
                    {pinnedItems.map((item, index) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        index={index}
                        renderItem={renderItemContent}
                        isFirst={index === 0}
                        onDragStart={handlePinnedDragStart}
                        onDragEnd={handlePinnedDragEnd}
                        compactMode={compactMode}
                      />
                    ))}
                  </Reorder.Group>
                  {unpinnedItems.length > 0 && (
                    <div className="list-section-header is-recent">
                      <span className="list-section-title">{t("section_recent")}</span>
                      <span className="list-section-count">{unpinnedItems.length}</span>
                    </div>
                  )}
                </div>
              ) : null
            }
            renderItem={renderVirtualItem}
            onLoadMore={loadMoreHistory}
            onScroll={handleListScroll}
            hasMore={hasMore}
            isLoading={isLoadingMore}
            loadingLabel={t("loading")}
            loadMoreLabel={t("load_more")}
          />
          <ScrollToTopButton visible={showScrollTop} label={t("scroll_to_top")} onClick={onScrollTop} />
        </div>
      )}
    </>
  );
};

export default AppMainContent;
