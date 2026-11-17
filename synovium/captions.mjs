// Joins the rendered parts and burns in the captions from plan.md.
// node captions.mjs <output.mp4>
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { SHOTS } from "./build.mjs";

const out = process.argv[2] || "out/synovium_preview.mp4";
const font = ["/usr/share/fonts/opentype/inter/Inter-Medium.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C\\:/Windows/Fonts/arial.ttf"].find((f) => existsSync(f.replace("\\:", ":"))) || "";
const start = []; { let t = 0; for (const s of SHOTS) { start.push(t); t += s.duration; } }

// [shot, from, to (seconds inside the shot), text]. Each stays up at least 1.2 s + 0.07 s per character.
const captions = [
  [0, 0.4, 6.6, "Synovium: the soft lining of a synovial joint"],
  [1, 0.4, 6.7, "It lines the capsule from inside,\nbut never covers the cartilage"],
  [2, 0.4, 6.6, "Seen close: a smooth, wet surface, gently folded"],
  [3, 0.4, 7.6, "Two layers. Intima on top: 1 to 3 cells, 20-40 µm thick.\nSubintima below: vessels, fat, collagen"],
  [4, 0.3, 7.7, "Type B cells (blue) make hyaluronan.\nType A cells (purple) are macrophages: the minority"],
  [5, 0.3, 7.7, "No basement membrane under the intima.\nFenestrated capillaries sit just beneath it"],
  [6, 0.3, 6.3, "Plasma filtrate + hyaluronan (2-4 mg/mL) + lubricin\n= synovial fluid"],
  [6, 6.7, 10.7, "It lubricates the joint and feeds the cartilage"],
];
const titles = [
  [0, "SYNOVIAL JOINT  ·  schematic cutaway"], [1, "SYNOVIAL JOINT  ·  schematic cutaway"],
  [2, "SYNOVIUM  ·  surface"], [3, "SYNOVIUM  ·  section, 0.3 mm wide"], [4, "INTIMA  ·  lining cells"],
  [5, "SUBINTIMA  ·  capillaries"], [6, "JOINT CAVITY  ·  synovial fluid"],
];
const credit = "Sources: Smith MD, Open Rheumatol J 2011 (PMC3263506) · Damerau et al. · Semenistaja et al. (CC BY 4.0)";

mkdirSync("out/text", { recursive: true });
const esc = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
const filters = [];
const add = (i, text, t0, t1, opts) => {
  const f = `out/text/t${i}.txt`; writeFileSync(f, text);
  const a = `if(lt(t,${t0}),0,if(lt(t,${t0 + 0.3}),(t-${t0})/0.3,if(lt(t,${t1 - 0.3}),1,if(lt(t,${t1}),(${t1}-t)/0.3,0))))`;
  filters.push(`drawtext=${font ? `fontfile='${esc(font)}':` : ""}textfile='${esc(f)}':alpha='${a}':${opts}`);
};
let n = 0;
for (const [s, a, b, text] of captions) add(n++, text, start[s] + a, start[s] + b, "fontcolor=white:fontsize=h/19:line_spacing=6:x=(w-text_w)/2:y=h-text_h-h/11:box=1:boxcolor=black@0.55:boxborderw=h/45");
for (const [s, text] of titles) add(n++, text, start[s] + 0.1, start[s] + SHOTS[s].duration - 0.1, "fontcolor=white@0.9:fontsize=h/24:x=h/18:y=h/18:box=1:boxcolor=black@0.45:boxborderw=h/80");
add(n++, credit, start[6] + 6.7, start[6] + 10.9, "fontcolor=white@0.85:fontsize=h/34:x=(w-text_w)/2:y=h-text_h-h/40");
writeFileSync("out/text/filter.txt", filters.join(",\n"));

writeFileSync("out/parts.txt", "file 'part0.mp4'\nfile 'part1.mp4'\n");
const run = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
run(["-f", "concat", "-safe", "0", "-i", "out/parts.txt", "-c", "copy", "out/joined.mp4"]);
run(["-i", "out/joined.mp4", "-filter_script:v", "out/text/filter.txt", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
console.log("wrote", out);
