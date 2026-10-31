import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { isTypingHotkey } from "../lib/hotkeyKey";
import { findHotkeyConflict, hotkeyAction, type HotkeyActionId, type Hotkeys } from "../lib/hotkeyActions";

interface UseHotkeyConfigOptions {
  hotkeys: Hotkeys;
  setHotkeys: (update: (prev: Hotkeys) => Hotkeys) => void;
  recordingHotkey: HotkeyActionId | null;
  setRecordingHotkey: (action: HotkeyActionId | null) => void;
  saveAppSetting: (type: string, value: string) => void;
  t: (key: string) => string;
  pushToast: (msg: string, duration?: number) => number;
}

/** Checks, registers and stores the configurable global hotkeys (see hotkeyActions.ts). */
export const useHotkeyConfig = ({
  hotkeys,
  setHotkeys,
  recordingHotkey,
  setRecordingHotkey,
  saveAppSetting,
  t,
  pushToast
}: UseHotkeyConfigOptions) => {
  const tauriReady = isTauriRuntime();

  /** True (and a toast) when `newHotkey` can't be used for `action`. */
  const checkHotkeyConflict = useCallback(
    (newHotkey: string, action: HotkeyActionId): boolean => {
      if (!newHotkey) return false;
      if (isTypingHotkey(newHotkey)) {
        pushToast(t("hotkey_needs_modifier"), 5000);
        return true;
      }
      const other = findHotkeyConflict(hotkeys, action, newHotkey);
      if (other) {
        pushToast(t("hotkey_conflict_toast").replace("{name}", t(other.labelKey)), 5000);
        return true;
      }
      return false;
    },
    [hotkeys, t, pushToast]
  );

  const updateHotkey = useCallback(
    async (action: HotkeyActionId, newHotkey: string) => {
      const store = () => {
        setHotkeys((prev) => ({ ...prev, [action]: newHotkey }));
        saveAppSetting(hotkeyAction(action).setting, newHotkey);
      };
      setRecordingHotkey(null);
      if (!tauriReady) {
        store();
        return;
      }
      if (checkHotkeyConflict(newHotkey, action)) return;
      if (newHotkey) {
        try {
          await invoke<boolean>("test_hotkey_available", { hotkey: newHotkey });
        } catch (err) {
          pushToast(`❌ ${newHotkey}: ${err || t("hotkey_occupied")}`, 5000);
          return;
        }
      }
      try {
        await invoke("set_hotkey", { action, hotkey: newHotkey });
        store();
      } catch (err) {
        console.error(err);
        pushToast(t("hotkey_register_failed") + String(err), 3000);
      }
    },
    [checkHotkeyConflict, pushToast, saveAppSetting, setHotkeys, setRecordingHotkey, t, tauriReady]
  );

  // While recording, the keyboard hook pauses hotkeys and sends the combo.
  useEffect(() => {
    if (!tauriReady) return;
    invoke("set_recording_mode", { enabled: recordingHotkey !== null }).catch(console.error);
    if (recordingHotkey === null) return;

    const unlisten = listen<string>("hotkey-recorded", (event) => {
      updateHotkey(recordingHotkey, event.payload);
    });
    const unlistenCancel = listen("recording-cancelled", () => setRecordingHotkey(null));
    return () => {
      unlisten.then((f) => f());
      unlistenCancel.then((f) => f());
    };
  }, [recordingHotkey, setRecordingHotkey, updateHotkey, tauriReady]);

  return { checkHotkeyConflict, updateHotkey };
};
