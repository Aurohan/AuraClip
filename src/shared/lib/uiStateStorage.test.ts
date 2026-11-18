import { test } from "vitest";
import assert from "node:assert/strict";
import {
  parseBooleanFlag,
  parseClipboardSortMode,
  parseCollapsedGroups,
  parseMainTab,
  parsePhraseViewMode,
  parseSelectedTag,
  serializeCollapsedGroups,
} from "./uiStateStorage.ts";

test("parseMainTab restores phrases and safely defaults unknown inputs to clipboard", () => {
  assert.equal(parseMainTab("phrases"), "phrases");
  assert.equal(parseMainTab("clipboard"), "clipboard");
  assert.equal(parseMainTab(undefined), "clipboard");
  assert.equal(parseMainTab("other"), "clipboard");
});

test("parsePhraseViewMode & parseClipboardSortMode validate persisted enums", () => {
  assert.equal(parsePhraseViewMode("grid"), "grid");
  assert.equal(parsePhraseViewMode("cards"), "cards");
  assert.equal(parsePhraseViewMode("invalid"), "compact");

  assert.equal(parseClipboardSortMode("usage"), "usage");
  assert.equal(parseClipboardSortMode("created"), "created");
  assert.equal(parseClipboardSortMode("last_used"), "last_used");
  assert.equal(parseClipboardSortMode("unknown"), "activity");
});

test("parseCollapsedGroups & serializeCollapsedGroups deduplicate and round-trip deterministically", () => {
  const serialized = serializeCollapsedGroups(["手机", "邮箱", "手机", "BaseURL"]);
  assert.equal(serialized, '["BaseURL","手机","邮箱"]');
  assert.deepEqual(Array.from(parseCollapsedGroups(serialized)), ["BaseURL", "手机", "邮箱"]);
  assert.equal(parseCollapsedGroups("{bad-json").size, 0);
});

test("parseBooleanFlag & parseSelectedTag preserve explicit states", () => {
  assert.equal(parseBooleanFlag("true", false), true);
  assert.equal(parseBooleanFlag("false", true), false);
  assert.equal(parseBooleanFlag(undefined, true), true);

  assert.equal(parseSelectedTag(""), null);
  assert.equal(parseSelectedTag(null), null);
  assert.equal(parseSelectedTag("密钥"), "密钥");
});
