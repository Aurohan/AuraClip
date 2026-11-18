import { describe, expect, it } from "vitest";
import { defaultHotkeys, findHotkeyConflict, HOTKEY_ACTIONS, hotkeysFromSettings } from "./hotkeyActions";

describe("hotkey actions", () => {
  it("defaults are Alt+C for the clipboard and Alt+V for quick phrases, with no conflicts", () => {
    const hotkeys = defaultHotkeys();
    expect(hotkeys.clipboard).toBe("Alt+C");
    expect(hotkeys.phrases).toBe("Alt+V");
    for (const action of HOTKEY_ACTIONS) {
      expect(findHotkeyConflict(hotkeys, action.id, hotkeys[action.id])).toBeUndefined();
    }
  });

  it("finds the other action using a hotkey, ignoring order and case", () => {
    const hotkeys = defaultHotkeys();
    expect(findHotkeyConflict(hotkeys, "phrases", "alt+c")?.id).toBe("clipboard");
    expect(findHotkeyConflict(hotkeys, "search", "Shift+Alt+V")?.id).toBe("plain");
    expect(findHotkeyConflict(hotkeys, "phrases", "")).toBeUndefined();
  });

  it("reads saved hotkeys, keeping defaults for missing keys", () => {
    const hotkeys = hotkeysFromSettings({ "app.hotkey": "Ctrl+K", "app.phrases_hotkey": "" });
    expect(hotkeys.clipboard).toBe("Ctrl+K");
    expect(hotkeys.phrases).toBe("");
    expect(hotkeys.search).toBe("Alt+F");
  });
});
