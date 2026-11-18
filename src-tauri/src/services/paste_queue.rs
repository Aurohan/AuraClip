use crate::app_state::{AppDataDir, PasteQueue, SessionHistory};
use crate::app::commands::hotkey_cmd::sync_registered_hotkeys_on_main_thread;
use crate::database::DbState;
use crate::error::AppResult;
use crate::infrastructure::repository::clipboard_repo::ClipboardRepository;
use crate::infrastructure::repository::settings_repo::SettingsRepository;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tauri::{Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

pub static STREAMING_SEQUENTIAL_ACTIVE: AtomicBool = AtomicBool::new(false);
pub static TOTAL_QUEUE_COUNT: AtomicUsize = AtomicUsize::new(0);
pub static CURRENT_QUEUE_INDEX: AtomicUsize = AtomicUsize::new(0);
pub static PENDING_CTRL_V: AtomicBool = AtomicBool::new(false);
static ADVANCE_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn is_streaming_sequential_active() -> bool {
    STREAMING_SEQUENTIAL_ACTIVE.load(Ordering::Relaxed)
}

pub fn cancel_streaming_sequential(app_handle: &tauri::AppHandle) {
    if STREAMING_SEQUENTIAL_ACTIVE.swap(false, Ordering::SeqCst) {
        let state = app_handle.state::<PasteQueue>();
        state.inner().0.lock().unwrap().items.clear();
        PENDING_CTRL_V.store(false, Ordering::Relaxed);
        TOTAL_QUEUE_COUNT.store(0, Ordering::Relaxed);
        CURRENT_QUEUE_INDEX.store(0, Ordering::Relaxed);
        let _ = app_handle.emit("queue-finished", ());
        let _ = app_handle.emit("toast", "已退出顺序粘贴模式");
        sync_registered_hotkeys_on_main_thread(app_handle);
    }
}

pub async fn prime_item_to_clipboard(
    app_handle: &tauri::AppHandle,
    id: i64,
) -> AppResult<Option<String>> {
    let state = app_handle.state::<PasteQueue>();
    let db_state = app_handle.state::<DbState>();
    let session = app_handle.state::<SessionHistory>();

    let entry_opt = if id < 0 {
        let s = session.inner().0.lock().unwrap();
        s.iter().find(|i| i.id == id).cloned()
    } else {
        db_state.repo.get_entry_by_id(id).unwrap_or(None)
    };

    let Some(entry) = entry_opt else {
        return Ok(None);
    };

    let c_type = entry.content_type;
    let content = crate::services::clipboard_ops::with_current_entry_file(
        app_handle,
        &c_type,
        entry.content,
    );
    let html_content = entry.html_content;

    // CRITICAL: Update last_action_was_paste & last_pasted_content BEFORE modifying clipboard
    // to prevent race conditions where the monitor sees the change as a new copy.
    {
        let mut queue = state.inner().0.lock().unwrap();
        queue.last_action_was_paste = true;
        queue.last_pasted_content = Some(content.clone());
    }

    crate::services::clipboard_ops::prepare_clipboard_payload(
        &content,
        &c_type,
        html_content.as_deref(),
        crate::services::clipboard_ops::resolve_paste_with_format(
            &content,
            &c_type,
            html_content.as_deref(),
            None,
        ),
    )
    .await?;

    let preview = if !entry.preview.is_empty() {
        entry.preview
    } else {
        let trimmed = content.trim();
        trimmed.replace("\r\n", " ").replace('\n', " ")
    };

    Ok(Some(preview))
}

#[tauri::command]
pub fn get_paste_queue(state: State<'_, PasteQueue>) -> Vec<i64> {
    state
        .inner()
        .0
        .lock()
        .unwrap()
        .items
        .iter()
        .copied()
        .collect()
}

#[tauri::command]
pub fn set_paste_queue(
    app_handle: tauri::AppHandle,
    state: State<'_, PasteQueue>,
    item_ids: Vec<i64>,
) -> AppResult<()> {
    if item_ids.is_empty() {
        state.inner().0.lock().unwrap().items.clear();
        STREAMING_SEQUENTIAL_ACTIVE.store(false, Ordering::SeqCst);
        PENDING_CTRL_V.store(false, Ordering::Relaxed);
        TOTAL_QUEUE_COUNT.store(0, Ordering::Relaxed);
        CURRENT_QUEUE_INDEX.store(0, Ordering::Relaxed);
        let _ = app_handle.emit("queue-finished", ());
        sync_registered_hotkeys_on_main_thread(&app_handle);
        return Ok(());
    }

    let count = item_ids.len();
    {
        let mut queue = state.inner().0.lock().unwrap();
        queue.items.clear();
        for id in &item_ids {
            queue.items.push_back(*id);
        }
        queue.last_action_was_paste = false;
        queue.last_pasted_content = None;
    }

    TOTAL_QUEUE_COUNT.store(count, Ordering::SeqCst);
    CURRENT_QUEUE_INDEX.store(1, Ordering::SeqCst);
    STREAMING_SEQUENTIAL_ACTIVE.store(true, Ordering::SeqCst);
    PENDING_CTRL_V.store(false, Ordering::Relaxed);

    let first_id = item_ids[0];
    let handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(Some(preview)) = prime_item_to_clipboard(&handle_clone, first_id).await {
            crate::services::ui_sound::play_ui_sound(&handle_clone, "copy");
            let short_preview = if preview.chars().count() > 25 {
                format!("{}…", preview.chars().take(25).collect::<String>())
            } else {
                preview
            };
            let body_msg = format!("第 1/{} 项已就绪: {}\n在目标文档直接按 Ctrl+V 依次粘贴", count, short_preview);
            let _ = handle_clone
                .notification()
                .builder()
                .title("AuraClip 顺序粘贴已就绪")
                .body(&body_msg)
                .show();
            let _ = handle_clone.emit("toast", format!("顺序粘贴已就绪 (1/{})，按 Ctrl+V 依次粘贴", count));
        }
        // Auto-dismiss window and hand focus to target application
        let _ = crate::services::clipboard_ops::handle_window_focus_for_paste(&handle_clone).await;
    });

    sync_registered_hotkeys_on_main_thread(&app_handle);
    Ok(())
}

