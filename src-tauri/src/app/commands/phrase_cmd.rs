use crate::database::DbState;
use crate::error::{AppError, AppResult};
use crate::infrastructure::repository::phrase_repo::QuickPhrase;
use tauri::{AppHandle, Emitter, State};

#[tauri::command(async)]
pub fn get_quick_phrases(state: State<'_, DbState>) -> AppResult<Vec<QuickPhrase>> {
    state.phrase_repo.get_all().map_err(AppError::from)
}

#[tauri::command(async)]
pub fn save_quick_phrase(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    phrase: QuickPhrase,
) -> AppResult<i64> {
    let id = state.phrase_repo.save(&phrase).map_err(AppError::from)?;
    let _ = app_handle.emit("quick-phrases-changed", ());
    Ok(id)
}

#[tauri::command(async)]
pub fn delete_quick_phrase(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    id: i64,
) -> AppResult<()> {
    state.phrase_repo.delete(id).map_err(AppError::from)?;
    let _ = app_handle.emit("quick-phrases-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn reorder_quick_phrases(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    ids: Vec<i64>,
) -> AppResult<()> {
    state.phrase_repo.reorder(ids).map_err(AppError::from)?;
    let _ = app_handle.emit("quick-phrases-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn mark_quick_phrase_used(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    id: i64,
) -> AppResult<()> {
    let _ = state.phrase_repo.increment_use(id);
    let _ = app_handle.emit("quick-phrases-changed", ());
    crate::services::ui_sound::play_ui_sound(&app_handle, "copy");
    Ok(())
}

#[tauri::command(async)]
pub async fn paste_quick_phrase(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    id: i64,
) -> AppResult<()> {
    let phrases = state.phrase_repo.get_all().map_err(AppError::from)?;
    if let Some(target) = phrases.into_iter().find(|p| p.id == id) {
        let _ = state.phrase_repo.increment_use(id);
        let _ = app_handle.emit("quick-phrases-changed", ());
        crate::services::clipboard_ops::paste_text_directly(app_handle, target.content).await?;
        Ok(())
    } else {
        Err(AppError::Validation("Quick phrase not found".to_string()))
    }
}

#[tauri::command(async)]
pub fn rename_phrase_tag(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    old_name: String,
    new_name: String,
) -> AppResult<()> {
    state
        .phrase_repo
        .rename_tag(&old_name, &new_name)
        .map_err(AppError::from)?;
    let _ = app_handle.emit("quick-phrases-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn delete_phrase_tag(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    tag_name: String,
) -> AppResult<()> {
    state
        .phrase_repo
        .delete_tag(&tag_name)
        .map_err(AppError::from)?;
    let _ = app_handle.emit("quick-phrases-changed", ());
    Ok(())
}

/// Pin state is kept separately from phrase content and survives restarts.
const PHRASE_PINS_KEY: &str = "app.quick_phrase_pinned_ids";

#[tauri::command]
pub fn get_phrase_pins(state: State<'_, DbState>) -> AppResult<Vec<i64>> {
    use crate::infrastructure::repository::settings_repo::SettingsRepository;
    let value = state
        .settings_repo
        .get(PHRASE_PINS_KEY)
        .map_err(AppError::from)?;
    Ok(value
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default())
}

#[tauri::command]
pub fn toggle_phrase_pin(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    id: i64,
) -> AppResult<Vec<i64>> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let pins = toggle_phrase_pin_in_db(&mut conn, id)?;
    drop(conn);
    let _ = app_handle.emit("quick-phrase-pins-changed", &pins);
    Ok(pins)
}

fn toggle_phrase_pin_in_db(conn: &mut rusqlite::Connection, id: i64) -> AppResult<Vec<i64>> {
    use rusqlite::{params, OptionalExtension};
    let tx = conn.transaction().map_err(AppError::from)?;
    let exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM quick_phrases WHERE id = ?1)",
            [id],
            |r| r.get(0),
        )
        .map_err(AppError::from)?;
    if !exists {
        return Err(AppError::Validation("Quick phrase not found".into()));
    }
    let raw: Option<String> = tx
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [PHRASE_PINS_KEY],
            |r| r.get(0),
        )
        .optional()
        .map_err(AppError::from)?;
    let mut pins: Vec<i64> = raw
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if pins.contains(&id) {
        pins.retain(|&n| n != id);
    } else {
        pins.insert(0, id);
    }
    let encoded = serde_json::to_string(&pins).map_err(|e| AppError::Internal(e.to_string()))?;
    tx.execute("INSERT INTO settings(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![PHRASE_PINS_KEY, encoded]).map_err(AppError::from)?;
    tx.commit().map_err(AppError::from)?;
    Ok(pins)
}

#[cfg(test)]
mod phrase_pin_tests {
    use super::*;
    #[test]
    fn pins_persist_reorder_and_unpin_without_changing_phrases() {
        let mut db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE quick_phrases(id INTEGER PRIMARY KEY, content TEXT); INSERT INTO quick_phrases VALUES (1, 'first'), (2, 'second');").unwrap();
        assert_eq!(toggle_phrase_pin_in_db(&mut db, 1).unwrap(), vec![1]);
        assert_eq!(toggle_phrase_pin_in_db(&mut db, 2).unwrap(), vec![2, 1]);
        assert_eq!(toggle_phrase_pin_in_db(&mut db, 1).unwrap(), vec![2]);
        assert!(toggle_phrase_pin_in_db(&mut db, 99).is_err());
        let stored: String = db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [PHRASE_PINS_KEY],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, "[2]");
        let content: String = db
            .query_row("SELECT content FROM quick_phrases WHERE id = 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(content, "first");
    }
}
