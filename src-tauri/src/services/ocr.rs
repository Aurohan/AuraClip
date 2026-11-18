//! Windows native offline OCR service powered by WinRT `Windows.Media.Ocr`.
//! Zero bundled model weights; runs asynchronously off the UI/capture hot path.

use crate::database::{has_sensitive_tag, DbState};
use crate::infrastructure::encryption;
use crate::infrastructure::repository::clipboard_repo::ClipboardRepository;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

pub const IMAGE_OCR_PREFIX: &str = "[OCR] ";
pub const IMAGE_EMPTY_OCR_MARKER: &str = "[No Text]";
pub const IMAGE_DEFAULT_PREVIEW_MARKER: &str = "[Image Content]";
pub const IMAGE_NO_TEXT_MARKER: &str = IMAGE_EMPTY_OCR_MARKER;
pub const IMAGE_PREVIEW_PLACEHOLDER: &str = IMAGE_DEFAULT_PREVIEW_MARKER;

pub fn extract_ocr_text_from_preview(preview: &str) -> Option<&str> {
    preview
        .trim()
        .strip_prefix(IMAGE_OCR_PREFIX)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

pub fn has_completed_ocr(preview: &str) -> bool {
    let trimmed = preview.trim();
    trimmed == IMAGE_EMPTY_OCR_MARKER || trimmed.starts_with(IMAGE_OCR_PREFIX)
}

pub fn is_placeholder_image_preview(preview: &str) -> bool {
    extract_ocr_text_from_preview(preview).is_none()
}

fn is_cjk(c: char) -> bool {
    ('\u{4E00}'..='\u{9FFF}').contains(&c)
        || ('\u{3400}'..='\u{4DBF}').contains(&c)
        || ('\u{3000}'..='\u{303F}').contains(&c)
        || ('\u{FF00}'..='\u{FFEF}').contains(&c)
}

/// Windows `zh-Hans-CN` OCR inserts spaces between every recognized Chinese
/// character; remove inter-CJK spaces while preserving spaces around ASCII words.
pub fn clean_ocr_line(line: &str) -> String {
    let chars: Vec<char> = line.trim().chars().collect();
    if chars.is_empty() {
        return String::new();
    }
    let mut out = String::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_whitespace() {
            let prev = out.chars().last();
            let mut next_idx = i + 1;
            while next_idx < chars.len() && chars[next_idx].is_whitespace() {
                next_idx += 1;
            }
            let next = chars.get(next_idx).copied();
            if let (Some(p), Some(n)) = (prev, next) {
                if !(is_cjk(p) && is_cjk(n)) {
                    out.push(' ');
                }
            }
            i = next_idx;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

#[cfg(target_os = "windows")]
pub fn recognize_image_file(path: &Path) -> Result<String, String> {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::{FileAccessMode, StorageFile};

    if !path.exists() {
        return Err("图片文件不存在".to_string());
    }

    let abs_path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    // Strip `\\?\` extended-length prefix because WinRT `StorageFile::GetFileFromPathAsync` rejects it.
    let raw_path = abs_path.to_string_lossy();
    let clean_path = raw_path.strip_prefix(r"\\?\").unwrap_or(&raw_path);

    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(clean_path))
        .map_err(|e| format!("打开图片失败: {e}"))?
        .get()
        .map_err(|e| format!("读取图片句柄失败: {e}"))?;

    let stream = file
        .OpenAsync(FileAccessMode::Read)
        .map_err(|e| format!("打开图片流失败: {e}"))?
        .get()
        .map_err(|e| format!("读取图片流失败: {e}"))?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| format!("解码图片失败: {e}"))?
        .get()
        .map_err(|e| format!("初始化解码器失败: {e}"))?;

    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| format!("读取位图失败: {e}"))?
        .get()
        .map_err(|e| format!("解码位图失败: {e}"))?;

    let max_dim = OcrEngine::MaxImageDimension().unwrap_or(4096) as i32;
    let w = bitmap.PixelWidth().unwrap_or(0);
    let h = bitmap.PixelHeight().unwrap_or(0);
    if w <= 0 || h <= 0 || w > max_dim || h > max_dim {
        return Ok(String::new());
    }

    let ocr_bitmap = match bitmap.BitmapPixelFormat() {
        Ok(BitmapPixelFormat::Bgra8) | Ok(BitmapPixelFormat::Gray8) => bitmap,
        _ => SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Bgra8)
            .map_err(|e| format!("转换位图格式失败: {e}"))?,
    };

    let engine = Language::CreateLanguage(&HSTRING::from("zh-Hans-CN"))
        .ok()
        .and_then(|lang| OcrEngine::TryCreateFromLanguage(&lang).ok())
        .or_else(|| OcrEngine::TryCreateFromUserProfileLanguages().ok())
        .or_else(|| {
            Language::CreateLanguage(&HSTRING::from("en-US"))
                .ok()
                .and_then(|lang| OcrEngine::TryCreateFromLanguage(&lang).ok())
        })
        .ok_or_else(|| "系统未安装可用的 Windows OCR 语言包".to_string())?;

    let ocr_result = engine
        .RecognizeAsync(&ocr_bitmap)
        .map_err(|e| format!("OCR 识别调用失败: {e}"))?
        .get()
        .map_err(|e| format!("OCR 识别执行失败: {e}"))?;

    let lines = ocr_result
        .Lines()
        .map_err(|e| format!("读取识别行失败: {e}"))?;

    let mut collected = Vec::new();
    for i in 0..lines.Size().unwrap_or(0) {
        if let Ok(line) = lines.GetAt(i) {
            if let Ok(raw) = line.Text() {
                let cleaned = clean_ocr_line(&raw.to_string_lossy());
                if !cleaned.is_empty() {
                    collected.push(cleaned);
                }
            }
        }
    }

    Ok(collected.join("\n"))
}