pub async fn advance_streaming_sequential(app_handle: &tauri::AppHandle) {
    let _guard = ADVANCE_MUTEX.lock().await;

    if !STREAMING_SEQUENTIAL_ACTIVE.load(Ordering::Relaxed) {
        return;
    }

    let state = app_handle.state::<PasteQueue>();
    let db_state = app_handle.state::<DbState>();
    let session = app_handle.state::<SessionHistory>();

    // 1. Pop the item that was just pasted
    let popped_id = {
        let mut queue = state.inner().0.lock().unwrap();
        queue.items.pop_front()
    };

    let Some(finished_id) = popped_id else {
        STREAMING_SEQUENTIAL_ACTIVE.store(false, Ordering::SeqCst);
        let _ = app_handle.emit("queue-finished", ());
        return;
    };

    // Post-paste bookkeeping
    let is_pinned = if finished_id > 0 {
        db_state.repo.get_entry_by_id(finished_id).ok().flatten().map(|e| e.is_pinned).unwrap_or(false)
    } else {
        false
    };
    let has_tags = if finished_id > 0 {
        db_state.repo.get_entry_by_id(finished_id).ok().flatten().map(|e| !e.tags.is_empty()).unwrap_or(false)
    } else {
        false
    };

    let delete_after_paste = {
        let settings_state = app_handle.state::<crate::app_state::SettingsState>();
        settings_state.delete_after_paste.load(Ordering::Relaxed)
    };

    if delete_after_paste && !is_pinned && !has_tags {
        if finished_id < 0 {
            let mut s = session.inner().0.lock().unwrap();
            if let Some(pos) = s.iter().position(|i| i.id == finished_id) {
                s.remove(pos);
            }
        } else {
            let app_data = app_handle.state::<AppDataDir>();
            let data_dir = app_data.0.lock().unwrap();
            let _ = db_state.repo.delete_after_paste(finished_id, Some(&data_dir));
        }
        let _ = app_handle.emit("clipboard-removed", finished_id);
    } else if finished_id > 0 {
        let _ = db_state.repo.increment_use_count(finished_id);
    }

    let _ = app_handle.emit("queue-item-pasted", finished_id);

    // 2. Check next item in queue
    let next_id_opt = {
        let queue = state.inner().0.lock().unwrap();
        queue.items.front().copied()
    };

    match next_id_opt {
        Some(next_id) => {
            let curr = CURRENT_QUEUE_INDEX.fetch_add(1, Ordering::SeqCst) + 1;
            let total = TOTAL_QUEUE_COUNT.load(Ordering::Relaxed);
            if let Ok(Some(preview)) = prime_item_to_clipboard(app_handle, next_id).await {
                crate::services::ui_sound::play_ui_sound(app_handle, "copy");
                let short_preview = if preview.chars().count() > 25 {
                    format!("{}…", preview.chars().take(25).collect::<String>())
                } else {
                    preview
                };
                let msg = format!("顺序粘贴 ({}/{}): {}", curr, total, short_preview);
                let _ = app_handle.emit("toast", msg);
            }
        }
        None => {
            STREAMING_SEQUENTIAL_ACTIVE.store(false, Ordering::SeqCst);
            TOTAL_QUEUE_COUNT.store(0, Ordering::Relaxed);
            CURRENT_QUEUE_INDEX.store(0, Ordering::Relaxed);
            let _ = app_handle.emit("queue-finished", ());
            let _ = app_handle.emit("toast", "顺序粘贴已全部完成");
            let _ = app_handle
                .notification()
                .builder()
                .title("AuraClip 顺序粘贴")
                .body("全部项目已成功粘贴完成")
                .show();
            crate::services::ui_sound::play_ui_sound(app_handle, "copy");
            sync_registered_hotkeys_on_main_thread(app_handle);
        }
    }
}

