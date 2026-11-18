export interface TextTransformItem {
  id: string;
  labelKey: string;
  keywords: string;
  result: string;
  priority: number;
}

function toUtf8Base64(str: string): string | null {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

function fromUtf8Base64(str: string): string | null {
  const cleaned = str.trim();
  if (cleaned.length < 4 || !/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) return null;
  try {
    const normalized = cleaned.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded && decoded !== str ? decoded : null;
  } catch {
    return null;
  }
}

function splitIdentifierWords(input: string): string[] {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-./\\]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export function computeTextTransforms(source: string): TextTransformItem[] {
  const raw = source ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const items: TextTransformItem[] = [];
  const push = (
    id: string,
    labelKey: string,
    keywords: string,
    result: string | null | undefined,
    priority = 50
  ) => {
    if (!result || !result.trim() || result === raw) return;
    items.push({ id, labelKey, keywords, result, priority });
  };

  // 1. Path slash conversions
  const looksLikePath = /[\\/]/.test(trimmed) && !/^https?:\/\//i.test(trimmed);
  if (raw.includes("\\")) {
    const collapsed = raw.replace(/\\\\+/g, "\\");
    push(
      "path_posix",
      "transform_path_posix",
      "posix forward slash linux url 斜杠 路径 /",
      collapsed.replace(/\\/g, "/"),
      looksLikePath ? 95 : 55
    );
    if (!raw.includes("\\\\")) {
      push(
        "path_escaped",
        "transform_path_escaped",
        "escaped double backslash json 转义 双反斜杠 \\\\",
        raw.replace(/\\/g, "\\\\"),
        looksLikePath ? 88 : 50
      );
    } else {
      push(
        "path_win",
        "transform_path_windows",
        "windows single backslash 反斜杠 路径 \\",
        collapsed,
        looksLikePath ? 94 : 54
      );
    }
  } else if (raw.includes("/") && looksLikePath) {
    push(
      "path_win",
      "transform_path_windows",
      "windows backslash 反斜杠 路径 \\",
      raw.replace(/\//g, "\\"),
      92
    );
  }

  // 2. JSON format / minify
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      push(
        "json_pretty",
        "transform_json_pretty",
        "json format pretty indent 格式化 美化",
        JSON.stringify(parsed, null, 2),
        98
      );
      push(
        "json_minify",
        "transform_json_minify",
        "json minify compact 压缩 单行",
        JSON.stringify(parsed),
        96
      );
    } catch {
      // Not valid JSON
    }
  }

  // 3. Multi-line cleanups
  const lines = raw.split(/\r?\n/);
  if (lines.length > 1) {
    push(
      "join_space",
      "transform_join_lines",
      "join single line merge 合并单行 去换行",
      lines.map((l) => l.trim()).filter(Boolean).join(" "),
      86
    );
    const nonEmpty = lines.filter((l) => l.trim().length > 0).join("\n");
    push(
      "strip_empty",
      "transform_strip_empty_lines",
      "remove blank empty lines 去除空行",
      nonEmpty,
      84
    );
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of lines) {
      const cleaned = line.trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      deduped.push(cleaned);
    }
    if (deduped.length < lines.filter((l) => l.trim()).length) {
      push(
        "dedupe_lines",
        "transform_dedupe_lines",
        "dedupe unique lines 行去重",
        deduped.join("\n"),
        85
      );
    }
  }

  // 4. Smart extractions (verification codes / numbers, URLs)
  const urlMatches = raw.match(/https?:\/\/[^\s"'<>)\]]+/gi);
  if (urlMatches && urlMatches.length > 0) {
    const joinedUrls = Array.from(new Set(urlMatches)).join("\n");
    if (joinedUrls !== trimmed) {
      push(
        "extract_urls",
        "transform_extract_urls",
        "extract url link 提取链接 网址",
        joinedUrls,
        91
      );
    }
  }

  const numberMatches = raw.match(/\d+(?:\.\d+)?/g);
  if (numberMatches && numberMatches.length > 0) {
    const codeCandidate =
      numberMatches.find((n) => n.length >= 4 && n.length <= 8 && !n.includes(".")) ??
      numberMatches.join(" ");
    if (codeCandidate !== trimmed) {
      push(
        "extract_numbers",
        "transform_extract_numbers",
        "extract digits numbers code 提取数字 验证码",
        codeCandidate,
        90
      );
    }
  }

  // 5. URL & Base64 encode/decode
  if (/%[0-9A-Fa-f]{2}/.test(trimmed)) {
    try {
      const decoded = decodeURIComponent(trimmed);
      push("url_decode", "transform_url_decode", "url decode 解码", decoded, 89);
    } catch {
      // Ignore malformed URI component
    }
  }
  if (trimmed.length <= 4096) {
    try {
      const encoded = encodeURIComponent(trimmed);
      if (encoded !== trimmed) {
        push("url_encode", "transform_url_encode", "url encode 编码", encoded, 44);
      }
    } catch {
      // Ignore
    }
    const decodedB64 = fromUtf8Base64(trimmed);
    if (decodedB64) {
      push("b64_decode", "transform_base64_decode", "base64 decode 解码", decodedB64, 87);
    }
    const encodedB64 = toUtf8Base64(trimmed);
    if (encodedB64) {
      push("b64_encode", "transform_base64_encode", "base64 encode 编码", encodedB64, 42);
    }
  }

  // 6. Case & identifier conventions
  if (/[a-zA-Z]/.test(trimmed)) {
    push("upper", "transform_uppercase", "uppercase 大写", raw.toUpperCase(), 60);
    push("lower", "transform_lowercase", "lowercase 小写", raw.toLowerCase(), 59);

    if (lines.length === 1 && trimmed.length <= 160) {
      const words = splitIdentifierWords(trimmed);
      if (words.length >= 2 && words.every((w) => /^[A-Za-z0-9]+$/.test(w))) {
        const snake = words.map((w) => w.toLowerCase()).join("_");
        const camel = words
          .map((w, idx) =>
            idx === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()
          )
          .join("");
        const kebab = words.map((w) => w.toLowerCase()).join("-");
        push("snake_case", "transform_snake_case", "snake_case 下划线命名", snake, 65);
        push("camel_case", "transform_camel_case", "camelCase 驼峰命名", camel, 64);
        push("kebab_case", "transform_kebab_case", "kebab-case 短横线命名", kebab, 62);
      }
    }
  }

  // Deduplicate identical outputs (keep highest priority)
  items.sort((a, b) => b.priority - a.priority);
  const uniqueByResult = new Set<string>();
  return items.filter((item) => {
    if (uniqueByResult.has(item.result)) return false;
    uniqueByResult.add(item.result);
    return true;
  });
}