#[cfg(not(target_os = "windows"))]
pub fn recognize_image_file(_path: &Path) -> Result<String, String> {
    Ok(String::new())
}

fn resolve_entry_image_path(app_handle: &AppHandle, content: &str) -> Option<PathBuf> {
    let resolved = crate::services::clipboard_ops::with_current_entry_file(
        app_handle,
        "image",
        content.to_string(),
    );
    if resolved.is_empty() || resolved.starts_with("data:") {
        return None;
    }
    let p = PathBuf::from(&resolved);
    p.is_file().then_some(p)
}

/// Runs OCR for one stored image entry, updates `preview` in SQLite (or session),
/// and returns the recognized plain text (`""` when the image contains no text).
pub fn index_image_entry_sync(app_handle: &AppHandle, id: i64, force: bool) -> Result<String, String> {
    if id < 0 {
        let session = app_handle
            .try_state::<crate::app_state::SessionHistory>()
            .ok_or_else(|| "会话存储未就绪".to_string())?;
        let item_snapshot = {
            let items = session.0.lock().unwrap();
            items
                .iter()
                .find(|i| i.id == id)
                .cloned()
                .ok_or_else(|| "未找到该图片记录".to_string())?
        };
        if item_snapshot.content_type != "image" {
            return Err("该记录不是图片类型".to_string());
        }
        if !force {
            if let Some(existing) = extract_ocr_text_from_preview(&item_snapshot.preview) {
                return Ok(existing.to_string());
            }
            if item_snapshot.preview.trim() == IMAGE_EMPTY_OCR_MARKER {
                return Ok(String::new());
            }
        }
        let Some(path) = resolve_entry_image_path(app_handle, &item_snapshot.content) else {
            return Ok(String::new());
        };
        let recognized = recognize_image_file(&path)?;
        let trimmed = recognized.trim().to_string();
        let stored = if trimmed.is_empty() {
            IMAGE_EMPTY_OCR_MARKER.to_string()
        } else {
            format!("{IMAGE_OCR_PREFIX}{trimmed}")
        };
        let mut updated_opt = None;
        {
            let mut items = session.0.lock().unwrap();
            if let Some(item) = items.iter_mut().find(|i| i.id == id) {
                item.preview = stored;
                updated_opt = Some(item.clone());
            }
        }
        if let (false, Some(updated)) = (trimmed.is_empty(), updated_opt) {
            let _ = app_handle.emit("clipboard-updated", updated);
        }
        return Ok(trimmed);
    }

    let db = app_handle
        .try_state::<DbState>()
        .ok_or_else(|| "数据库未就绪".to_string())?;

    let entry = db
        .repo
        .get_entry_by_id(id)?
        .ok_or_else(|| "未找到该图片记录".to_string())?;

    if entry.content_type != "image" {
        return Err("该记录不是图片类型".to_string());
    }

    if !force {
        if let Some(existing) = extract_ocr_text_from_preview(&entry.preview) {
            return Ok(existing.to_string());
        }
        if entry.preview.trim() == IMAGE_EMPTY_OCR_MARKER {
            return Ok(String::new());
        }
    }

    let Some(path) = resolve_entry_image_path(app_handle, &entry.content) else {
        return Ok(String::new());
    };

    let recognized = recognize_image_file(&path)?;
    let trimmed = recognized.trim().to_string();
    let tagged_preview = format!("{IMAGE_OCR_PREFIX}{trimmed}");

    let to_store = if trimmed.is_empty() {
        IMAGE_EMPTY_OCR_MARKER.to_string()
    } else if has_sensitive_tag(&entry.tags) {
        encryption::encrypt_for_storage(&tagged_preview).unwrap_or_else(|_| tagged_preview.clone())
    } else {
        tagged_preview
    };

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute(
            "UPDATE clipboard_history SET preview = ?1 WHERE id = ?2",
            rusqlite::params![to_store, id],
        );
    }

    if !trimmed.is_empty() {
        if let Ok(Some(mut updated)) = db.repo.get_entry_by_id(id) {
            if updated.preview == IMAGE_EMPTY_OCR_MARKER {
                updated.preview.clear();
            }
            let _ = app_handle.emit("clipboard-updated", updated);
        }
    }

    Ok(trimmed)
}

