//! Global hotkeys. Every configurable hotkey is one entry in `HOTKEY_ACTIONS`:
//! its settings key, default, and whether it fires on press or release.
//! Registration (`sync_registered_hotkeys`), conflict checks (`set_hotkey`) and
//! dispatch (`setup::handle_global_shortcut`) all read that table.
use crate::app_state::SettingsState;
use crate::database::DbState;
use crate::error::{AppError, AppResult};
use crate::global_state::HOTKEY_STRING;
use crate::infrastructure::repository::settings_repo::SettingsRepository;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub struct HotkeyAction {
    /// Used by the frontend (`set_hotkey`) and the dispatcher.
    pub id: &'static str,
    pub settings_key: &'static str,
    pub default: &'static str,
    /// Paste-like actions fire on release so the held modifiers don't leak
    /// into the target app; window actions fire on press.
    pub on_release: bool,
    /// Shown in conflict errors.
    pub label: &'static str,
}

pub const CLIPBOARD: &str = "clipboard";
pub const PHRASES: &str = "phrases";
pub const SEQUENTIAL: &str = "sequential";
pub const PLAIN: &str = "plain";
pub const SEARCH: &str = "search";

pub const HOTKEY_ACTIONS: &[HotkeyAction] = &[
    HotkeyAction { id: CLIPBOARD, settings_key: "app.hotkey", default: "Alt+V", on_release: false, label: "剪贴板快捷键" },
    HotkeyAction { id: PHRASES, settings_key: "app.phrases_hotkey", default: "Alt+C", on_release: false, label: "常用短语快捷键" },
    HotkeyAction { id: SEQUENTIAL, settings_key: "app.sequential_hotkey", default: "Alt+Shift+S", on_release: true, label: "顺序粘贴快捷键" },
    HotkeyAction { id: PLAIN, settings_key: "app.plain_paste_hotkey", default: "Alt+Shift+V", on_release: true, label: "纯文本粘贴快捷键" },
    HotkeyAction { id: SEARCH, settings_key: "app.search_hotkey", default: "Alt+F", on_release: true, label: "搜索快捷键" },
];

pub fn hotkey_action(id: &str) -> Option<&'static HotkeyAction> {
    HOTKEY_ACTIONS.iter().find(|action| action.id == id)
}

/// Current value of every action, read from settings (missing → default).
pub fn load_hotkeys(repo: &impl SettingsRepository) -> HashMap<&'static str, String> {
    HOTKEY_ACTIONS
        .iter()
        .map(|action| {
            let value = repo
                .get(action.settings_key)
                .ok()
                .flatten()
                .unwrap_or_else(|| action.default.to_string());
            (action.id, value)
        })
        .collect()
}

fn is_mouse_hotkey(hotkey: &str) -> bool {
    hotkey.eq_ignore_ascii_case("MouseMiddle") || hotkey.eq_ignore_ascii_case("MButton")
}

/// Mouse hotkeys are handled by the low-level mouse hook, not the plugin.
fn parse_shortcut(hotkey: &str) -> Option<Shortcut> {
    if hotkey.is_empty() || is_mouse_hotkey(hotkey) {
        return None;
    }
    hotkey.replace("Win", "Super").parse::<Shortcut>().ok()
}

fn same_hotkey(a: &str, b: &str) -> bool {
    if a.trim().is_empty() || b.trim().is_empty() {
        return false;
    }
    match (parse_shortcut(a), parse_shortcut(b)) {
        (Some(x), Some(y)) => x == y,
        _ => a.trim().eq_ignore_ascii_case(b.trim()),
    }
}

/// The other action already using `hotkey`, if any.
pub fn conflicting_action(
    hotkeys: &HashMap<&'static str, String>,
    action_id: &str,
    hotkey: &str,
) -> Option<&'static HotkeyAction> {
    HOTKEY_ACTIONS.iter().find(|other| {
        other.id != action_id
            && hotkeys
                .get(other.id)
                .is_some_and(|current| same_hotkey(current, hotkey))
    })
}

