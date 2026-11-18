import { describe, expect, it } from "vitest";
import type { QuickPhrase } from "../../../shared/types";
import {
  buildPhraseTagSections,
  isCompactGridWideItem,
  rankPhraseTags,
  summarizePhraseValue,
  UNTAGGED_GROUP_KEY,
} from "./phraseVaultGroups";

const makePhrase = (id: number, content: string, tags: string[] = []): QuickPhrase => ({
  id,
  title: `P${id}`,
  content,
  tags,
  isSensitive: false,
  sortOrder: id,
  useCount: 0,
  createdAt: id,
  updatedAt: id,
});

describe("phraseVaultGroups", () => {
  it("groups phrases by primary tag preserving tag order and places untagged last", () => {
    const phrases = [
      makePhrase(1, "user@gmail.com", ["邮箱", "账号"]),
      makePhrase(2, "untagged snippet", []),
      makePhrase(3, "https://api.deepseek.com", ["BaseURL"]),
      makePhrase(4, "other@qq.com", ["邮箱"]),
    ];

    const sections = buildPhraseTagSections(phrases, ["邮箱", "BaseURL", "手机"]);
    expect(sections.map((s) => s.key)).toEqual(["邮箱", "BaseURL", UNTAGGED_GROUP_KEY]);
    expect(sections[0].phrases.map((p) => p.id)).toEqual([1, 4]);
    expect(sections[1].phrases.map((p) => p.id)).toEqual([3]);
    expect(sections[2].label).toBeNull();
  });

  it("ranks tags by item count descending then alphabetically", () => {
    const counts = new Map([
      ["手机", 1],
      ["邮箱", 8],
      ["账号", 8],
      ["BaseURL", 3],
    ]);
    expect(rankPhraseTags(["手机", "BaseURL", "账号", "邮箱"], counts)).toEqual([
      "邮箱",
      "账号",
      "BaseURL",
      "手机",
    ]);
  });

  it("identifies wide items for 2-column Bento grid mode", () => {
    expect(isCompactGridWideItem(makePhrase(1, "quxaly@gmail.com"))).toBe(false);
    expect(isCompactGridWideItem(makePhrase(2, "https://api.deepseek.com"))).toBe(false);
    expect(isCompactGridWideItem(makePhrase(3, "line1\nline2"))).toBe(true);
    expect(isCompactGridWideItem(makePhrase(4, "Hi {{?name}}"))).toBe(true);
    expect(isCompactGridWideItem(makePhrase(5, "x".repeat(50)))).toBe(true);
  });

  it("flattens newlines cleanly in compact preview", () => {
    expect(summarizePhraseValue("ssh root@1.2.3.4\ncd /app")).toBe("ssh root@1.2.3.4 ↵ cd /app");
  });
});
