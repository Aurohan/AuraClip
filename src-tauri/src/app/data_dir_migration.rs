//! Moves the data folders left under an earlier app identifier to the current
//! one. Tauri names `%APPDATA%\<identifier>` (database, attachments, key, log)
//! and `%LOCALAPPDATA%\<identifier>` (WebView2 profile, thumbnails) after the
//! identifier, so changing it would otherwise start with an empty history.
//!
//! Runs in `main` before Tauri starts: the main window is declared in the
//! config, so WebView2 opens its profile folder before `setup` runs.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// (old identifier, identifier that replaced it).
const RENAMES: [(&str, &str); 2] = [
    ("com.auradesk.auraclip", "com.auraclip.clipboard"),
    ("com.auradesk.auraclip.dev", "com.auraclip.clipboard.dev"),
];

/// Written before the logger exists; `log_report` prints it once it does.
static REPORT: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn note(line: String) {
    eprintln!(">>> [DATA-MIGRATION] {line}");
    if let Ok(mut report) = REPORT.lock() {
        report.push(line);
    }
}

pub fn log_report() {
    if let Ok(mut report) = REPORT.lock() {
        for line in report.drain(..) {
            crate::logger::log(&format!(">>> [DATA-MIGRATION] {line}"));
        }
    }
}

fn legacy_identifier(identifier: &str) -> Option<&'static str> {
    RENAMES.iter().find(|(_, new)| *new == identifier).map(|(old, _)| *old)
}

pub fn migrate(identifier: &str) {
    let Some(old) = legacy_identifier(identifier) else {
        return;
    };
    if let Some(roaming) = std::env::var_os("APPDATA").map(PathBuf::from) {
        migrate_roaming(&roaming.join(old), &roaming.join(identifier));
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        migrate_local(&local.join(old), &local.join(identifier));
    }
}

/// The database folder. Moved as a whole so `clipboard.db` never gets split
/// from its `-wal`; a new folder without a database (left by a start that
/// could not move the old one) is put aside first, never deleted.
fn migrate_roaming(old: &Path, new: &Path) {
    if !old.join("clipboard.db").is_file() || new.join("clipboard.db").exists() {
        return;
    }
    if new.exists() {
        let aside = new.with_file_name(format!(
            "{}.before-migration-{}",
            new.file_name().unwrap_or_default().to_string_lossy(),
            chrono::Local::now().format("%Y%m%d-%H%M%S")
        ));
        if let Err(error) = std::fs::rename(new, &aside) {
            note(format!("could not put {} aside: {error}", new.display()));
            return;
        }
        note(format!("put the database-less {} aside as {}", new.display(), aside.display()));
    }
    match std::fs::rename(old, new) {
        Ok(()) => {
            note(format!("moved {} to {}", old.display(), new.display()));
            match rewrite_stored_paths(&new.join("clipboard.db"), old, new) {
                Ok(rows) => note(format!("updated {rows} stored attachment paths")),
                Err(error) => note(format!("updating stored paths failed: {error}")),
            }
        }
        Err(error) => note(format!(
            "could not move {} (still in use?): {error}; using it in place",
            old.display()
        )),
    }
}

/// WebView2 profile and thumbnail cache: losing them only costs cached UI
/// state, so an existing new folder is left as it is.
fn migrate_local(old: &Path, new: &Path) {
    if !old.is_dir() || new.exists() {
        return;
    }
    match std::fs::rename(old, new) {
        Ok(()) => note(format!("moved {} to {}", old.display(), new.display())),
        Err(error) => note(format!("could not move {}: {error}", old.display())),
    }
}

/// Image and file entries store absolute paths into `attachments`. Old paths
/// would still resolve (`resolve_entry_file_path`), but the history list loads
/// images straight from the stored path. Text entries are what the user
/// copied and stay untouched.
fn rewrite_stored_paths(db: &Path, old: &Path, new: &Path) -> rusqlite::Result<usize> {
    let conn = rusqlite::Connection::open(db)?;
    let mut rows = 0;
    for (from, to) in [
        (old.to_string_lossy().into_owned(), new.to_string_lossy().into_owned()),
        (
            old.to_string_lossy().replace('\\', "/"),
            new.to_string_lossy().replace('\\', "/"),
        ),
    ] {
        rows += conn.execute(
            "UPDATE clipboard_history
                SET content = replace(content, ?1, ?2),
                    preview = replace(preview, ?1, ?2),
                    html_content = replace(html_content, ?1, ?2)
              WHERE content_type IN ('image', 'file')
                AND (instr(content, ?1) > 0 OR instr(preview, ?1) > 0
                     OR instr(coalesce(html_content, ''), ?1) > 0)",
            [&from, &to],
        )?;
    }
    Ok(rows)
}

