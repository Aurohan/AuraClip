//! Fades the main window in when it opens and out when it is dismissed.
//!
//! The acrylic and mica backdrops are drawn by DWM behind the WebView, so a
//! CSS fade would leave a bare glass panel appearing and vanishing at once.
//! The whole window is faded instead, through layered-window alpha.
//!
//! The window is never left hidden at reduced alpha: anything that shows it
//! without going through this module still shows it fully opaque.

#![cfg(target_os = "windows")]

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewWindow};
use windows::Win32::Foundation::{COLORREF, HWND};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA,
    WS_EX_LAYERED,
};

const FADE_IN: Duration = Duration::from_millis(140);
const FADE_OUT: Duration = Duration::from_millis(110);
const FRAME: Duration = Duration::from_millis(8);

/// Bench override `AURACLIP_FADE_SLOWDOWN=20`: fades 20 times slower, so a
/// screenshot can catch one half way. Debug builds only.
fn scaled(duration: Duration) -> Duration {
    if !cfg!(debug_assertions) {
        return duration;
    }
    let factor = std::env::var("AURACLIP_FADE_SLOWDOWN")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(1)
        .max(1);
    duration * factor
}

struct State {
    /// Bumped by every fade or reset; a fade that sees a newer one stops.
    generation: u64,
    alpha: u8,
    fading_out: bool,
}

static STATE: Mutex<State> = Mutex::new(State { generation: 0, alpha: 255, fading_out: false });

fn hwnd(window: &WebviewWindow) -> Option<isize> {
    window.hwnd().ok().map(|h| h.0 as isize)
}

/// Writes the alpha only if `generation` is still the latest, under the lock,
/// so a superseded fade can never overwrite a newer one's value.
fn set_alpha(raw: isize, generation: u64, alpha: u8) -> bool {
    let Ok(mut state) = STATE.lock() else { return false };
    if state.generation != generation {
        return false;
    }
    let hwnd = HWND(raw as _);
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if ex & WS_EX_LAYERED.0 as isize == 0 {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_LAYERED.0 as isize);
        }
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA);
    }
    state.alpha = alpha;
    true
}

fn begin(fading_out: bool) -> (u64, u8) {
    let mut state = STATE.lock().unwrap_or_else(|e| e.into_inner());
    state.generation += 1;
    state.fading_out = fading_out;
    (state.generation, state.alpha)
}

fn ease_out(t: f32) -> f32 {
    1.0 - (1.0 - t).powi(3)
}

/// Steps from `from` to `to`; false if a newer fade took over.
fn ramp(raw: isize, generation: u64, from: u8, to: u8, duration: Duration) -> bool {
    let start = Instant::now();
    loop {
        let t = (start.elapsed().as_secs_f32() / duration.as_secs_f32()).min(1.0);
        let alpha = from as f32 + (to as f32 - from as f32) * ease_out(t);
        if !set_alpha(raw, generation, alpha.round() as u8) {
            return false;
        }
        if t >= 1.0 {
            return true;
        }
        std::thread::sleep(FRAME);
    }
}

/// A fade-out is running: the window is on screen but already dismissed.
pub fn is_fading_out() -> bool {
    STATE.lock().map(|s| s.fading_out).unwrap_or(false)
}

/// Call right before `window.show()`. A window that was hidden starts
/// transparent; one caught mid fade-out continues from where it is.
pub fn prepare_show(window: &WebviewWindow) {
    let Some(raw) = hwnd(window) else { return };
    let was_visible = window.is_visible().unwrap_or(false);
    let (generation, alpha) = begin(false);
    set_alpha(raw, generation, if was_visible { alpha } else { 0 });
}

/// Call right after `window.show()`.
pub fn fade_in(window: &WebviewWindow) {
    let Some(raw) = hwnd(window) else { return };
    let (generation, from) = begin(false);
    if from == 255 {
        return;
    }
    std::thread::spawn(move || {
        ramp(raw, generation, from, 255, scaled(FADE_IN));
    });
}

/// Fades the window out, then runs `hide` on the main thread. If the window
/// is shown again meanwhile, `hide` is skipped.
pub fn fade_out_then<F>(window: &WebviewWindow, hide: F)
where
    F: FnOnce(&WebviewWindow) + Send + 'static,
{
    let Some(raw) = hwnd(window) else {
        hide(window);
        return;
    };
    let (generation, from) = begin(true);
    let window = window.clone();
    std::thread::spawn(move || {
        if !ramp(raw, generation, from, 0, scaled(FADE_OUT)) {
            return;
        }
        let app = window.app_handle().clone();
        let _ = app.run_on_main_thread(move || {
            {
                let Ok(state) = STATE.lock() else { return };
                if state.generation != generation {
                    return;
                }
            }
            hide(&window);
            reset(&window);
        });
    });
}

/// Hidden without a fade (a paste, closing): cancel any fade and leave the
/// window opaque for whatever shows it next.
pub fn reset(window: &WebviewWindow) {
    let Some(raw) = hwnd(window) else { return };
    let (generation, _) = begin(false);
    set_alpha(raw, generation, 255);
}
