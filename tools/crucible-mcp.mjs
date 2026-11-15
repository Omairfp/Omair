#!/usr/bin/env node
// Starts the 67.js (Crucible) MCP server on any machine: cloud session or your own PC.
// - Browser: CRUCIBLE_BROWSER env var, else the cloud's pre-installed Chromium, else your installed Chrome.
// - Backend: CRUCIBLE_BACKEND env var, else "cpu" in the cloud (no GPU) and "gpu" on a PC.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const VERSION = process.env.CRUCIBLE_VERSION || "0.20.0";

function cloudChromium() {
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return null;
  for (const dir of readdirSync(root)) {
    if (!/^chromium-\d+$/.test(dir)) continue;
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const p = join(root, dir, sub, "chrome");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const cloud = cloudChromium();
const browser = process.env.CRUCIBLE_BROWSER || cloud;
const backend = process.env.CRUCIBLE_BACKEND || (cloud ? "cpu" : "gpu");

const args = [
  "-y",
  "--package",
  `@codepawlhq/crucible@${VERSION}`,
  "crucible-mcp",
  "--backend",
  backend,
  "--memory",
  process.env.CRUCIBLE_MEMORY || "256",
];
if (browser) args.push("--browser", browser);
args.push(...process.argv.slice(2));

const child = spawn("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));
