use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN,
    WM_MBUTTONDOWN, WM_RBUTTONDOWN, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::app::commands::hotkey_cmd::{run_on_main_thread_async, sync_registered_hotkeys};
use crate::app::window_manager::{hide_window_on_resign, toggle_window};
use crate::app_state::SettingsState;
use crate::global_state::*;
#[cfg(target_os = "windows")]
use crate::infrastructure::windows_ext::WindowExt;

static RECORDING_MODS: AtomicU8 = AtomicU8::new(0);
const MOD_BIT_CTRL: u8 = 1 << 0;
const MOD_BIT_SHIFT: u8 = 1 << 1;
const MOD_BIT_ALT: u8 = 1 << 2;
const MOD_BIT_WIN: u8 = 1 << 3;

/// The main window's HWND, so the mouse hook never asks Tauri for it:
/// `WebviewWindow::hwnd()` waits for the main thread, and a low-level hook
/// that waits stalls every click in the system (and Windows may drop it).
#[cfg(target_os = "windows")]
static MAIN_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

/// Record the main window's HWND. Call wherever the window is (re)created.
#[cfg(target_os = "windows")]
pub fn remember_main_hwnd(window: &tauri::WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        MAIN_HWND.store(hwnd.0 as isize, Ordering::Relaxed);
    }
}

fn is_recording_clear_key(vk: u32) -> bool {
    matches!(vk, 0x08 | 0x2E)
}

fn modifier_bit_for_vk(vk: u32) -> Option<u8> {
    match vk {
        0x11 | 0xA2 | 0xA3 => Some(MOD_BIT_CTRL),
        0x10 | 0xA0 | 0xA1 => Some(MOD_BIT_SHIFT),
        0x12 | 0xA4 | 0xA5 => Some(MOD_BIT_ALT),
        0x5B | 0x5C => Some(MOD_BIT_WIN),
        _ => None,
    }
}

fn format_modifier_prefix(mods: u8) -> String {
    let mut out = String::new();
    if mods & MOD_BIT_CTRL != 0 {
        out.push_str("Ctrl+");
    }
    if mods & MOD_BIT_SHIFT != 0 {
        out.push_str("Shift+");
    }
    if mods & MOD_BIT_ALT != 0 {
        out.push_str("Alt+");
    }
    if mods & MOD_BIT_WIN != 0 {
        out.push_str("Win+");
    }
    out
}

