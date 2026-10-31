// Configurable global hotkeys. Mirrors HOTKEY_ACTIONS in
// src-tauri/src/app/commands/hotkey_cmd.rs: add a hotkey there and here.

export type HotkeyActionId = "clipboard" | "phrases" | "sequential" | "plain" | "search";

export interface HotkeyActionDescriptor {
  id: HotkeyActionId;
  /** Settings key without the "app." prefix (saveAppSetting adds it). */
  setting: string;
  defaultValue: string;
  labelKey: string;
  hintKey?: string;
}

export const HOTKEY_ACTIONS: HotkeyActionDescriptor[] = [
  { id: "clipboard", setting: "hotkey", defaultValue: "Alt+V", labelKey: "global_hotkey", hintKey: "main_hotkey_hint" },
  { id: "phrases", setting: "phrases_hotkey", defaultValue: "Alt+C", labelKey: "phrases_hotkey_label", hintKey: "phrases_hotkey_hint" },
  { id: "sequential", setting: "sequential_hotkey", defaultValue: "Alt+Shift+S", labelKey: "sequential_paste_hotkey_label" },
  { id: "plain", setting: "plain_paste_hotkey", defaultValue: "Alt+Shift+V", labelKey: "plain_paste_hotkey_label", hintKey: "plain_paste_hotkey_hint" },
  { id: "search", setting: "search_hotkey", defaultValue: "Alt+F", labelKey: "search_hotkey_label" }
];

export type Hotkeys = Record<HotkeyActionId, string>;

export const hotkeyAction = (id: HotkeyActionId): HotkeyActionDescriptor =>
  HOTKEY_ACTIONS.find((action) => action.id === id)!;

export const defaultHotkeys = (): Hotkeys =>
  Object.fromEntries(HOTKEY_ACTIONS.map((action) => [action.id, action.defaultValue])) as Hotkeys;

/** Hotkeys from a get_settings result; missing keys keep `base`. */
export const hotkeysFromSettings = (settings: Record<string, string>, base: Hotkeys = defaultHotkeys()): Hotkeys => {
  const next = { ...base };
  for (const action of HOTKEY_ACTIONS) {
    const value = settings[`app.${action.setting}`];
    if (value !== undefined) next[action.id] = value;
  }
  return next;
};

const normalize = (hotkey: string) =>
  hotkey.split("+").map((part) => part.trim().toLowerCase()).filter(Boolean).sort().join("+");

/** The other action already using `hotkey` (same rule as set_hotkey in the backend). */
export const findHotkeyConflict = (
  hotkeys: Hotkeys,
  action: HotkeyActionId,
  hotkey: string
): HotkeyActionDescriptor | undefined => {
  if (!hotkey.trim()) return undefined;
  const wanted = normalize(hotkey);
  return HOTKEY_ACTIONS.find((other) =>
    other.id !== action && !!hotkeys[other.id] && normalize(hotkeys[other.id]) === wanted
  );
};

/** What the settings page needs to show and edit the hotkeys. */
export interface HotkeySettings {
  hotkeys: Hotkeys;
  recordingHotkey: HotkeyActionId | null;
  setRecordingHotkey: (action: HotkeyActionId | null) => void;
  updateHotkey: (action: HotkeyActionId, hotkey: string) => void;
  checkHotkeyConflict: (hotkey: string, action: HotkeyActionId) => boolean;
}
