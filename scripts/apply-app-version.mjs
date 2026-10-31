// Copies the version in versions.json into package.json, tauri.conf.json and Cargo.toml.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const { version: configured } = JSON.parse(readFileSync(resolve(root, "versions.json"), "utf8"));
const version = process.env.AURACLIP_APP_VERSION?.trim() || configured;

if (!version) {
  console.error("[apply-app-version] versions.json has no \"version\".");
  process.exit(1);
}

function updateJson(path, apply) {
  const raw = readFileSync(path, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const data = JSON.parse(raw);
  apply(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`.replace(/\n/g, eol));
}

updateJson(resolve(root, "package.json"), (pkg) => { pkg.version = version; });
updateJson(resolve(root, "src-tauri/tauri.conf.json"), (conf) => { conf.version = version; });

const cargoTomlPath = resolve(root, "src-tauri/Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const cargoVersionRe = /^version = ".*"$/m;
if (!cargoVersionRe.test(cargoToml)) {
  console.error("[apply-app-version] Failed to locate version in src-tauri/Cargo.toml");
  process.exit(1);
}
writeFileSync(cargoTomlPath, cargoToml.replace(cargoVersionRe, `version = "${version}"`));

console.log(`[apply-app-version] -> ${version}`);