#[tauri::command]
pub async fn set_recording_mode(app_handle: AppHandle, enabled: bool) -> Result<(), String> {
    run_on_main_thread_async(&app_handle, move |handle| {
        RECORDING_MODS.store(0, Ordering::SeqCst);
        IS_RECORDING.store(enabled, Ordering::SeqCst);
        crate::global_state::CLIPBOARD_MONITOR_PAUSED.store(enabled, Ordering::Relaxed);

        if enabled {
            // Pause all AuraClip global shortcuts while recording so pressing an
            // existing shortcut (e.g. Alt+V or Alt+1) records cleanly instead of
            // hiding the window or triggering quick-paste.
            let _ = handle.global_shortcut().unregister_all();
        } else {
            let _ = sync_registered_hotkeys(&handle);
            let _ = handle.emit("hotkey-recording-preview", String::new());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())
}

// Low-level Keyboard Hook Procedure
#[cfg(target_os = "windows")]
pub unsafe extern "system" fn keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    let msg = w_param.0 as u32;
    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

    if n_code >= 0 && (is_down || is_up) {
        let kbd_struct = *(l_param.0 as *const KBDLLHOOKSTRUCT);
        let vk = kbd_struct.vkCode;

        // 1. Handle Recording Mode — deterministic modifier tracking + IME guard
        if IS_RECORDING.load(Ordering::SeqCst) {
            if let Some(bit) = modifier_bit_for_vk(vk) {
                if is_down {
                    RECORDING_MODS.fetch_or(bit, Ordering::SeqCst);
                } else if is_up {
                    RECORDING_MODS.fetch_and(!bit, Ordering::SeqCst);
                }
                let mods = RECORDING_MODS.load(Ordering::SeqCst);
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    let preview = format_modifier_prefix(mods)
                        .trim_end_matches('+')
                        .to_string();
                    let _ = handle.emit("hotkey-recording-preview", preview);
                }
                // Swallow modifiers during recording so Win never opens Start Menu
                // and Alt never activates window system menu / steals focus.
                return LRESULT(1);
            }

            if !is_down {
                return LRESULT(1);
            }

            let mut mods = RECORDING_MODS.load(Ordering::SeqCst);
            if GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000 != 0 {
                mods |= MOD_BIT_CTRL;
            }
            if GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000 != 0 {
                mods |= MOD_BIT_SHIFT;
            }
            if GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000 != 0 {
                mods |= MOD_BIT_ALT;
            }
            if (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0)
                || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0)
            {
                mods |= MOD_BIT_WIN;
            }

            // Bare Esc cancels recording without closing settings/window
            if vk == 0x1B && mods == 0 {
                IS_RECORDING.store(false, Ordering::SeqCst);
                RECORDING_MODS.store(0, Ordering::SeqCst);
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    let _ = handle.emit("hotkey-recording-preview", String::new());
                    let _ = handle.emit("recording-cancelled", ());
                }
                return LRESULT(1);
            }

            // Bare Backspace / Delete clears the shortcut
            if is_recording_clear_key(vk) && mods == 0 {
                IS_RECORDING.store(false, Ordering::SeqCst);
                RECORDING_MODS.store(0, Ordering::SeqCst);
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    let _ = handle.emit("hotkey-recording-preview", String::new());
                    let _ = handle.emit("hotkey-recorded", String::new());
                }
                return LRESULT(1);
            }

            let key_name = recorded_key_name(vk);
            // Ignore IME process keys (VK_PROCESSKEY = 0xE5) and unknown virtual keys
            if key_name.starts_with("Key_") {
                return LRESULT(1);
            }

            if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                let final_hotkey = format!("{}{}", format_modifier_prefix(mods), key_name);
                IS_RECORDING.store(false, Ordering::SeqCst);
                RECORDING_MODS.store(0, Ordering::SeqCst);
                let _ = handle.emit("hotkey-recording-preview", String::new());
                let _ = handle.emit("hotkey-recorded", final_hotkey);
            }
            return LRESULT(1);
        }

        // 2. Global Navigation Keys (Up/Down, Enter, Delete, Esc)
        if NAVIGATION_ENABLED.load(Ordering::SeqCst) && !IS_RECORDING.load(Ordering::SeqCst) {
            if IS_HIDDEN.load(Ordering::Relaxed) {
                return CallNextHookEx(None, n_code, w_param, l_param);
            }
            let allow_navigation = if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                let settings = handle.state::<SettingsState>();
                settings.arrow_key_selection.load(Ordering::Relaxed)
            } else {
                true
            };

            let is_escape = vk == 0x1B;
            // Esc closes the visible window even with arrow-key selection off;
            // that setting is about Up/Down/Enter. From #172.
            if !allow_navigation && !is_escape {
                return CallNextHookEx(None, n_code, w_param, l_param);
            }

            let is_navigation_key =
                vk == 0x26 || vk == 0x28 || vk == 0x0D || vk == 0x2E || is_escape;
            // Enter pastes, Shift+Enter copies and Delete removes the selected
            // entry: all only after Up/Down selected one, so they never reach
            // the app in front by surprise.
            let needs_selection = vk == 0x0D || vk == 0x2E;

            if is_navigation_key && is_down {
                // Only Enter requires navigation mode to be active
                // Escape can always close the window when it's visible
                if needs_selection && !NAVIGATION_MODE_ACTIVE.load(Ordering::Relaxed) {
                    return CallNextHookEx(None, n_code, w_param, l_param);
                }
                let ctrl_down = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
                let alt_down = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
                let win_down = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0)
                    || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0);

                let shift_down = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;

                if !ctrl_down && !alt_down && !win_down {
                    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                        let action = match vk {
                            0x26 => "up",
                            0x28 => "down",
                            0x0D if shift_down => "copy",
                            0x0D => "enter",
                            0x2E => "delete",
                            0x1B => "escape",
                            _ => "",
                        };

                        if !action.is_empty() {
                            if vk == 0x26 || vk == 0x28 {
                                NAVIGATION_MODE_ACTIVE.store(true, Ordering::Relaxed);
                            } else if vk == 0x1B {
                                NAVIGATION_MODE_ACTIVE.store(false, Ordering::Relaxed);
                            }
                            if action == "escape" {
                                let handle_clone = handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = handle_clone.emit("navigation-action", "escape");
                                    toggle_window(&handle_clone);
                                });
                            } else {
                                let _ = handle.emit("navigation-action", action);
                            }
                            return LRESULT(1);
                        }
                    }
                }
            }
        }
    }
    CallNextHookEx(None, n_code, w_param, l_param)
}

