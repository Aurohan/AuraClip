import { test } from "vitest";
import assert from "node:assert/strict";
import { getTagColor, getTagTextColor } from "./utils.ts";

test("generated tag colors remain stable", () => {
  assert.equal(getTagColor("密码", "acrylic"), getTagColor("密码", "mica"));
});

test("curated semantic tags assign distinct hues by priority without green/brownish collisions", () => {
  const secretColor = getTagColor("密钥", "mica");
  const passwordColor = getTagColor("密码", "mica");
  const baseUrlColor = getTagColor("BaseURL", "mica");
  const phoneColor = getTagColor("手机", "mica");
  const accountColor = getTagColor("账号", "mica");
  const emailColor = getTagColor("邮箱", "mica");

  const distinct = new Set([
    secretColor,
    passwordColor,
    baseUrlColor,
    phoneColor,
    accountColor,
    emailColor,
  ]);
  assert.equal(distinct.size, 6);
  for (const bg of distinct) {
    assert.match(bg, /^hsl\(/);
    assert.match(getTagTextColor(bg), /^hsl\(/);
  }
});

test("tag text uses the same hue family instead of black or white", () => {
  const background = getTagColor("项目", "acrylic");
  const foreground = getTagTextColor(background, "acrylic");
  assert.match(background, /^hsl\(/);
  assert.match(foreground, /^hsl\(/);
  assert.notEqual(foreground, "#ffffff");
  assert.notEqual(foreground, "#111827");
});

test("custom light and dark colors both receive a colored foreground", () => {
  assert.match(getTagTextColor("#f59e0b"), /^hsl\(/);
  assert.match(getTagTextColor("#2563eb"), /^hsl\(/);
});

test("unparseable colors use a stable neutral HSL fallback", () => {
  assert.equal(getTagTextColor("var(--tag-color)"), "hsl(210 18% 28%)");
});
