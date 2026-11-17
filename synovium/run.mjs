// node run.mjs look 3 10 17.5 ...   -> PNG stills at those film times in out/
// node run.mjs video [width height fps] -> out/synovium_raw.mp4
import { connect } from "./mcp.mjs";
import { build, TOTAL } from "./build.mjs";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

// Times for "look" are film times; the part is picked from the time. "video" takes the part number first.
import { PARTS, SHOTS } from "./build.mjs";
const [mode = "look", ...rest0] = process.argv.slice(2);
const starts = []; { let t = 0; for (const s of SHOTS) { starts.push(t); t += s.duration; } }
const partStart = (p) => starts[PARTS[p][0]];
const part = mode === "video" ? Number(rest0[0] || 0) : (Number(rest0[0] || 0) >= partStart(1) ? 1 : 0);
const rest = mode === "video" ? rest0.slice(1) : rest0;
mkdirSync("out", { recursive: true });
const recipe = build(part);
const counts = recipe._counts; delete recipe._counts;
writeFileSync("out/recipe.json", JSON.stringify(recipe));
console.log("cells", counts, "nodes", recipe.nodes.length, "geometries", recipe.geometries.length, "tracks", recipe.motion.tracks.length, "bytes", JSON.stringify(recipe).length);

const c = await connect({ jobs: resolve("jobs") });
try {
  const created = await c.call("scene_create", { recipe });
  const rev = created.json?.revision ?? 0;
  console.log("created", (created.text || "").slice(0, 400));
  if (mode === "look") {
    const insp = await c.call("scene_inspect", {});
    console.log("diagnostics", JSON.stringify(insp.json?.diagnostics ?? insp.text.slice(0, 600)).slice(0, 1200));
    for (const t of rest.length ? rest.map(Number) : [1]) {
      const r = await c.call("scene_look", { motionTime: +(t - partStart(part)).toFixed(3), width: 768, height: 432 });
      if (r.images[0]) writeFileSync(`out/look_${String(t).replace(".", "_")}.png`, r.images[0]);
      console.log("look", t, r.images.length ? "ok" : r.text.slice(0, 300));
    }
  } else {
    const [w = 640, hgt = 360, fps = 15] = rest.map(Number);
    const sub = await c.call("scene_render_submit", { expectedRevision: rev, settings: { kind: "video", width: w, height: hgt, fps, timeline: { start: 0 } } });
    console.log("submit", sub.text.slice(0, 600));
    const jobId = sub.json.jobId;
    for (;;) {
      await new Promise((r) => setTimeout(r, 10000));
      const st = await c.call("scene_render_status", { jobId });
      console.log(new Date().toISOString().slice(11, 19), st.text.slice(0, 220));
      if (["completed", "failed", "cancelled", "interrupted"].includes(st.json?.state)) break;
    }
    const res = await c.call("scene_render_result", { jobId });
    console.log("result", res.text.slice(0, 1500));
    writeFileSync(`out/render_result_${part}.json`, res.text);
    const m = res.text.match(/"(\/[^"]+\.mp4)"/);
    if (m) { copyFileSync(m[1], `out/part${part}.mp4`); console.log("saved part", part); }
  }
} catch (e) { console.error("ERROR", e.message); process.exitCode = 1; }
finally { c.close(); }