// Low-level Mouse Hook Procedure
#[cfg(target_os = "windows")]
pub unsafe extern "system" fn mouse_proc(n_code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
    if n_code >= 0 {
        let msg = w_param.0 as u32;
        if msg == WM_MBUTTONDOWN
            || msg == WM_LBUTTONDOWN
            || msg == WM_RBUTTONDOWN
            || msg == windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONUP
            || msg == windows::Win32::UI::WindowsAndMessaging::WM_RBUTTONUP
        {
            // Track mouse state globally
            if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN {
                IS_MOUSE_BUTTON_DOWN.store(true, Ordering::SeqCst);
            } else if msg == windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONUP
                || msg == windows::Win32::UI::WindowsAndMessaging::WM_RBUTTONUP
            {
                IS_MOUSE_BUTTON_DOWN.store(false, Ordering::SeqCst);
                return CallNextHookEx(None, n_code, w_param, l_param); // Return early for up events
            }

            // Handle Recording Mode
            if IS_RECORDING.load(Ordering::SeqCst) && msg == WM_MBUTTONDOWN {
                IS_RECORDING.store(false, Ordering::SeqCst);
                RECORDING_MODS.store(0, Ordering::SeqCst);
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    let _ = handle.emit("hotkey-recording-preview", String::new());
                    let _ = handle.emit("hotkey-recorded", "MouseMiddle");
                }
                return LRESULT(1);
            }

            // Click Elsewhere to Hide Logic
            // Only plain Win32 calls in here; the reaction runs on its own
            // thread, since hiding waits on the main thread and sleeps.
            if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN {
                let main_hwnd_raw = MAIN_HWND.load(Ordering::Relaxed);
                let main_hwnd = HWND(main_hwnd_raw as *mut _);
                if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                    if main_hwnd_raw != 0
                        && !is_blur_ignored()
                        && WindowExt::is_window_visible(main_hwnd)
                    {
                        let mouse_struct = *(l_param.0 as *const MSLLHOOKSTRUCT);
                        let point = mouse_struct.pt;
                        let mut rect = RECT::default();
                        let _ = windows::Win32::UI::WindowsAndMessaging::GetWindowRect(
                            main_hwnd, &mut rect,
                        );

                        // Boundary check: Is point outside the rect? (with 5px margin of safety)
                        let margin = 5;
                        let is_outside = point.x < rect.left - margin
                            || point.x > rect.right + margin
                            || point.y < rect.top - margin
                            || point.y > rect.bottom + margin;

                        if is_outside {
                            let handle = handle.clone();
                            std::thread::spawn(move || {
                                if WINDOW_PINNED.load(Ordering::Relaxed) {
                                    // Pinned: Just reset focusable state to ensure we don't retain focus
                                    if let Some(window) = handle.get_webview_window("main") {
                                        let _ = window.set_focusable(false);
                                    }
                                } else {
                                    // Not hide_window_cmd: by now the click has
                                    // focused what was clicked, and restoring the
                                    // previous app would pull focus away from it.
                                    let _ = hide_window_on_resign(handle);
                                }
                            });
                        }
                    }
                }
            }

            // Handle configured middle mouse hotkey
            if msg == WM_MBUTTONDOWN {
                let current = HOTKEY_STRING.lock().unwrap().to_lowercase();
                if current == "mousemiddle" || current == "mbutton" {
                    // Off the hook: after light mode the toggle rebuilds the
                    // WebView, and blocking here stalls every mouse event
                    // system-wide (Windows drops hooks that keep timing out).
                    if let Some(handle) = GLOBAL_APP_HANDLE.get() {
                        let handle = handle.clone();
                        std::thread::spawn(move || toggle_window(&handle));
                    }
                    return LRESULT(1);
                }
            }
        }
    }

    CallNextHookEx(None, n_code, w_param, l_param)
}

