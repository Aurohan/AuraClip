import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MutableRefObject } from "react";
import type { AppCleanupPolicy } from "../../features/settings/types";
import type { ClipboardSortMode, QuickPasteModifier } from "../../features/app/types";

const QUICK_PASTE_MODIFIERS = new Set<QuickPasteModifier>([
  "disabled",
  "ctrl",
  "alt",
  "shift",
  "win"
]);
const CLIPBOARD_SORT_MODES = new Set<ClipboardSortMode>([
  "activity",
  "created",
  "last_used",
  "usage"
]);

const normalizeQuickPasteModifier = (value?: string): QuickPasteModifier => {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "control":
      return "ctrl";
    case "option":
      return "alt";
    case "command":
    case "meta":
    case "super":
      return "win";
    default:
      return normalized && QUICK_PASTE_MODIFIERS.has(normalized as QuickPasteModifier)
        ? (normalized as QuickPasteModifier)
        : "disabled";
  }
};

const normalizeClipboardSortMode = (value?: string): ClipboardSortMode =>
  value && CLIPBOARD_SORT_MODES.has(value as ClipboardSortMode)
    ? (value as ClipboardSortMode)
    : "activity";

interface UseSettingsPostInitOptions {
  settings: Record<string, string> | null;
  tagManagerSizeRef: MutableRefObject<{ width: number; height: number } | null>;
  setCustomBackground: (val: string) => void;
  setCustomBackgroundOpacity: (val: number) => void;
  setSurfaceOpacity: (val: number) => void;
  setPersistent: (val: boolean) => void;
  setPersistentLimitEnabled: (val: boolean) => void;
  setPersistentLimit: (val: number) => void;
  setClipboardSortMode: (val: ClipboardSortMode) => void;
  setDeduplicate: (val: boolean) => void;
  setCaptureFiles: (val: boolean) => void;
  setCaptureRichText: (val: boolean) => void;
  setRichTextSnapshotPreview: (val: boolean) => void;
  setPrivacyProtection: (val: boolean) => void;
  setPrivacyProtectionKinds: (val: string[]) => void;
  setPrivacyProtectionCustomRules: (val: string) => void;
  setSensitiveMaskPrefixVisible: (val: number) => void;
  setSensitiveMaskSuffixVisible: (val: number) => void;
  setSensitiveMaskEmailDomain: (val: boolean) => void;
  setCleanupRules: (val: string) => void;
  setAppCleanupPolicies: (val: AppCleanupPolicy[]) => void;
  setSilentStart: (val: boolean) => void;
  setFollowMouse: (val: boolean) => void;
  setShowAppBorder: (val: boolean) => void;
  setRegistryWinVEnabled: (val: boolean) => void;
  setPasteMethod: (val: string) => void;
  setShowSourceAppIcon: (val: boolean) => void;
  setHideUnselectedItemActions: (val: boolean) => void;
  setCompactShowTime: (val: boolean) => void;
  setSplitViewEnabled: (val: boolean) => void;

  setDeleteAfterPaste: (val: boolean) => void;
  setMoveToTopAfterPaste: (val: boolean) => void;
  setClickCopyOnly: (val: boolean) => void;
  setHideTrayIcon: (val: boolean) => void;
  setEdgeDocking: (val: boolean) => void;
  setSearchBoxPinned: (val: boolean) => void;
  setShowSearchBox: (val: boolean) => void;
  setScrollTopButtonEnabled: (val: boolean) => void;
  setArrowKeySelection: (val: boolean) => void;
  setLightModeEnabled: (val: boolean) => void;
  setLightModeIdleMinutes: (val: number) => void;
  setMqttEnabled: (val: boolean) => void;
  setMqttServer: (val: string) => void;
  setMqttPort: (val: string) => void;
  setMqttUser: (val: string) => void;
  setMqttPass: (val: string) => void;
  setMqttTopic: (val: string) => void;
  setMqttProtocol: (val: string) => void;
  setMqttWsPath: (val: string) => void;
  setMqttNotificationEnabled: (val: boolean) => void;
  setQuickPasteModifier: (val: QuickPasteModifier) => void;
  setSequentialModeState: (val: boolean) => void;
  setSoundEnabled: (val: boolean) => void;
  setSoundVolume: (val: number) => void;
  setIsWindowPinned: (val: boolean) => void;
  setSettingsLoaded: (val: boolean) => void;
  setClipboardItemFontSize: (val: number) => void;
  setClipboardTagFontSize: (val: number) => void;
  setTagManagerEnabled: (val: boolean) => void;
}

