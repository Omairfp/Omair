// Minimal MCP stdio client for the 67.js (Crucible) server, started with --jobs so video can render.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

function chromium() {
  if (process.env.CRUCIBLE_BROWSER) return process.env.CRUCIBLE_BROWSER;
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return null;
  for (const d of readdirSync(root)) if (/^chromium-\d+$/.test(d)) {
    const p = join(root, d, "chrome-linux64", "chrome");
    if (existsSync(p)) return p;
  }
  return null;
}

export async function connect({ jobs = resolve("jobs"), memory = "384" } = {}) {
  mkdirSync(jobs, { recursive: true });
  const b = chromium();
  const args = ["-y", "--package", "@codepawlhq/crucible@" + (process.env.CRUCIBLE_VERSION || "0.20.0"), "crucible-mcp",
    "--backend", process.env.CRUCIBLE_BACKEND || (b && b.startsWith("/opt/pw-browsers") ? "cpu" : "gpu"),
    "--memory", memory, "--jobs", jobs];
  if (b) args.push("--browser", b);
  const child = spawn("npx", args, { stdio: ["pipe", "pipe", "inherit"], shell: process.platform === "win32" });
  let buf = "", id = 0; const pending = new Map();
  child.stdout.on("data", (c) => {
    buf += c; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  const rpc = (method, params) => new Promise((res) => { const n = ++id; pending.set(n, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "synovium", version: "1" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const call = async (name, args = {}) => {
    const r = await rpc("tools/call", { name, arguments: args });
    if (r.error) throw new Error(name + ": " + JSON.stringify(r.error));
    const out = { text: "", images: [], isError: r.result.isError };
    for (const c of r.result.content || []) { if (c.type === "text") out.text += c.text; if (c.type === "image") out.images.push(Buffer.from(c.data, "base64")); }
    try { out.json = JSON.parse(out.text); } catch {}
    if (out.isError) throw new Error(name + " failed: " + out.text.slice(0, 1500));
    return out;
  };
  return { call, rpc, close: () => child.kill() };
}