#[tauri::command]
pub fn paste_next_step(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        paste_next_step_inner(app_handle).await;
    });
}

async fn paste_next_step_inner(app_handle: tauri::AppHandle) {
    let _paste_guard = crate::services::clipboard_ops::PASTE_LOCK.lock().await;
    let state = app_handle.state::<PasteQueue>();
    let db_state = app_handle.state::<DbState>();
    let session = app_handle.state::<SessionHistory>();

    let window_was_visible = app_handle
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    let id_opt = {
        let mut queue = state.inner().0.lock().unwrap();
        queue.last_action_was_paste = true;
        queue.items.pop_front()
    };

    if let Some(id) = id_opt {
        let entry_opt = if id < 0 {
            let s = session.inner().0.lock().unwrap();
            s.iter().find(|i| i.id == id).cloned()
        } else {
            db_state.repo.get_entry_by_id(id).unwrap_or(None)
        };

        if let Some(entry) = entry_opt {
            let c_type = entry.content_type;
            let content = crate::services::clipboard_ops::with_current_entry_file(
                &app_handle,
                &c_type,
                entry.content,
            );
            let html_content = entry.html_content;
            let is_pinned = entry.is_pinned;
            let has_tags = !entry.tags.is_empty();

            {
                let mut queue = state.inner().0.lock().unwrap();
                queue.last_pasted_content = Some(content.clone());
            }

            match crate::services::clipboard_ops::prepare_clipboard_payload(
                &content,
                &c_type,
                html_content.as_deref(),
                crate::services::clipboard_ops::resolve_paste_with_format(
                    &content,
                    &c_type,
                    html_content.as_deref(),
                    None,
                ),
            )
            .await
            {
                Err(err) => {
                    eprintln!("[ERROR] Failed to prepare clipboard payload for sequential paste: {err}");
                    let _ = app_handle.emit("queue-item-pasted", id);
                }
                Ok(()) => {
                    if window_was_visible {
                        #[cfg(target_os = "windows")]
                        {
                            use crate::global_state::LAST_ACTIVE_HWND;
                            use crate::infrastructure::windows_ext::WindowExt;
                            use windows::Win32::Foundation::HWND;

                            let previous = LAST_ACTIVE_HWND.load(std::sync::atomic::Ordering::Relaxed);
                            if previous != 0 {
                                WindowExt::force_focus_window(HWND(previous as _));
                            }
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
                    } else {
                        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                    }

                    let paste_method = app_handle
                        .try_state::<crate::database::DbState>()
                        .and_then(|db| db.settings_repo.get("app.paste_method").ok().flatten())
                        .unwrap_or_else(|| "auto".to_string());
                    let paste_method =
                        crate::services::clipboard_ops::resolve_paste_method_for_target(&paste_method);
                    crate::services::clipboard_ops::send_paste_keystroke(
                        &paste_method,
                        Some(&content),
                        Some(&c_type),
                    );

                    std::thread::sleep(std::time::Duration::from_millis(20));

                    let delete_after_paste = {
                        let settings_state = app_handle.state::<crate::app_state::SettingsState>();
                        settings_state
                            .delete_after_paste
                            .load(std::sync::atomic::Ordering::Relaxed)
                    };

                    if delete_after_paste && !is_pinned && !has_tags {
                        {
                            let mut s = session.inner().0.lock().unwrap();
                            if let Some(pos) = s.iter().position(|i| i.id == id) {
                                s.remove(pos);
                            }
                        }

                        if id > 0 {
                            let app_data = app_handle.state::<AppDataDir>();
                            let data_dir = app_data.0.lock().unwrap();
                            if db_state.repo.delete_after_paste(id, Some(&data_dir)).is_ok() {
                                let _ = app_handle.emit("clipboard-removed", id);
                            }
                        } else {
                            let _ = app_handle.emit("clipboard-removed", id);
                        }
                    } else if id > 0 {
                        let _ = db_state.repo.increment_use_count(id);
                    }

                    let _ = app_handle.emit("queue-item-pasted", id);

                    // Prime next item into OS clipboard if exists
                    let next_id_opt = {
                        let queue = state.inner().0.lock().unwrap();
                        queue.items.front().copied()
                    };
                    if let Some(next_id) = next_id_opt {
                        let _ = prime_item_to_clipboard(&app_handle, next_id).await;
                    } else {
                        STREAMING_SEQUENTIAL_ACTIVE.store(false, Ordering::SeqCst);
                        let _ = app_handle.emit("queue-finished", ());
                    }
                }
            }
        }
    } else {
        STREAMING_SEQUENTIAL_ACTIVE.store(false, Ordering::SeqCst);
        let _ = app_handle.emit("queue-finished", ());
    }

    let queue_empty = {
        let queue = state.inner().0.lock().unwrap();
        queue.items.is_empty()
    };
    if queue_empty {
        sync_registered_hotkeys_on_main_thread(&app_handle);
    }
}
