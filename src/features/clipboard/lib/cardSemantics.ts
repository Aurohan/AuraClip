import type { ClipboardEntry } from "../../../shared/types";
import { extractImageOcrText } from "../../../shared/lib/searchMatch";

export function extractOtpDigits(text: string): string | null {
  const m =
    text.match(/(?:验证码|校验码|动态码|code|otp|pin)[^\d]{0,12}(\d{4,8})\b/i) ||
    text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

export function extractUrlDomain(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(normalized);
    return u.hostname.replace(/^www\./i, "") || null;
  } catch {
    const m = trimmed.match(/^(?:[a-z+.-]+:\/\/)?([^/\s:?#]+)/i);
    return m ? m[1].replace(/^www\./i, "") : null;
  }
}

export function detectCodeBadge(raw: string): string {
  const s = raw.trim();
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    return "JSON";
  }
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(s)) {
    return "SQL";
  }
  if (/^\s*(<!DOCTYPE|<html|<div|<svg|<section)\b/i.test(s)) {
    return "HTML";
  }
  if (/^\s*(git|docker|kubectl|pnpm|npm|cargo|curl|powershell|explorer\.exe)\b/m.test(s)) {
    return "SHELL";
  }
  if (/\b(pub\s+fn|impl\s+|let\s+mut)\b/.test(s)) {
    return "RUST";
  }
  if (/^\s*(def\s+\w+|from\s+\w+\s+import)\b/m.test(s)) {
    return "PY";
  }
  if (/\b(const|function|interface|export\s+default)\b/.test(s)) {
    return "TS/JS";
  }
  return "CODE";
}

export function canTransformClipboardEntry(
  item: Pick<ClipboardEntry, "content_type" | "preview">,
  isSensitiveHidden = false
): boolean {
  if (isSensitiveHidden) return false;
  return (
    item.content_type === "text" ||
    item.content_type === "code" ||
    item.content_type === "url" ||
    item.content_type === "rich_text" ||
    (item.content_type === "image" && Boolean(extractImageOcrText(item)))
  );
}