/// One-time move to the AuraClip defaults (Alt+V clipboard, Alt+C phrases).
/// Only values still equal to an old default change; customized ones stay.
/// Returns the settings to write.
pub fn hotkey_default_migration(
    current: &HashMap<&'static str, Option<String>>,
) -> Vec<(&'static str, String)> {
    let get = |id: &str| current.get(id).cloned().flatten();
    let mut main = get(CLIPBOARD);
    let mut sequential = get(SEQUENTIAL);
    let mut writes = Vec::new();
    if main.as_deref().is_some_and(|v| v.eq_ignore_ascii_case("Alt+C")) {
        main = Some("Alt+V".to_string());
        writes.push(("app.hotkey", "Alt+V".to_string()));
    }
    if sequential.as_deref().is_some_and(|v| v.eq_ignore_ascii_case("Alt+V")) {
        sequential = Some("Alt+Shift+S".to_string());
        writes.push(("app.sequential_hotkey", "Alt+Shift+S".to_string()));
    }
    if get(PHRASES).is_none() {
        let taken = [main, sequential, get(PLAIN), get(SEARCH)]
            .into_iter()
            .flatten()
            .any(|v| same_hotkey(&v, "Alt+C"));
        writes.push(("app.phrases_hotkey", if taken { String::new() } else { "Alt+C".to_string() }));
    }
    writes
}

pub fn migrate_hotkey_defaults(repo: &impl SettingsRepository) {
    let current = HOTKEY_ACTIONS
        .iter()
        .map(|action| (action.id, repo.get(action.settings_key).ok().flatten()))
        .collect();
    for (key, value) in hotkey_default_migration(&current) {
        let _ = repo.set(key, &value);
    }
}

const QUICK_PASTE_KEYS: [&str; 10] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

pub fn normalize_quick_paste_modifier(modifier: &str) -> String {
    match modifier.trim().to_ascii_lowercase().as_str() {
        "ctrl" | "control" => "ctrl".to_string(),
        "alt" | "option" => "alt".to_string(),
        "shift" => "shift".to_string(),
        "win" | "command" | "meta" | "super" => "win".to_string(),
        _ => "disabled".to_string(),
    }
}

fn quick_paste_modifier_prefix(modifier: &str) -> Option<&'static str> {
    match normalize_quick_paste_modifier(modifier).as_str() {
        "ctrl" => Some("Ctrl"),
        "alt" => Some("Alt"),
        "shift" => Some("Shift"),
        "win" => Some("Super"),
        _ => None,
    }
}

fn quick_paste_shortcut(modifier: &str, index: usize) -> Option<Shortcut> {
    let prefix = quick_paste_modifier_prefix(modifier)?;
    let key = QUICK_PASTE_KEYS.get(index)?;
    parse_shortcut(&format!("{prefix}+{key}"))
}

pub fn quick_paste_index_from_shortcut(modifier: &str, shortcut: &Shortcut) -> Option<usize> {
    (0..QUICK_PASTE_KEYS.len()).find(|index| {
        quick_paste_shortcut(modifier, *index)
            .as_ref()
            .map(|candidate| candidate == shortcut)
            .unwrap_or(false)
    })
}


/// Whether `action` should be bound right now.
fn action_active(action: &HotkeyAction, settings: &SettingsState) -> bool {
    // Only bind sequential paste while the mode is enabled (#125).
    action.id != SEQUENTIAL || settings.sequential_mode.load(Ordering::Relaxed)
}

/// The action bound to `shortcut` that fires on this press/release.
pub fn action_for_shortcut(
    settings: &SettingsState,
    shortcut: &Shortcut,
    released: bool,
) -> Option<&'static HotkeyAction> {
    let hotkeys = settings.hotkeys.lock().unwrap();
    HOTKEY_ACTIONS.iter().find(|action| {
        action.on_release == released
            && action_active(action, settings)
            && hotkeys
                .get(action.id)
                .and_then(|value| parse_shortcut(value))
                .is_some_and(|bound| &bound == shortcut)
    })
}

fn register_unique_shortcut(
    app_handle: &AppHandle,
    hotkey: &str,
    registered: &mut HashSet<String>,
) -> AppResult<()> {
    let shortcut = parse_shortcut(hotkey).ok_or_else(|| {
        AppError::Validation(format!("快捷键格式不正确，请重新设置。\n当前：{hotkey}"))
    })?;
    let key = format!("{shortcut:?}");
    if registered.insert(key) {
        app_handle
            .global_shortcut()
            .register(shortcut)
            .map_err(|e| AppError::Internal(format!("快捷键设置失败，请换一组按键。\n当前：{hotkey}\n详情：{e}")))?;
    }
    Ok(())
}

