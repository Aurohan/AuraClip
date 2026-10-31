use crate::app_state::SettingsState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};

/// Plays the copy cue when sounds are enabled. Only copying makes a sound:
/// the user asked for silent pastes, so every other kind is ignored.
pub fn play_ui_sound(app_handle: &AppHandle, kind: &str) {
    if kind != "copy" {
        return;
    }
    let settings = app_handle.state::<SettingsState>();
    if !settings.sound_enabled.load(Ordering::Relaxed) {
        return;
    }

    let volume = settings
        .sound_volume
        .lock()
        .map(|v| *v)
        .unwrap_or(1.0);

    play_ui_sound_at_volume(kind, volume);
}

pub fn play_ui_sound_at_volume(kind: &str, volume: f64) {
    if kind == "copy" {
        crate::infrastructure::bundled_sound::play_copy_sound(volume);
    }
}
