import { describe, expect, it } from "vitest";
import {
  canTransformClipboardEntry,
  detectCodeBadge,
  extractOtpDigits,
  extractUrlDomain,
} from "./cardSemantics";

describe("cardSemantics", () => {
  it("extracts OTP codes, URL domains, and code language badges", () => {
    expect(extractOtpDigits("您的登录验证码：592831，5分钟有效")).toBe("592831");
    expect(extractUrlDomain("https://www.github.com/Aurohan/AuraClip")).toBe("github.com");
    expect(detectCodeBadge('{"ok":true}')).toBe("JSON");
    expect(detectCodeBadge("SELECT * FROM quick_phrases")).toBe("SQL");
  });

  it("checks transform & phrase eligibility cleanly", () => {
    expect(canTransformClipboardEntry({ content_type: "text", preview: "hi" })).toBe(true);
    expect(canTransformClipboardEntry({ content_type: "text", preview: "hi" }, true)).toBe(false);
    expect(canTransformClipboardEntry({ content_type: "image", preview: "[Image Content]" })).toBe(false);
    expect(canTransformClipboardEntry({ content_type: "image", preview: "[OCR] 发票抬头" })).toBe(true);
  });
});