/// Asynchronous fire-and-forget OCR right after a new screenshot/image is saved.
pub fn spawn_ocr_for_entry(app_handle: AppHandle, id: i64) {
    if id <= 0 {
        return;
    }
    std::thread::spawn(move || {
        let _ = index_image_entry_sync(&app_handle, id, false);
    });
}

/// Quietly indexes existing screenshots after startup without touching cold-start latency.
pub fn start_ocr_backfill(app_handle: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(6));
        let candidate_ids: Vec<i64> = {
            let Some(db) = app_handle.try_state::<DbState>() else { return };
            let Ok(conn) = db.conn.lock() else { return };
            let Ok(mut stmt) = conn.prepare(
                "SELECT id FROM clipboard_history
                 WHERE content_type = 'image'
                   AND (preview = '' OR preview = '[Image Content]')
                 ORDER BY sort_at DESC
                 LIMIT 80",
            ) else {
                return;
            };
            let rows = stmt
                .query_map([], |r| r.get::<_, i64>(0))
                .ok()
                .map(|iter| iter.flatten().collect::<Vec<_>>())
                .unwrap_or_default();
            rows
        };

        for id in candidate_ids {
            let _ = index_image_entry_sync(&app_handle, id, false);
            std::thread::sleep(std::time::Duration::from_millis(240));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_inter_cjk_spaces_while_keeping_english_spaces() {
        assert_eq!(
            clean_ocr_line("极 光 剪 贴 板 AuraClip error code 404 测 试"),
            "极光剪贴板 AuraClip error code 404 测试"
        );
        assert!(is_placeholder_image_preview("[Image Content]"));
        assert!(is_placeholder_image_preview("[No Text]"));
        assert!(is_placeholder_image_preview("legacy_filename.png"));
        assert!(!is_placeholder_image_preview("[OCR] 连接超时 502"));
        assert_eq!(extract_ocr_text_from_preview("[OCR] 连接超时 502"), Some("连接超时 502"));
    }
}