/// Where the data still is when `migrate` could not move it: the old folder,
/// as long as the current one has no database of its own.
pub fn unmigrated_data_dir(default_dir: &Path) -> Option<PathBuf> {
    if default_dir.join("clipboard.db").exists() {
        return None;
    }
    let identifier = default_dir.file_name()?.to_str()?;
    let old = default_dir.with_file_name(legacy_identifier(identifier)?);
    old.join("clipboard.db").is_file().then_some(old)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("auraclip-migrate-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn seed_db(dir: &Path) {
        std::fs::create_dir_all(dir.join("attachments")).unwrap();
        let conn = rusqlite::Connection::open(dir.join("clipboard.db")).unwrap();
        conn.execute_batch(
            "CREATE TABLE clipboard_history (id INTEGER PRIMARY KEY, content_type TEXT,
                 content TEXT, preview TEXT, html_content TEXT);",
        )
        .unwrap();
        let img = dir.join("attachments").join("img_1.png");
        let img = img.to_string_lossy();
        let img_slash = img.replace('\\', "/");
        conn.execute(
            "INSERT INTO clipboard_history VALUES (1, 'image', ?1, ?2, NULL), (2, 'text', ?1, ?1, NULL)",
            [img.as_ref(), img_slash.as_str()],
        )
        .unwrap();
    }

    #[test]
    fn the_old_folder_moves_and_image_paths_follow() {
        let root = temp_root();
        let (old, new) = (root.join("com.auradesk.auraclip"), root.join("com.auraclip.clipboard"));
        seed_db(&old);

        migrate_roaming(&old, &new);

        assert!(!old.exists());
        let conn = rusqlite::Connection::open(new.join("clipboard.db")).unwrap();
        let (content, preview): (String, String) = conn
            .query_row("SELECT content, preview FROM clipboard_history WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(content, new.join("attachments").join("img_1.png").to_string_lossy());
        assert!(preview.contains("com.auraclip.clipboard/attachments"), "{preview}");
        // Copied text keeps what the user copied.
        let text: String = conn
            .query_row("SELECT content FROM clipboard_history WHERE id = 2", [], |r| r.get(0))
            .unwrap();
        assert!(text.contains("com.auradesk.auraclip"));
        drop(conn);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_new_folder_without_a_database_is_put_aside_not_deleted() {
        let root = temp_root();
        let (old, new) = (root.join("com.auradesk.auraclip"), root.join("com.auraclip.clipboard"));
        seed_db(&old);
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(new.join("auraclip.log"), b"log").unwrap();

        migrate_roaming(&old, &new);

        assert!(new.join("clipboard.db").is_file());
        let aside: Vec<_> = std::fs::read_dir(&root)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("before-migration"))
            .collect();
        assert_eq!(aside.len(), 1);
        assert!(aside[0].path().join("auraclip.log").is_file());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn an_existing_database_is_never_replaced() {
        let root = temp_root();
        let (old, new) = (root.join("com.auradesk.auraclip"), root.join("com.auraclip.clipboard"));
        seed_db(&old);
        seed_db(&new);

        migrate_roaming(&old, &new);

        assert!(old.join("clipboard.db").is_file());
        assert_eq!(unmigrated_data_dir(&new), None);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn unmoved_data_is_used_where_it_is() {
        let root = temp_root();
        let (old, new) = (root.join("com.auradesk.auraclip"), root.join("com.auraclip.clipboard"));
        seed_db(&old);
        std::fs::create_dir_all(&new).unwrap();

        assert_eq!(unmigrated_data_dir(&new), Some(old));
        assert_eq!(unmigrated_data_dir(&root.join("something.else")), None);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
