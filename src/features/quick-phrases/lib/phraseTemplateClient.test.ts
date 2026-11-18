import { describe, expect, it } from "vitest";
import {
  detectPhraseKind,
  expandPhraseTemplateClient,
  extractInteractiveSlots,
  tokenizePhrasePreview,
} from "./phraseTemplateClient";

describe("phraseTemplateClient", () => {
  it("extracts unique interactive slots and default values", () => {
    const slots = extractInteractiveSlots(
      "您好 {{?客户称呼=王总}}，您的工单 {{?工单号}} 已于 {{date}} 处理完毕（收件人：{{?客户称呼}}）。"
    );
    expect(slots).toEqual([
      { name: "客户称呼", defaultValue: "王总" },
      { name: "工单号", defaultValue: "" },
    ]);
  });

  it("expands built-in placeholders and interactive slot values cleanly", () => {
    const fixedDate = new Date(2026, 10, 18, 9, 5, 3);
    const out = expandPhraseTemplateClient(
      "Hi {{?姓名=同学}}，附件 {{clipboard}} 发送于 {{date}} {{time}}",
      {
        clipboardText: "report.pdf",
        slotValues: { 姓名: "张工" },
        now: fixedDate,
      }
    );
    expect(out).toBe("Hi 张工，附件 report.pdf 发送于 2026-11-18 09:05:03");
  });

  it("classifies phrase semantic kinds and tokenizes inline chips", () => {
    expect(detectPhraseKind("ssh root@10.0.0.1")).toBe("code");
    expect(detectPhraseKind("user@example.com")).toBe("contact");
    expect(detectPhraseKind("你好 {{?称呼}}")).toBe("interactive");
    expect(detectPhraseKind("密码123", true)).toBe("secret");

    const parts = tokenizePhrasePreview("日期 {{date}} 客户 {{?客户=李四}}");
    expect(parts.some((p) => p.type === "builtin" && p.label === "date")).toBe(true);
    expect(parts.some((p) => p.type === "slot" && p.label === "? 客户")).toBe(true);
  });
});
