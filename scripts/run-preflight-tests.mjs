#!/usr/bin/env node

/**
 * AuraClip 本地一键检查（部署前跑这个）
 *
 *   pnpm preflight            全部
 *   pnpm preflight --quick    跳过 Rust 测试和生产构建
 *
 * 每一步都会跑完再汇总，不会在第一个失败处停下；跳过的步骤会写明原因，不算通过。
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const tauriDir = resolve(rootDir, "src-tauri");
const quick = process.argv.slice(2).includes("--quick");

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};

/** Runs a command; throws with the tail of its output when it fails. */
function run(cmd, cmdArgs, cwd = rootDir) {
  const res = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  if (res.status !== 0) {
    const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim().split("\n");
    const tail = out.slice(-40).join("\n");
    throw new Error(`\`${cmd} ${cmdArgs.join(" ")}\` 失败 (exit ${res.status ?? res.signal})\n${tail}`);
  }
  return res.stdout ?? "";
}

const steps = [
  { name: "ESLint", run: () => run("pnpm", ["run", "lint"]) },
  { name: "样式规则 (docs/DESIGN-SYSTEM.md)", run: () => run("node", ["scripts/lint-styles.mjs"]) },
  { name: "前端单元测试 (vitest，含 i18n 对齐)", run: () => run("pnpm", ["run", "test"]) },
  { name: "TypeScript 类型检查", run: () => run("pnpm", ["exec", "tsc", "--noEmit"]) },
  { name: "前端生产构建", skip: quick && "--quick", run: () => run("pnpm", ["exec", "vite", "build"]) },
  { name: "Rust 测试 (cargo test)", skip: quick && "--quick", run: () => run("cargo", ["test", "--locked"], tauriDir) },
];

const results = [];
const started = Date.now();

for (const [i, step] of steps.entries()) {
  const label = `${c.cyan}[${i + 1}/${steps.length}]${c.reset} ${c.bold}${step.name}${c.reset}`;
  if (step.skip) {
    console.log(`${label} ${c.yellow}跳过${c.reset} ${c.dim}(${step.skip})${c.reset}`);
    results.push({ step, status: "skip", note: step.skip });
    continue;
  }
  process.stdout.write(`${label} ${c.dim}…${c.reset}`);
  const t0 = Date.now();
  try {
    step.run();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\r${label} ${c.green}通过${c.reset} ${c.dim}${secs}s${c.reset}`);
    results.push({ step, status: "pass" });
  } catch (err) {
    console.log(`\r${label} ${c.red}失败${c.reset}`);
    results.push({ step, status: "fail", error: err.message });
  }
}

const failed = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skip");
const passed = results.filter((r) => r.status === "pass");
const total = ((Date.now() - started) / 1000).toFixed(1);

for (const r of failed) {
  console.error(`\n${c.red}${c.bold}✖ ${r.step.name}${c.reset}\n${r.error}`);
}

console.log(
  `\n${c.bold}通过 ${passed.length} · 失败 ${failed.length} · 跳过 ${skipped.length}${c.reset} ${c.dim}(${total}s)${c.reset}`,
);
if (skipped.length) {
  console.log(`${c.yellow}跳过的步骤没有被验证：${skipped.map((r) => r.step.name).join("、")}${c.reset}`);
}
process.exit(failed.length ? 1 : 0);
