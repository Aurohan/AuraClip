export interface InteractiveSlot {
  name: string;
  defaultValue: string;
}

export type PhraseSemanticKind =
  | "interactive"
  | "template"
  | "secret"
  | "code"
  | "link"
  | "contact"
  | "text";

export interface PhraseTokenPart {
  type: "text" | "builtin" | "slot";
  raw: string;
  label?: string;
}

const TOKEN_SPLIT_RE = /(\{\{[^{}\r\n]+\}\})/g;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatCustomDate(fmt: string, d: Date): string {
  return fmt
    .replace(/YYYY|%Y/g, String(d.getFullYear()))
    .replace(/MM|%m/g, pad2(d.getMonth() + 1))
    .replace(/DD|%d/g, pad2(d.getDate()))
    .replace(/HH|%H/g, pad2(d.getHours()))
    .replace(/mm|%M/g, pad2(d.getMinutes()))
    .replace(/ss|%S/g, pad2(d.getSeconds()));
}

/**
 * Extracts unique interactive slots from `{{?参数名}}`, `{{?参数名=默认值}}`, or `{{input:参数名=默认值}}`.
 */
export function extractInteractiveSlots(template: string): InteractiveSlot[] {
  if (!template.includes("{{")) return [];
  const slots: InteractiveSlot[] = [];
  const seen = new Set<string>();
  const re = /\{\{\s*(?:\?|input:)([^}=]+?)(?:=([^}]*))?\s*\}\}/gi;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    const name = m[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    slots.push({
      name,
      defaultValue: (m[2] ?? "").trim(),
    });
  }
  return slots;
}

export function hasAnyPhraseTokens(template: string): boolean {
  if (!template.includes("{{")) return false;
  return (
    /\{\{\s*(?:clipboard|clip|date(?::[^}]+)?|time|datetime|uuid)\s*\}\}/i.test(template) ||
    extractInteractiveSlots(template).length > 0
  );
}

/**
 * Expands both built-in tokens (`{{clipboard}}`, `{{date}}`, `{{time}}`, `{{datetime}}`, `{{uuid}}`)
 * and interactive slots (`{{?name}}` / `{{?name=default}}`) on the client for live preview or slot fill.
 */
export function expandPhraseTemplateClient(
  template: string,
  options?: {
    clipboardText?: string;
    slotValues?: Record<string, string>;
    now?: Date;
    stablePreviewUuid?: boolean;
  }
): string {
  if (!template.includes("{{")) return template;
  const now = options?.now ?? new Date();
  const clip = options?.clipboardText ?? "";
  const slotValues = options?.slotValues ?? {};

  return template.replace(/\{\{([^{}\r\n]+)\}\}/g, (full, innerRaw: string) => {
    const inner = innerRaw.trim();
    if (inner.startsWith("?") || /^input:/i.test(inner)) {
      const body = inner.startsWith("?") ? inner.slice(1) : inner.slice(6);
      const eqIdx = body.indexOf("=");
      const name = (eqIdx >= 0 ? body.slice(0, eqIdx) : body).trim();
      const defVal = eqIdx >= 0 ? body.slice(eqIdx + 1).trim() : "";
      if (!name) return full;
      const provided = slotValues[name];
      if (provided !== undefined && provided !== "") return provided;
      if (defVal) return defVal;
      return `[${name}]`;
    }

    const lower = inner.toLowerCase();
    if (lower === "clipboard" || lower === "clip") {
      return clip;
    }
    if (lower === "date") {
      return formatCustomDate("YYYY-MM-DD", now);
    }
    if (lower === "time") {
      return formatCustomDate("HH:mm:ss", now);
    }
    if (lower === "datetime") {
      return formatCustomDate("YYYY-MM-DD HH:mm:ss", now);
    }
    if (lower === "uuid") {
      if (options?.stablePreviewUuid) return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
      return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-4000-8000-000000000000`;
    }
    if (lower.startsWith("date:")) {
      const fmt = inner.slice(5).trim();
      return fmt ? formatCustomDate(fmt, now) : formatCustomDate("YYYY-MM-DD", now);
    }
    return full;
  });
}

export function tokenizePhrasePreview(content: string): PhraseTokenPart[] {
  if (!content.includes("{{")) {
    return [{ type: "text", raw: content }];
  }
  const parts = content.split(TOKEN_SPLIT_RE).filter(Boolean);
  return parts.map((segment): PhraseTokenPart => {
    if (!segment.startsWith("{{") || !segment.endsWith("}}")) {
      return { type: "text", raw: segment };
    }
    const inner = segment.slice(2, -2).trim();
    if (inner.startsWith("?") || /^input:/i.test(inner)) {
      const body = inner.startsWith("?") ? inner.slice(1) : inner.slice(6);
      const name = body.split("=")[0]?.trim() || inner;
      return { type: "slot", raw: segment, label: `? ${name}` };
    }
    if (/^(?:clipboard|clip|date(?::.+)?|time|datetime|uuid)$/i.test(inner)) {
      return { type: "builtin", raw: segment, label: inner };
    }
    return { type: "text", raw: segment };
  });
}

export function detectPhraseKind(content: string, isSensitive?: boolean): PhraseSemanticKind {
  if (isSensitive) return "secret";
  if (extractInteractiveSlots(content).length > 0) return "interactive";
  if (hasAnyPhraseTokens(content)) return "template";
  const s = content.trim();
  if (/^https?:\/\/\S+$/i.test(s) || /^www\.\S+$/i.test(s)) return "link";
  if (
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(s) ||
    /^(?:\+?86[-\s]?)?1[3-9]\d{9}$/.test(s)
  ) {
    return "contact";
  }
  if (
    (s.startsWith("{") && s.endsWith("}")) ||
    /^\s*(git|docker|kubectl|pnpm|npm|cargo|ssh|curl|powershell|SELECT|INSERT|UPDATE|const\s+|function\s+|def\s+)\b/im.test(s)
  ) {
    return "code";
  }
  return "text";
}

export function derivePhraseTitleFromContent(content: string, fallback = "常用短语"): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return fallback;
  const cleaned = firstLine.replace(/\{\{\s*\??([^}=]+)(?:=[^}]*)?\s*\}\}/g, "$1").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 24 ? `${cleaned.slice(0, 24)}…` : cleaned;
}
