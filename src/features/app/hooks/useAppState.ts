import { useState } from "react";
import { DEFAULT_THEME } from "../../../shared/config/themes";
import type { ClipboardEntry, Locale } from "../../../shared/types";
import type {
  AppState,
  ClipboardSortMode,
  DefaultAppsMap,
  InstalledAppOption,
  QuickPasteModifier,
  SettingsSubpage
} from "../types";
import type { AppCleanupPolicy } from "../../settings/types";
import { defaultHotkeys, type HotkeyActionId, type Hotkeys } from "../../../shared/lib/hotkeyActions";
import { DEFAULT_COLLAPSED_GROUPS } from "../../settings/types";

export const useAppState = (): AppState => {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSubpage, setSettingsSubpage] = useState<SettingsSubpage>("home");
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagManagerEnabled, setTagManagerEnabled] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(DEFAULT_COLLAPSED_GROUPS);
  const [history, setHistory] = useState<ClipboardEntry[]>([]);
  const [clipboardSortMode, setClipboardSortMode] =
    useState<ClipboardSortMode>("activity");
  const [search, setSearch] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [searchIsFocused, setSearchIsFocused] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [editingTagsId, setEditingTagsId] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [autoStart, setAutoStart] = useState(true);
  const [elevatedAutostart, setElevatedAutostart] = useState(false);
  const [deduplicate, setDeduplicate] = useState(true);
  const [persistent, setPersistent] = useState(true);
  const [persistentLimitEnabled, setPersistentLimitEnabled] = useState(true);
  const [persistentLimit, setPersistentLimit] = useState<number>(1000);
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});
  const [defaultApps, setDefaultApps] = useState<DefaultAppsMap>({});
  const [showAppSelector, setShowAppSelector] = useState<string | null>(null);
  const [installedApps, setInstalledApps] = useState<InstalledAppOption[]>([]);
  const [dataPath, setDataPath] = useState<string>("");
  const [hotkeys, setHotkeys] = useState<Hotkeys>(defaultHotkeys);
  const [quickPasteModifier, setQuickPasteModifier] =
    useState<QuickPasteModifier>("disabled");
  const [sequentialMode, setSequentialModeState] = useState(false);
  const [recordingHotkey, setRecordingHotkey] = useState<HotkeyActionId | null>(null);
  const [deleteAfterPaste, setDeleteAfterPaste] = useState(false);
  const [moveToTopAfterPaste, setMoveToTopAfterPaste] = useState(false);
  const [clickCopyOnly, setClickCopyOnly] = useState(false);
  const [privacyProtection, setPrivacyProtection] = useState(false);
  const [privacyProtectionKinds, setPrivacyProtectionKinds] = useState<string[]>([
    "phone",
    "idcard",
    "email",
    "secret"
  ]);
  const [privacyProtectionCustomRules, setPrivacyProtectionCustomRules] = useState<string>("");
  const [sensitiveMaskPrefixVisible, setSensitiveMaskPrefixVisible] = useState(3);
  const [sensitiveMaskSuffixVisible, setSensitiveMaskSuffixVisible] = useState(3);
  const [sensitiveMaskEmailDomain, setSensitiveMaskEmailDomain] = useState(false);
  const [cleanupRules, setCleanupRules] = useState<string>("");
  const [appCleanupPolicies, setAppCleanupPolicies] = useState<AppCleanupPolicy[]>([]);
  const [captureFiles, setCaptureFiles] = useState(true);
  const [captureRichText, setCaptureRichText] = useState(false);
  const [richTextSnapshotPreview, setRichTextSnapshotPreview] = useState(false);
  const [silentStart, setSilentStart] = useState(false);
  const [followMouse, setFollowMouse] = useState(false);
  const [showAppBorder, setShowAppBorder] = useState(false);
  const [winClipboardDisabled, setWinClipboardDisabled] = useState(false);
  const [registryWinVEnabled, setRegistryWinVEnabled] = useState(false);
  const [pasteMethod, setPasteMethod] = useState("auto");
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [nativePalette, setNativePalette] = useState("default");
  const [colorMode, setColorMode] = useState("system");
  const [showSourceAppIcon, setShowSourceAppIcon] = useState(true);
  const [hideUnselectedItemActions, setHideUnselectedItemActions] = useState(false);

  const [compactMode, setCompactMode] = useState(false);
  const [compactShowTime, setCompactShowTime] = useState(false);
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [clipboardItemFontSize, setClipboardItemFontSize] = useState(13);
  const [clipboardTagFontSize, setClipboardTagFontSize] = useState(10);
  const [showHotkeyHint, setShowHotkeyHint] = useState(false);
  const [language, setLanguage] = useState<Locale>("zh");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isWindowPinned, setIsWindowPinned] = useState(false);
  /** Persistent preference: search bar always visible (settings toggle). */
  const [searchBoxPinned, setSearchBoxPinned] = useState(true);
  /** Transient UI visibility (may temporarily differ from pinned via scroll reveal). */
  const [showSearchBox, setShowSearchBox] = useState(true);
  const [scrollTopButtonEnabled, setScrollTopButtonEnabled] = useState(true);
  const [arrowKeySelection, setArrowKeySelection] = useState(true);
  const [lightModeEnabled, setLightModeEnabled] = useState(false);
  const [lightModeIdleMinutes, setLightModeIdleMinutes] = useState(15);
  const [hideTrayIcon, setHideTrayIcon] = useState(false);
  const [edgeDocking, setEdgeDocking] = useState(false);
  const [customBackground, setCustomBackground] = useState<string>("");
  const [customBackgroundOpacity, setCustomBackgroundOpacity] = useState(45);
  const [surfaceOpacity, setSurfaceOpacity] = useState(50);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [mqttEnabled, setMqttEnabled] = useState(false);
  const [mqttServer, setMqttServer] = useState("");
  const [mqttPort, setMqttPort] = useState("1883");
  const [mqttUser, setMqttUser] = useState("");
  const [mqttPass, setMqttPass] = useState("");
  const [mqttTopic, setMqttTopic] = useState("");
  const [mqttProtocol, setMqttProtocol] = useState("mqtt://");
  const [mqttWsPath, setMqttWsPath] = useState("/mqtt");
  const [mqttNotificationEnabled, setMqttNotificationEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(1.0);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  return {
    showSettings,
    setShowSettings,
    settingsSubpage,
    setSettingsSubpage,
    showTagManager,
    setShowTagManager,
    tagManagerEnabled,
    setTagManagerEnabled,
    collapsedGroups,
    setCollapsedGroups,
    history,
    setHistory,
    clipboardSortMode,
    setClipboardSortMode,
    search,
    setSearch,
    isComposing,
    setIsComposing,
    searchIsFocused,
    setSearchIsFocused,
    showTagFilter,
    setShowTagFilter,
    tagInput,
    setTagInput,
    editingTagsId,
    setEditingTagsId,
    editingNoteId,
    setEditingNoteId,
    revealedIds,
    setRevealedIds,
    autoStart,
    setAutoStart,
    elevatedAutostart,
    setElevatedAutostart,
    deduplicate,
    setDeduplicate,
    persistent,
    setPersistent,
    persistentLimitEnabled,
    setPersistentLimitEnabled,
    persistentLimit,
    setPersistentLimit,
    appSettings,
    setAppSettings,
    defaultApps,
    setDefaultApps,
    showAppSelector,
    setShowAppSelector,
    installedApps,
    setInstalledApps,
    dataPath,
    setDataPath,
    hotkeys,
    setHotkeys,
    quickPasteModifier,
    setQuickPasteModifier,
    sequentialMode,
    setSequentialModeState,
    recordingHotkey,
    setRecordingHotkey,
    deleteAfterPaste,
    setDeleteAfterPaste,
    moveToTopAfterPaste,
    clickCopyOnly,
    setMoveToTopAfterPaste,
    setClickCopyOnly,
    privacyProtection,
    setPrivacyProtection,
    privacyProtectionKinds,
    setPrivacyProtectionKinds,
    privacyProtectionCustomRules,
    setPrivacyProtectionCustomRules,
    sensitiveMaskPrefixVisible,
    setSensitiveMaskPrefixVisible,
    sensitiveMaskSuffixVisible,
    setSensitiveMaskSuffixVisible,
    sensitiveMaskEmailDomain,
    setSensitiveMaskEmailDomain,
    cleanupRules,
    setCleanupRules,
    appCleanupPolicies,
    setAppCleanupPolicies,
    captureFiles,
    setCaptureFiles,
    captureRichText,
    setCaptureRichText,
    richTextSnapshotPreview,
    setRichTextSnapshotPreview,
    silentStart,
    setSilentStart,
    followMouse,
    setFollowMouse,
    showAppBorder,
    setShowAppBorder,
    winClipboardDisabled,
    setWinClipboardDisabled,
    registryWinVEnabled,
    setRegistryWinVEnabled,
    pasteMethod,
    setPasteMethod,
    theme,
    setTheme,
    nativePalette,
    setNativePalette,
    colorMode,
    setColorMode,
    showSourceAppIcon,
    setShowSourceAppIcon,
    hideUnselectedItemActions,
    setHideUnselectedItemActions,

    compactMode,
    setCompactMode,
    compactShowTime,
    setCompactShowTime,
    splitViewEnabled,
    setSplitViewEnabled,
    clipboardItemFontSize,
    setClipboardItemFontSize,
    clipboardTagFontSize,
    setClipboardTagFontSize,
    showHotkeyHint,
    setShowHotkeyHint,
    language,
    setLanguage,
    settingsLoaded,
    setSettingsLoaded,
    isWindowPinned,
    setIsWindowPinned,
    searchBoxPinned,
    setSearchBoxPinned,
    showSearchBox,
    setShowSearchBox,
    scrollTopButtonEnabled,
    setScrollTopButtonEnabled,
    arrowKeySelection,
    setArrowKeySelection,
    lightModeEnabled,
    setLightModeEnabled,
    lightModeIdleMinutes,
    setLightModeIdleMinutes,
    hideTrayIcon,
    setHideTrayIcon,
    edgeDocking,
    setEdgeDocking,

    customBackground,
    setCustomBackground,
    customBackgroundOpacity,
    setCustomBackgroundOpacity,
    surfaceOpacity,
    setSurfaceOpacity,
    selectedIndex,
    setSelectedIndex,
    selectedItemId,
    setSelectedItemId,
    isKeyboardMode,
    setIsKeyboardMode,
    isLoadingMore,
    setIsLoadingMore,
    hasMore,
    setHasMore,
    currentOffset,
    setCurrentOffset,
    mqttEnabled,
    setMqttEnabled,
    mqttServer,
    setMqttServer,
    mqttPort,
    setMqttPort,
    mqttUser,
    setMqttUser,
    mqttPass,
    setMqttPass,
    mqttTopic,
    setMqttTopic,
    mqttProtocol,
    setMqttProtocol,
    mqttWsPath,
    setMqttWsPath,
    mqttNotificationEnabled,
    setMqttNotificationEnabled,
    soundEnabled,
    setSoundEnabled,
    soundVolume,
    setSoundVolume,
    typeFilter,
    setTypeFilter
  };
};