export const useSettingsPostInit = ({
  settings,
  tagManagerSizeRef,
  setCustomBackground,
  setCustomBackgroundOpacity,
  setSurfaceOpacity,
  setPersistent,
  setPersistentLimitEnabled,
  setPersistentLimit,
  setClipboardSortMode,
  setDeduplicate,
  setCaptureFiles,
  setCaptureRichText,
  setRichTextSnapshotPreview,
  setPrivacyProtection,
  setPrivacyProtectionKinds,
  setPrivacyProtectionCustomRules,
  setSensitiveMaskPrefixVisible,
  setSensitiveMaskSuffixVisible,
  setSensitiveMaskEmailDomain,
  setCleanupRules,
  setAppCleanupPolicies,
  setSilentStart,
  setFollowMouse,
  setShowAppBorder,
  setRegistryWinVEnabled,
  setPasteMethod,
  setShowSourceAppIcon,
  setHideUnselectedItemActions,
  setCompactShowTime,
  setSplitViewEnabled,

  setDeleteAfterPaste,
  setMoveToTopAfterPaste,
  setClickCopyOnly,
  setHideTrayIcon,
  setEdgeDocking,
  setSearchBoxPinned,
  setShowSearchBox,
  setScrollTopButtonEnabled,
  setArrowKeySelection,
  setLightModeEnabled,
  setLightModeIdleMinutes,
  setMqttEnabled,
  setMqttServer,
  setMqttPort,
  setMqttUser,
  setMqttPass,
  setMqttTopic,
  setMqttProtocol,
  setMqttWsPath,
  setMqttNotificationEnabled,
  setQuickPasteModifier,
  setSequentialModeState,
  setSoundEnabled,
  setSoundVolume,
  setIsWindowPinned,
  setSettingsLoaded,
  setClipboardItemFontSize,
  setClipboardTagFontSize,
  setTagManagerEnabled,
}: UseSettingsPostInitOptions) => {
  useEffect(() => {
    if (!settings) return;

    if (settings["app.tag_manager_size"]) {
      try {
        const parsed = JSON.parse(settings["app.tag_manager_size"]);
        if (parsed && typeof parsed.width === "number" && typeof parsed.height === "number") {
          tagManagerSizeRef.current = { width: parsed.width, height: parsed.height };
        }
      } catch (e) {
        console.warn("Invalid tag manager size:", e);
      }
    }

    // Theme application is centralized in the theme effect below
    if (settings["app.custom_background"]) setCustomBackground(settings["app.custom_background"]);
    if (settings["app.custom_background_opacity"]) {
      setCustomBackgroundOpacity(parseInt(settings["app.custom_background_opacity"]));
    }
    if (settings["app.surface_opacity"]) {
      const next = parseInt(settings["app.surface_opacity"]);
      if (Number.isFinite(next)) {
        setSurfaceOpacity(Math.min(100, Math.max(0, next)));
      }
    }
    if (settings["app.clipboard_item_font_size"]) {
      const next = parseInt(settings["app.clipboard_item_font_size"]);
      if (Number.isFinite(next)) setClipboardItemFontSize(next);
    }
    if (settings["app.clipboard_tag_font_size"]) {
      const next = parseInt(settings["app.clipboard_tag_font_size"]);
      if (Number.isFinite(next)) setClipboardTagFontSize(next);
    }
    if (settings["app.tag_manager_enabled"] !== undefined) {
      setTagManagerEnabled(settings["app.tag_manager_enabled"] !== "false");
    }

    // Fix: explicitly handle both true and false cases for all boolean settings
    setPersistent(settings["app.persistent"] !== "false");
    setPersistentLimitEnabled(settings["app.persistent_limit_enabled"] !== "false");
    if (settings["app.persistent_limit"]) {
      setPersistentLimit(parseInt(settings["app.persistent_limit"]) || 1000);
    }
    setClipboardSortMode(normalizeClipboardSortMode(settings["app.clipboard_sort_mode"]));
    setDeduplicate(settings["app.deduplicate"] !== "false");
    setCaptureFiles(settings["app.capture_files"] !== "false");
    setCaptureRichText(settings["app.capture_rich_text"] === "true");
    setRichTextSnapshotPreview(settings["app.rich_text_snapshot_preview"] === "true");
    setPrivacyProtection(settings["app.privacy_protection"] === "true");
    // Empty is a choice too (every type unticked), not a missing setting.
    if (settings["app.privacy_protection_kinds"] !== undefined) {
      setPrivacyProtectionKinds(
        settings["app.privacy_protection_kinds"]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
    if (settings["app.privacy_protection_custom_rules"] !== undefined) {
      setPrivacyProtectionCustomRules(settings["app.privacy_protection_custom_rules"] || "");
    }
    if (settings["app.sensitive_mask_prefix_visible"]) {
      const next = parseInt(settings["app.sensitive_mask_prefix_visible"]);
      if (Number.isFinite(next)) setSensitiveMaskPrefixVisible(Math.min(20, Math.max(0, next)));
    }
    if (settings["app.sensitive_mask_suffix_visible"]) {
      const next = parseInt(settings["app.sensitive_mask_suffix_visible"]);
      if (Number.isFinite(next)) setSensitiveMaskSuffixVisible(Math.min(20, Math.max(0, next)));
    }
    if (settings["app.sensitive_mask_email_domain"] !== undefined) {
      setSensitiveMaskEmailDomain(settings["app.sensitive_mask_email_domain"] === "true");
    }
    if (settings["app.cleanup_rules"] !== undefined) {
      setCleanupRules(settings["app.cleanup_rules"] || "");
    }
    if (settings["app.app_cleanup_policies"]) {
      try {
        const parsed = JSON.parse(settings["app.app_cleanup_policies"]);
        if (Array.isArray(parsed)) {
          setAppCleanupPolicies(
            parsed.filter(
              (item): item is AppCleanupPolicy =>
                !!item &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.enabled === "boolean" &&
                typeof item.appName === "string" &&
                typeof item.appPath === "string" &&
                (item.action === "ignore" || item.action === "clean") &&
                Array.isArray(item.contentTypes) &&
                typeof item.cleanupRules === "string"
            )
          );
        }
      } catch (e) {
        console.warn("Invalid app cleanup policies:", e);
      }
    }
    setSilentStart(settings["app.silent_start"] === "true");
    setFollowMouse(settings["app.follow_mouse"] === "true");
    setShowAppBorder(settings["app.show_app_border"] === "true");
    setRegistryWinVEnabled(settings["app.use_win_v_shortcut"] === "true");
    setPasteMethod(settings["app.paste_method"] || "auto");
    setShowSourceAppIcon(settings["app.show_source_app_icon"] !== "false");
    setHideUnselectedItemActions(settings["app.hide_unselected_item_actions"] === "true");
    setCompactShowTime(settings["app.compact_show_time"] === "true");
    // On by default: only an explicit "false" turns the wide two-column layout off.
    setSplitViewEnabled(settings["app.split_view"] === "true");


    // These have false as default, so check for 'true'
    setDeleteAfterPaste(settings["app.delete_after_paste"] === "true");
    setMoveToTopAfterPaste(settings["app.move_to_top_after_paste"] === "true");
    setClickCopyOnly(settings["app.click_copy_only"] === "true");
    setHideTrayIcon(settings["app.hide_tray_icon"] === "true");
    const edgeDockingEnabled = settings["app.edge_docking"] === "true";
    setEdgeDocking(edgeDockingEnabled);

    // Default ON when unset (new installs / missing key). Only explicit "false" pins off.
    const searchPinned = settings["app.show_search_box"] !== "false";
    setSearchBoxPinned(searchPinned);
    setShowSearchBox(searchPinned);
    setScrollTopButtonEnabled(settings["app.show_scroll_top_button"] !== "false");
    if (settings["app.arrow_key_selection"] === "false") setArrowKeySelection(false);
    setLightModeEnabled(settings["app.light_mode_enabled"] === "true");
    {
      const mins = Number.parseInt(String(settings["app.light_mode_idle_minutes"] || "15"), 10);
      setLightModeIdleMinutes(Number.isFinite(mins) ? Math.min(240, Math.max(1, mins)) : 15);
    }

    setMqttEnabled(settings["mqtt_enabled"] === "true");
    setMqttServer(settings["mqtt_server"] || "");

    setMqttPort(settings["mqtt_port"] || "1883");
    setMqttUser(settings["mqtt_username"] || "");
    setMqttPass(settings["mqtt_password"] || "");
    if (settings["mqtt_topic"]) {
      setMqttTopic(settings["mqtt_topic"]);
    } else {
      // Same shape as the topic the MQTT client creates (128 random bits),
      // saved now so the phone and the client agree on it.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const topic = `tiez/tiez_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
      setMqttTopic(topic);
      invoke("save_setting", { key: "mqtt_topic", value: topic }).catch(console.error);
    }
    setMqttProtocol(settings["mqtt_protocol"] || "mqtt://");
    setMqttWsPath(settings["mqtt_ws_path"] || "/mqtt");
    setMqttNotificationEnabled(settings["mqtt_notification_enabled"] !== "false");
    setQuickPasteModifier(normalizeQuickPasteModifier(settings["app.quick_paste_modifier"]));
    if (settings["app.sequential_mode"] === "true") setSequentialModeState(true);
    const soundOn = settings["app.sound_enabled"] !== "false";
    setSoundEnabled(soundOn);
    invoke("set_sound_enabled", { enabled: soundOn }).catch(console.error);

    if (settings["app.sound_volume"]) {
      // Windows 0.3.x stored 0-100; read anything above 1 as a percentage.
      const volume = parseFloat(settings["app.sound_volume"]);
      if (Number.isFinite(volume)) {
        setSoundVolume(Math.max(0, volume > 1 ? Math.min(volume, 100) / 100 : volume));
      }
    }
    if (settings["app.window_pinned"] === "true") {
      setIsWindowPinned(true);
      invoke("set_window_pinned", { pinned: true }).catch(console.error);
    }

    setSettingsLoaded(true);
  }, [
    settings,
    tagManagerSizeRef,
    setCustomBackground,
    setCustomBackgroundOpacity,
    setSurfaceOpacity,
    setPersistent,
    setPersistentLimitEnabled,
    setPersistentLimit,
    setClipboardSortMode,
    setDeduplicate,
    setCaptureFiles,
    setCaptureRichText,
    setRichTextSnapshotPreview,
    setPrivacyProtection,
    setPrivacyProtectionKinds,
    setPrivacyProtectionCustomRules,
    setCleanupRules,
    setAppCleanupPolicies,
    setSilentStart,
    setFollowMouse,
    setShowAppBorder,
    setRegistryWinVEnabled,
    setPasteMethod,
    setShowSourceAppIcon,
    setHideUnselectedItemActions,
    setCompactShowTime,
    setSplitViewEnabled,

    setDeleteAfterPaste,
    setMoveToTopAfterPaste,
    setClickCopyOnly,
    setHideTrayIcon,
    setEdgeDocking,
    setSearchBoxPinned,
    setShowSearchBox,
    setScrollTopButtonEnabled,
    setArrowKeySelection,
    setLightModeEnabled,
    setLightModeIdleMinutes,
    setMqttEnabled,
    setMqttServer,
    setMqttPort,
    setMqttUser,
    setMqttPass,
    setMqttTopic,
    setMqttProtocol,
    setMqttWsPath,
    setMqttNotificationEnabled,
    setQuickPasteModifier,
    setSequentialModeState,
    setSoundEnabled,
    setSoundVolume,
    setIsWindowPinned,
    setSettingsLoaded,
    setClipboardItemFontSize,
    setClipboardTagFontSize,
    setTagManagerEnabled,
  ]);
};
