//! Dynamic placeholder expansion for Quick Phrases:
//! `{{clipboard}}`, `{{date}}`, `{{time}}`, `{{datetime}}`, `{{date:YYYY/MM/DD}}`, `{{uuid}}`.

use chrono::{DateTime, Local};

pub fn has_template_tokens(text: &str) -> bool {
    text.contains("{{") && text.contains("}}")
}

fn format_custom_date(pattern: &str, now: DateTime<Local>) -> String {
    let chrono_fmt = pattern
        .replace("YYYY", "%Y")
        .replace("YY", "%y")
        .replace("MM", "%m")
        .replace("DD", "%d")
        .replace("HH", "%H")
        .replace("mm", "%M")
        .replace("ss", "%S");
    now.format(&chrono_fmt).to_string()
}

pub fn expand_phrase_template(template: &str, clipboard_text: &str, now: DateTime<Local>) -> String {
    if !has_template_tokens(template) {
        return template.to_string();
    }

    let mut out = String::with_capacity(template.len() + 32);
    let mut rest = template;

    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after_open = &rest[start + 2..];
        let Some(end) = after_open.find("}}") else {
            out.push_str(&rest[start..]);
            return out;
        };
        let raw_token = after_open[..end].trim();
        let lower = raw_token.to_ascii_lowercase();

        let replacement = match lower.as_str() {
            "clipboard" | "clip" => Some(clipboard_text.to_string()),
            "date" => Some(now.format("%Y-%m-%d").to_string()),
            "time" => Some(now.format("%H:%M:%S").to_string()),
            "datetime" | "now" => Some(now.format("%Y-%m-%d %H:%M").to_string()),
            "uuid" => Some(uuid::Uuid::new_v4().to_string()),
            _ if lower.starts_with("date:") => {
                let fmt_part = raw_token[5..].trim();
                Some(format_custom_date(fmt_part, now))
            }
            _ => None,
        };

        if let Some(val) = replacement {
            out.push_str(&val);
        } else {
            out.push_str("{{");
            out.push_str(&after_open[..end]);
            out.push_str("}}");
        }

        rest = &after_open[end + 2..];
    }

    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn expands_clipboard_date_and_preserves_unknown_placeholders() {
        let fixed = Local.with_ymd_and_hms(2026, 11, 18, 17, 45, 9).unwrap();
        let tpl = "排查日期 {{date}} ({{date:YYYY/MM/DD HH:mm}})\n报错：\n{{clipboard}}\n保留：{{unknown_var}}";
        let res = expand_phrase_template(tpl, "panic at line 42", fixed);
        assert!(res.contains("2026-11-18 (2026/11/18 17:45)"));
        assert!(res.contains("panic at line 42"));
        assert!(res.contains("{{unknown_var}}"));
    }
}
