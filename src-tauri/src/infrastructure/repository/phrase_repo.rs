use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPhrase {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub is_sensitive: bool,
    pub sort_order: i64,
    pub use_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub last_used_at: Option<i64>,
}

#[derive(Clone)]
pub struct SqlitePhraseRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqlitePhraseRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    pub fn get_all(&self) -> Result<Vec<QuickPhrase>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content, tags, is_sensitive, sort_order, use_count, created_at, updated_at, last_used_at
                 FROM quick_phrases
                 ORDER BY sort_order ASC, updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(3)?;
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
                let is_sensitive_int: i64 = row.get(4)?;

                Ok(QuickPhrase {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    tags,
                    is_sensitive: is_sensitive_int != 0,
                    sort_order: row.get(5)?,
                    use_count: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    last_used_at: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            if let Ok(item) = r {
                list.push(item);
            }
        }
        Ok(list)
    }

    pub fn save(&self, phrase: &QuickPhrase) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().timestamp_millis();
        let tags_json = serde_json::to_string(&phrase.tags).unwrap_or_else(|_| "[]".to_string());
        let is_sensitive_val = if phrase.is_sensitive { 1 } else { 0 };

        if phrase.id > 0 {
            conn.execute(
                "UPDATE quick_phrases
                 SET title = ?1, content = ?2, tags = ?3, is_sensitive = ?4, sort_order = ?5, updated_at = ?6
                 WHERE id = ?7",
                params![
                    phrase.title,
                    phrase.content,
                    tags_json,
                    is_sensitive_val,
                    phrase.sort_order,
                    now,
                    phrase.id
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(phrase.id)
        } else {
            let created = if phrase.created_at > 0 {
                phrase.created_at
            } else {
                now
            };
            conn.execute(
                "INSERT INTO quick_phrases (title, content, tags, is_sensitive, sort_order, use_count, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    phrase.title,
                    phrase.content,
                    tags_json,
                    is_sensitive_val,
                    phrase.sort_order,
                    phrase.use_count,
                    created,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }

    pub fn delete(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM quick_phrases WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn increment_use(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE quick_phrases SET use_count = use_count + 1, updated_at = ?1, last_used_at = ?1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn reorder(&self, ids: Vec<i64>) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (idx, id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE quick_phrases SET sort_order = ?1 WHERE id = ?2",
                params![idx as i64, id],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn rename_tag(&self, old_name: &str, new_name: &str) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare("SELECT id, tags FROM quick_phrases")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;

            let mut updates = Vec::new();
            for r in rows {
                if let Ok((id, tags_json)) = r {
                    let mut tags: Vec<String> =
                        serde_json::from_str(&tags_json).unwrap_or_default();
                    if tags.iter().any(|t| t == old_name) {
                        for t in tags.iter_mut() {
                            if *t == old_name {
                                *t = new_name.to_string();
                            }
                        }
                        tags.dedup();
                        let new_json =
                            serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
                        updates.push((id, new_json));
                    }
                }
            }
            for (id, new_json) in updates {
                tx.execute(
                    "UPDATE quick_phrases SET tags = ?1, updated_at = ?2 WHERE id = ?3",
                    params![new_json, chrono::Utc::now().timestamp_millis(), id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_tag(&self, tag_name: &str) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx
                .prepare("SELECT id, tags FROM quick_phrases")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;

            let mut updates = Vec::new();
            for r in rows {
                if let Ok((id, tags_json)) = r {
                    let mut tags: Vec<String> =
                        serde_json::from_str(&tags_json).unwrap_or_default();
                    if tags.iter().any(|t| t == tag_name) {
                        tags.retain(|t| t != tag_name);
                        let new_json =
                            serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
                        updates.push((id, new_json));
                    }
                }
            }
            for (id, new_json) in updates {
                tx.execute(
                    "UPDATE quick_phrases SET tags = ?1, updated_at = ?2 WHERE id = ?3",
                    params![new_json, chrono::Utc::now().timestamp_millis(), id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod phrase_sort_migration_tests {
    use super::*;
    #[test]
    fn existing_phrases_survive_and_future_use_records_last_used() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES(21); CREATE TABLE clipboard_history(id INTEGER PRIMARY KEY, note TEXT NOT NULL DEFAULT ''); CREATE TABLE quick_phrases(id INTEGER PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL, is_sensitive INTEGER NOT NULL, sort_order INTEGER NOT NULL, use_count INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO quick_phrases VALUES (1, 'kept', 'content', '[]', 0, 0, 7, 100, 200);").unwrap();
        crate::infrastructure::repository::migrations::run_migrations(&conn).unwrap();
        let repo = SqlitePhraseRepository::new(Arc::new(Mutex::new(conn)));
        let before = repo.get_all().unwrap();
        assert_eq!(before[0].last_used_at, None);
        assert_eq!(before[0].content, "content");
        assert_eq!(before[0].use_count, 7);
        repo.increment_use(1).unwrap();
        let after = repo.get_all().unwrap();
        assert!(after[0].last_used_at.is_some());
        assert_eq!(after[0].use_count, 8);
    }
}