pub fn sync_registered_hotkeys(app_handle: &AppHandle) -> AppResult<()> {
    let _ = app_handle.global_shortcut().unregister_all();

    let settings = app_handle.state::<SettingsState>();
    let hotkeys = settings.hotkeys.lock().unwrap().clone();
    let quick_paste_modifier = settings.quick_paste_modifier.lock().unwrap().clone();
    let mut registered = HashSet::new();
    // Register every shortcut even if one fails (e.g. taken by another app):
    // an early return used to leave the later ones unregistered, so pressing
    // them typed a character instead. Failures are logged; the first one is
    // returned.
    let mut first_error: Option<AppError> = None;
    let mut register = |hotkey: &str| {
        if let Err(err) = register_unique_shortcut(app_handle, hotkey, &mut registered) {
            crate::error!(">>> [HOTKEY] {err}");
            first_error.get_or_insert(err);
        }
    };

    for action in HOTKEY_ACTIONS {
        let Some(hotkey) = hotkeys.get(action.id) else { continue };
        if hotkey.is_empty() || is_mouse_hotkey(hotkey) || !action_active(action, &settings) {
            continue;
        }
        register(hotkey);
    }

    if let Some(prefix) = quick_paste_modifier_prefix(&quick_paste_modifier) {
        for key in QUICK_PASTE_KEYS {
            register(&format!("{prefix}+{key}"));
        }
    }

    first_error.map_or(Ok(()), Err)
}

/// `sync_registered_hotkeys` for background threads. The shortcut plugin
/// holds its lock while it waits for the main thread, and the main thread
/// takes that lock to deliver a hotkey press, so a press at the wrong moment
/// froze both. On the main thread the two can't overlap.
pub fn sync_registered_hotkeys_on_main_thread(app_handle: &AppHandle) {
    let handle = app_handle.clone();
    let _ = app_handle.run_on_main_thread(move || {
        let _ = sync_registered_hotkeys(&handle);
    });
}

/// Sets one action's hotkey ("" turns it off): validates, stores, re-registers.
#[tauri::command]
pub fn set_hotkey(app_handle: AppHandle, action: String, hotkey: String) -> AppResult<()> {
    let action = hotkey_action(&action)
        .ok_or_else(|| AppError::Validation(format!("未知的快捷键：{action}")))?;
    let hotkey = hotkey.trim().to_string();
    if is_typing_hotkey(&hotkey) {
        return Err(AppError::Validation(
            "快捷键需要包含 Ctrl、Alt 或 Win。".to_string(),
        ));
    }
    if !hotkey.is_empty() && !is_mouse_hotkey(&hotkey) && parse_shortcut(&hotkey).is_none() {
        return Err(AppError::Validation(format!("快捷键格式不正确：{hotkey}")));
    }

    let settings = app_handle.state::<SettingsState>();
    {
        let mut hotkeys = settings.hotkeys.lock().unwrap();
        if let Some(other) = conflicting_action(&hotkeys, action.id, &hotkey) {
            return Err(AppError::Validation(format!("与「{}」冲突", other.label)));
        }
        app_handle
            .state::<DbState>()
            .settings_repo
            .set(action.settings_key, &hotkey)
            .map_err(AppError::from)?;
        hotkeys.insert(action.id, hotkey.clone());
    }
    if action.id == CLIPBOARD {
        // The mouse hook reads this for MouseMiddle.
        *HOTKEY_STRING.lock().unwrap() = hotkey;
    }
    sync_registered_hotkeys(&app_handle)
}

const TAB_CLIPBOARD: u8 = 0;
const TAB_PHRASES: u8 = 1;
/// The main window's current tab, reported by the frontend.
static CURRENT_TAB: AtomicU8 = AtomicU8::new(TAB_CLIPBOARD);

fn tab_code(tab: &str) -> Option<u8> {
    match tab {
        CLIPBOARD => Some(TAB_CLIPBOARD),
        PHRASES => Some(TAB_PHRASES),
        _ => None,
    }
}

#[tauri::command]
pub fn set_main_tab(tab: String) {
    if let Some(code) = tab_code(&tab) {
        CURRENT_TAB.store(code, Ordering::Relaxed);
    }
}

