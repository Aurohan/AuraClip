import { describe, expect, it } from "vitest";
import { sortPhrasePins } from "../lib/phrasePins";

describe("short phrase pinned ordering", () => {
  it("puts pins first in their saved order and preserves the order of other phrases", () => {
    const phrases = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(sortPhrasePins(phrases, [3, 1]).map((item) => item.id)).toEqual([3, 1, 2, 4]);
    expect(phrases.map((item) => item.id)).toEqual([1, 2, 3, 4]);
  });
  it("ignores pins for deleted or filtered phrases", () => {
    expect(sortPhrasePins([{ id: 1 }, { id: 3 }], [7, 3]).map((item) => item.id)).toEqual([3, 1]);
  });
});
