import { describe, expect, it } from "vitest";
import { computeTextTransforms } from "./textTransforms";

describe("computeTextTransforms", () => {
  it("prioritizes POSIX and escaped slash conversions for Windows paths", () => {
    const res = computeTextTransforms("D:\\!PROJECT\\AuraClip\\src\\App.tsx");
    const posix = res.find((r) => r.id === "path_posix");
    const escaped = res.find((r) => r.id === "path_escaped");
    expect(posix?.result).toBe("D:/!PROJECT/AuraClip/src/App.tsx");
    expect(escaped?.result).toBe("D:\\\\!PROJECT\\\\AuraClip\\\\src\\\\App.tsx");
  });

  it("formats and minifies JSON payloads", () => {
    const res = computeTextTransforms('{"name":"AuraClip","v":2}');
    expect(res[0]?.id).toBe("json_pretty");
    expect(res[0]?.result).toContain('\n  "name": "AuraClip"');
  });

  it("extracts verification codes and URLs cleanly", () => {
    const sms = computeTextTransforms("【极光云】您的登录验证码为 839204，5分钟内有效。");
    expect(sms.find((r) => r.id === "extract_numbers")?.result).toBe("839204");

    const withUrl = computeTextTransforms("请访问 https://auraclip.dev/docs 查看文档");
    expect(withUrl.find((r) => r.id === "extract_urls")?.result).toBe("https://auraclip.dev/docs");
  });
});