/// A freshly built window starts on the clipboard tab.
pub fn reset_main_tab() {
    CURRENT_TAB.store(TAB_CLIPBOARD, Ordering::Relaxed);
}

#[derive(Debug, PartialEq, Eq)]
pub enum TabEffect {
    /// Show the window on the tab.
    Show,
    /// Already shown on another tab: switch, stay shown.
    Switch,
    /// Already shown on this tab: hide.
    Hide,
}

pub fn tab_effect(shown: bool, current_tab: &str, target_tab: &str) -> TabEffect {
    match (shown, current_tab == target_tab) {
        (false, _) => TabEffect::Show,
        (true, false) => TabEffect::Switch,
        (true, true) => TabEffect::Hide,
    }
}

pub fn current_tab() -> &'static str {
    if CURRENT_TAB.load(Ordering::Relaxed) == TAB_PHRASES { PHRASES } else { CLIPBOARD }
}

/// Shift alone (or no modifier) plus a key that types text: registered
/// globally it swallows that character in every app. Mirrors isTypingHotkey
/// in src/shared/lib/hotkeyKey.ts.
pub fn is_typing_hotkey(hotkey: &str) -> bool {
    let parts: Vec<String> = hotkey
        .split('+')
        .map(|p| p.trim().to_uppercase())
        .filter(|p| !p.is_empty())
        .collect();
    let Some(first) = parts.first() else { return false };
    if first == "MOUSEMIDDLE" || first == "MBUTTON" {
        return false;
    }
    const MODIFIERS: [&str; 10] =
        ["CTRL", "CONTROL", "ALT", "OPTION", "MENU", "WIN", "SUPER", "COMMAND", "CMD", "META"];
    if parts.iter().any(|p| MODIFIERS.contains(&p.as_str())) {
        return false;
    }
    let Some(key) = parts.iter().filter(|p| p.as_str() != "SHIFT").last() else { return false };
    let silent = (key.len() >= 2
        && key.starts_with('F')
        && key[1..].parse::<u8>().map_or(false, |n| (1..=24).contains(&n)))
        || matches!(
            key.as_str(),
            "ESC" | "ESCAPE" | "INSERT" | "DELETE" | "HOME" | "END" | "PAGEUP" | "PAGEDOWN"
                | "UP" | "DOWN" | "LEFT" | "RIGHT" | "ARROWUP" | "ARROWDOWN" | "ARROWLEFT"
                | "ARROWRIGHT" | "PRINTSCREEN" | "SCROLLLOCK" | "PAUSE" | "NUMLOCK"
        );
    !silent
}

