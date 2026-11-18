import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { isTypingHotkey } from "../lib/hotkeyKey";
import { findHotkeyConflict, HOTKEY_ACTIONS, hotkeyAction, type HotkeyActionId, type Hotkeys } from "../lib/hotkeyActions";

interface UseHotkeyConfigOptions {
  hotkeys: Hotkeys;
  setHotkeys: (update: (prev: Hotkeys) => Hotkeys) => void;
  setAppSettings?: (update: (prev: Record<string, string>) => Record<string, string>) => void;
  recordingHotkey: HotkeyActionId | null;
  setRecordingHotkey: (action: HotkeyActionId | null) => void;
  saveAppSetting: (type: string, value: string) => void;
  t: (key: string) => string;
  pushToast: (msg: string, duration?: number) => number;
}

/** Checks, registers and stores the configurable hotkeys (see hotkeyActions.ts). */
export const useHotkeyConfig = ({
  hotkeys,
  setHotkeys,
  setAppSettings,
  recordingHotkey,
  setRecordingHotkey,
  saveAppSetting,
  t,
  pushToast
}: UseHotkeyConfigOptions) => {
  const tauriReady = isTauriRuntime();
  const [recordingPreview, setRecordingPreview] = useState("");

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
      const settingKey = hotkeyAction(action).setting;
      setRecordingPreview("");
      setRecordingHotkey(null);

      if (!tauriReady) {
        setHotkeys((prev) => ({ ...prev, [action]: newHotkey }));
        saveAppSetting(settingKey, newHotkey);
        return;
      }

      if (isTypingHotkey(newHotkey)) {
        pushToast(t("hotkey_needs_modifier"), 5000);
        return;
      }

      const conflicting = newHotkey ? findHotkeyConflict(hotkeys, action, newHotkey) : null;

      try {
        const snapshot = await invoke<Record<string, string>>("set_hotkey", {
          action,
          hotkey: newHotkey,
        });
        if (snapshot && typeof snapshot === "object") {
          setHotkeys((prev) => ({
            ...prev,
            ...(snapshot as Partial<Hotkeys>),
          }));
          setAppSettings?.((prev) => {
            const next = { ...prev };
            for (const spec of HOTKEY_ACTIONS) {
              if (spec.id in snapshot) {
                next[`app.${spec.setting}`] = snapshot[spec.id];
              }
            }
            return next;
          });
          if (conflicting && snapshot[conflicting.id] !== undefined) {
            const swappedTo = snapshot[conflicting.id] || t("disabled");
            pushToast(`${t(conflicting.labelKey)} → ${swappedTo}`, 2600);
          }
        } else {
          setHotkeys((prev) => ({ ...prev, [action]: newHotkey }));
          setAppSettings?.((prev) => ({ ...prev, [`app.${settingKey}`]: newHotkey }));
        }
      } catch (err) {
        console.error(err);
        const msg = String(err || "").replace(/^Error:\s*/i, "");
        pushToast(msg || `${t("hotkey_register_failed")}${String(err)}`, 4000);
      }
    },
    [hotkeys, pushToast, saveAppSetting, setAppSettings, setHotkeys, setRecordingHotkey, t, tauriReady]
  );

  // While recording, the native keyboard hook pauses AuraClip's global hotkeys
  // on the main thread, streams held modifiers, and delivers the final combo.
  useEffect(() => {
    if (!tauriReady) return;
    setRecordingPreview("");
    invoke("set_recording_mode", { enabled: recordingHotkey !== null }).catch(console.error);
    if (recordingHotkey === null) return;

    const unlisten = listen<string>("hotkey-recorded", (event) => {
      void updateHotkey(recordingHotkey, event.payload);
    });
    const unlistenPreview = listen<string>("hotkey-recording-preview", (event) => {
      setRecordingPreview(event.payload || "");
    });
    const unlistenCancel = listen("recording-cancelled", () => {
      setRecordingPreview("");
      setRecordingHotkey(null);
    });
    return () => {
      unlisten.then((f) => f());
      unlistenPreview.then((f) => f());
      unlistenCancel.then((f) => f());
    };
  }, [recordingHotkey, setRecordingHotkey, updateHotkey, tauriReady]);

  return { checkHotkeyConflict, updateHotkey, recordingPreview };
};
