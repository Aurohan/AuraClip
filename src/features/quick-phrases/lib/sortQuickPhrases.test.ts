import { describe, expect, it } from "vitest";
import { sortQuickPhrases } from "./sortQuickPhrases";
import type { QuickPhrase } from "../../../shared/types";
const phrase = (id: number, createdAt: number, updatedAt: number, lastUsedAt: number | null, useCount: number): QuickPhrase => ({ id, title: "", content: "", tags: [], isSensitive: false, sortOrder: 0, createdAt, updatedAt, lastUsedAt, useCount });
const data = [phrase(1, 100, 300, null, 9), phrase(2, 300, 100, 200, 1), phrase(3, 200, 200, 300, 5)];
describe("phrase sorting", () => {
  it("sorts each mode using its own field", () => {
    expect(sortQuickPhrases(data, [], "activity").map(p => p.id)).toEqual([1, 3, 2]);
    expect(sortQuickPhrases(data, [], "created").map(p => p.id)).toEqual([2, 3, 1]);
    expect(sortQuickPhrases(data, [], "last_used").map(p => p.id)).toEqual([3, 2, 1]);
    expect(sortQuickPhrases(data, [], "usage").map(p => p.id)).toEqual([1, 3, 2]);
  });
  it("keeps pinned phrases ahead in pinned order", () => {
    expect(sortQuickPhrases(data, [2, 1], "last_used").map(p => p.id)).toEqual([2, 1, 3]);
  });
});