#[tauri::command]
pub fn test_hotkey_available(app_handle: AppHandle, hotkey: String) -> AppResult<bool> {
    if hotkey.is_empty()
        || hotkey.eq_ignore_ascii_case("MouseMiddle")
        || hotkey.eq_ignore_ascii_case("MButton")
    {
        return Ok(true);
    }
    if is_typing_hotkey(&hotkey) {
        return Err(AppError::Validation(
            "快捷键需要包含 Ctrl、Option/Alt 或 Command/Win。".to_string(),
        ));
    }

    let normalized = hotkey.replace("Win", "Super");
    let shortcut = normalized
        .parse::<Shortcut>()
        .map_err(|_| AppError::Validation("请重新设置快捷键组合。".to_string()))?;

    match app_handle.global_shortcut().register(shortcut.clone()) {
        Ok(_) => {
            let _ = app_handle.global_shortcut().unregister(shortcut);
            Ok(true)
        }
        Err(e) => {
            let err_str = format!("{:?}", e);
            let user_msg = if err_str.contains("AlreadyRegistered") {
                "该快捷键已被其他程序占用".to_string()
            } else {
                "快捷键不可用".to_string()
            };
            Err(AppError::Internal(user_msg))
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typing_hotkeys_are_refused() {
        for h in ["Shift+S", "Shift+1", "C", "Space"] {
            assert!(is_typing_hotkey(h), "{h}");
        }
        for h in ["Alt+C", "Ctrl+Shift+V", "Ctrl+1", "F5", "Shift+F5", "MouseMiddle", ""] {
            assert!(!is_typing_hotkey(h), "{h}");
        }
    }

    #[test]
    fn the_action_table_has_unique_ids_keys_and_defaults() {
        let ids: HashSet<_> = HOTKEY_ACTIONS.iter().map(|a| a.id).collect();
        let keys: HashSet<_> = HOTKEY_ACTIONS.iter().map(|a| a.settings_key).collect();
        assert_eq!(ids.len(), HOTKEY_ACTIONS.len());
        assert_eq!(keys.len(), HOTKEY_ACTIONS.len());
        let defaults: HashMap<_, _> =
            HOTKEY_ACTIONS.iter().map(|a| (a.id, a.default.to_string())).collect();
        for action in HOTKEY_ACTIONS {
            assert!(parse_shortcut(action.default).is_some(), "{}", action.default);
            assert!(conflicting_action(&defaults, action.id, action.default).is_none(), "{}", action.id);
        }
        assert_eq!(hotkey_action(CLIPBOARD).unwrap().default, "Alt+V");
        assert_eq!(hotkey_action(PHRASES).unwrap().default, "Alt+C");
    }

    #[test]
    fn conflicts_name_the_other_action_and_ignore_empty() {
        let hotkeys: HashMap<_, _> =
            [(CLIPBOARD, "Alt+V".to_string()), (PHRASES, String::new()), (SEARCH, "alt+f".to_string())]
                .into_iter()
                .collect();
        assert_eq!(conflicting_action(&hotkeys, PHRASES, "Alt+V").unwrap().id, CLIPBOARD);
        assert_eq!(conflicting_action(&hotkeys, PHRASES, "Alt+F").unwrap().id, SEARCH);
        assert!(conflicting_action(&hotkeys, CLIPBOARD, "Alt+V").is_none());
        assert!(conflicting_action(&hotkeys, CLIPBOARD, "").is_none());
    }

    fn migrate(values: &[(&'static str, Option<&str>)]) -> HashMap<&'static str, String> {
        let current = values.iter().map(|(id, v)| (*id, v.map(str::to_string))).collect();
        hotkey_default_migration(&current)
            .into_iter()
            .map(|(key, value)| (hotkey_id_for_key(key), value))
            .collect()
    }

    fn hotkey_id_for_key(key: &str) -> &'static str {
        HOTKEY_ACTIONS.iter().find(|a| a.settings_key == key).unwrap().id
    }

    #[test]
    fn old_defaults_move_and_custom_values_stay() {
        let w = migrate(&[(CLIPBOARD, Some("Alt+C")), (SEQUENTIAL, Some("Alt+V")), (PHRASES, None)]);
        assert_eq!(w[CLIPBOARD], "Alt+V");
        assert_eq!(w[SEQUENTIAL], "Alt+Shift+S");
        assert_eq!(w[PHRASES], "Alt+C");

        // This machine: already customized, only phrases is added.
        let w = migrate(&[(CLIPBOARD, Some("Alt+V")), (SEQUENTIAL, Some("Alt+Shift+S")), (PHRASES, None)]);
        assert_eq!(w.len(), 1);
        assert_eq!(w[PHRASES], "Alt+C");

        let w = migrate(&[(CLIPBOARD, Some("Ctrl+Shift+K")), (PHRASES, Some("Ctrl+Q"))]);
        assert!(w.is_empty());
    }

    #[test]
    fn phrases_stays_off_when_alt_c_is_taken() {
        let w = migrate(&[(CLIPBOARD, Some("Ctrl+K")), (SEARCH, Some("Alt+C")), (PHRASES, None)]);
        assert_eq!(w[PHRASES], "");
    }

    #[test]
    fn tab_hotkeys_show_switch_or_hide() {
        assert_eq!(tab_effect(false, CLIPBOARD, PHRASES), TabEffect::Show);
        assert_eq!(tab_effect(false, PHRASES, PHRASES), TabEffect::Show);
        assert_eq!(tab_effect(true, CLIPBOARD, PHRASES), TabEffect::Switch);
        assert_eq!(tab_effect(true, PHRASES, CLIPBOARD), TabEffect::Switch);
        assert_eq!(tab_effect(true, PHRASES, PHRASES), TabEffect::Hide);
        assert_eq!(tab_effect(true, CLIPBOARD, CLIPBOARD), TabEffect::Hide);
    }
}