/// The name a recorded key is saved under, in the form the shortcut parser
/// (global-hotkey) reads. "Plus" for the =/+ key and "Key_96" for the number
/// pad weren't, so those keys couldn't be set.
pub(crate) fn recorded_key_name(vk: u32) -> String {
    match vk {
        0x08 => "Backspace".to_string(),
        0x09 => "Tab".to_string(),
        0x0D => "Enter".to_string(),
        0x13 => "Pause".to_string(),
        0x14 => "CapsLock".to_string(),
        0x1B => "Escape".to_string(),
        0x20 => "Space".to_string(),
        0x21 => "PageUp".to_string(),
        0x22 => "PageDown".to_string(),
        0x23 => "End".to_string(),
        0x24 => "Home".to_string(),
        0x25 => "Left".to_string(),
        0x26 => "Up".to_string(),
        0x27 => "Right".to_string(),
        0x28 => "Down".to_string(),
        0x2C => "PrintScreen".to_string(),
        0x2D => "Insert".to_string(),
        0x2E => "Delete".to_string(),
        0x91 => "ScrollLock".to_string(),
        0xBB => "=".to_string(),
        0xBC => "Comma".to_string(),
        0xBD => "Minus".to_string(),
        0xBE => "Period".to_string(),
        0xBF => "/".to_string(),
        0xC0 => "`".to_string(),
        0xBA => ";".to_string(),
        0xDB => "[".to_string(),
        0xDC => "\\".to_string(),
        0xDD => "]".to_string(),
        0xDE => "'".to_string(),
        k @ 0x60..=0x69 => format!("Numpad{}", k - 0x60),
        0x6A => "NumpadMultiply".to_string(),
        0x6B => "NumpadAdd".to_string(),
        0x6D => "NumpadSubtract".to_string(),
        0x6E => "NumpadDecimal".to_string(),
        0x6F => "NumpadDivide".to_string(),
        k if (0x70..=0x87).contains(&k) => format!("F{}", k - 0x6F),
        k if (0x30..=0x39).contains(&k) || (0x41..=0x5A).contains(&k) => {
            char::from_u32(k).unwrap().to_string()
        }
        _ => format!("Key_{}", vk),
    }
}

pub fn is_win_v_hotkey(hotkey: &str) -> bool {
    let parts: Vec<String> = hotkey
        .split('+')
        .map(|p| p.trim().to_uppercase())
        .filter(|p| !p.is_empty())
        .collect();

    if parts.is_empty() {
        return false;
    }

    let mut has_win = false;
    let mut has_v = false;

    for part in &parts {
        match part.as_str() {
            "WIN" | "SUPER" | "COMMAND" | "META" => has_win = true,
            "V" => has_v = true,
            _ => return false,
        }
    }

    has_win && has_v
}

#[cfg(test)]
mod tests {
    #[test]
    fn recorded_keys_can_be_registered() {
        use tauri_plugin_global_shortcut::Shortcut;
        // =/+ key, number pad digits and operators, and a few others.
        for vk in [0xBB, 0xBD, 0x60, 0x69, 0x6A, 0x6B, 0x6D, 0x6E, 0x6F, 0x41, 0x70, 0xDC] {
            let hotkey = format!("Ctrl+{}", super::recorded_key_name(vk));
            assert!(hotkey.parse::<Shortcut>().is_ok(), "{hotkey}");
        }
    }

    use super::is_recording_clear_key;

    #[test]
    fn recording_clear_keys_are_not_registered_as_shortcuts() {
        assert!(is_recording_clear_key(0x08));
        assert!(is_recording_clear_key(0x2E));
        assert!(!is_recording_clear_key(0x2D));
        assert!(!is_recording_clear_key(0x41));
    }
}
