//! Starting AuraClip normally while it already runs in the background.
//! Provides bulletproof single-instance hand-off via Win32 Named Event.

use std::sync::OnceLock;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, ERROR_ACCESS_DENIED, HWND, LPARAM, LRESULT, WPARAM, WAIT_OBJECT_0};
use windows::Win32::System::Threading::{
    CreateEventW, OpenEventW, OpenMutexW, SetEvent, WaitForSingleObject,
    GetCurrentProcessId, EVENT_MODIFY_STATE, INFINITE, MUTEX_ALL_ACCESS,
};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    ChangeWindowMessageFilterEx, FindWindowW, GetWindowThreadProcessId, PostMessageW,
    RegisterWindowMessageW, MSGFLT_ALLOW,
};

static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn show_message() -> u32 {
    static MESSAGE: OnceLock<u32> = OnceLock::new();
    *MESSAGE.get_or_init(|| unsafe { RegisterWindowMessageW(w!("AuraClip.ShowWindow")) })
}

/// The plugin's message window of the running instance.
fn find_instance_window(identifier: &str) -> Option<HWND> {
    let class = wide(&format!("{identifier}-sic"));
    let name = wide(&format!("{identifier}-siw"));
    unsafe { FindWindowW(PCWSTR(class.as_ptr()), PCWSTR(name.as_ptr())) }
        .ok()
        .filter(|hwnd| !hwnd.0.is_null())
}

/// Run before Tauri. True when AuraClip already runs: it signals the running instance
/// to bring its window forward, and this second process exits.
pub fn hand_off_to_elevated_instance(identifier: &str, args: &[String]) -> bool {
    // 1. Try Named Event wakeup first: works across normal & elevated processes instantly
    let event_name = wide(&format!("{identifier}-wakeup"));
    if let Ok(event) = unsafe { OpenEventW(EVENT_MODIFY_STATE, false, PCWSTR(event_name.as_ptr())) } {
        let login_start = args.iter().any(|arg| arg == "--minimized" || arg == "--autostart");
        if !login_start {
            unsafe {
                let _ = SetEvent(event);
                let _ = CloseHandle(event);
            }
        }
        return true;
    }

    // 2. Fallback to Mutex check
    let mutex = wide(&format!("{identifier}-sim"));
    match unsafe { OpenMutexW(MUTEX_ALL_ACCESS, false, PCWSTR(mutex.as_ptr())) } {
        Ok(handle) => {
            unsafe {
                let _ = CloseHandle(handle);
            }
            let login_start = args.iter().any(|arg| arg == "--minimized" || arg == "--autostart");
            if !login_start {
                if let Some(hwnd) = find_instance_window(identifier) {
                    unsafe {
                        let _ = PostMessageW(Some(hwnd), show_message(), WPARAM(0), LPARAM(0));
                    }
                }
            }
            return false;
        }
        Err(error) if error.code() == ERROR_ACCESS_DENIED.to_hresult() => {
            let login_start = args.iter().any(|arg| arg == "--minimized" || arg == "--autostart");
            if !login_start {
                if let Some(hwnd) = find_instance_window(identifier) {
                    unsafe {
                        let _ = PostMessageW(Some(hwnd), show_message(), WPARAM(0), LPARAM(0));
                    }
                }
            }
            return true;
        }
        Err(_) => return false,
    }
}

/// In AuraClip running instance: start listening for wakeup event and show messages.
pub fn accept_show_from_normal_starts(app: &tauri::AppHandle, identifier: &str) {
    if APP.set(app.clone()).is_ok() {
        let app_clone = app.clone();
        let event_name = wide(&format!("{identifier}-wakeup"));
        std::thread::spawn(move || {
            let event = unsafe {
                CreateEventW(
                    None,
                    false, // auto-reset
                    false, // initial non-signaled
                    PCWSTR(event_name.as_ptr()),
                )
            };
            if let Ok(event) = event {
                loop {
                    if unsafe { WaitForSingleObject(event, INFINITE) } == WAIT_OBJECT_0 {
                        let app = app_clone.clone();
                        crate::app::window_manager::show_and_focus_main_window(&app);
                    }
                }
            }
        });
    }

    if let Some(hwnd) = find_instance_window(identifier) {
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
        }
        if pid == unsafe { GetCurrentProcessId() } {
            unsafe {
                if SetWindowSubclass(hwnd, Some(instance_window_proc), 1, 0).as_bool() {
                    let _ = ChangeWindowMessageFilterEx(hwnd, show_message(), MSGFLT_ALLOW, None);
                }
            }
        }
    }
}

unsafe extern "system" fn instance_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if msg == show_message() {
        if let Some(app) = APP.get() {
            let app = app.clone();
            std::thread::spawn(move || {
                crate::app::window_manager::show_and_focus_main_window(&app);
            });
        }
        return LRESULT(0);
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}
