// Builds the 67.js (Crucible) scene recipe for the synovium film. Every structure follows plan.md.
// Tissue block scale: 1 unit = 100 micrometres. The joint (shots 1-2) is a schematic hinge joint.

let seed = 20251117;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const R = (a, b) => a + (b - a) * rnd();
const yaw = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const r3 = (v) => v.map((n) => +n.toFixed(4));

export const SHOTS = [
  { name: "joint", duration: 7 },
  { name: "lining", duration: 7 },
  { name: "surface", duration: 7 },
  { name: "layers", duration: 8 },
  { name: "cells", duration: 8 },
  { name: "vessels", duration: 8 },
  { name: "fluid", duration: 11 },
];
export const TOTAL = SHOTS.reduce((s, x) => s + x.duration, 0);
const START = []; { let t = 0; for (const s of SHOTS) { START.push(t); t += s.duration; } }

const TX = 40; // tissue block centre on X, far from the joint
const W = 3, D = 1.5, BOTTOM = -1.8; // block: 300 x 150 um, 180 um of subintima shown
const h = (x) => 0.1 * Math.sin((2 * Math.PI * x) / 1.6) + 0.03 * Math.sin((2 * Math.PI * x) / 0.5 + 1); // folded surface

// The engine allows 30 s of motion per scene, so the film renders as two parts that are joined afterwards.
export const PARTS = [[0, 4], [4, 7]];
function clip(track, t0, t1) {
  const ks = track.keyframes, step = track.interpolation === "STEP";
  const at = (t) => {
    let a = ks[0], b = ks[ks.length - 1];
    for (let i = 0; i < ks.length - 1; i++) if (ks[i].time <= t && t <= ks[i + 1].time) { a = ks[i]; b = ks[i + 1]; }
    if (t <= ks[0].time) return ks[0].value; if (t >= b.time && b === ks[ks.length - 1] && t >= b.time) return b.value;
    if (step || b.time === a.time) return a.value;
    const f = (t - a.time) / (b.time - a.time);
    return Array.isArray(a.value) ? a.value.map((v, i) => +(v + (b.value[i] - v) * f).toFixed(4)) : +(a.value + (b.value - a.value) * f).toFixed(4);
  };
  const out = [{ time: 0, value: at(t0) }];
  for (const k of ks) if (k.time > t0 + 1e-6 && k.time < t1 - 1e-6) out.push({ time: +(k.time - t0).toFixed(3), value: k.value });
  out.push({ time: +(t1 - t0).toFixed(3), value: at(t1) });
  return { ...track, keyframes: out };
}

export function build(part = 0) {
  const geometries = [], materials = [], nodes = [], tracks = [];
  const mat = (id, color, o = {}) => materials.push({ id, color, roughness: 0.45, ...o });
  const node = (n) => { nodes.push(n); return n; };
  const hex = (s) => [1, 3, 5].map((i) => Math.pow(parseInt(s.slice(i, i + 2), 16) / 255, 2.2)).map((n) => +n.toFixed(4));

  // ---------- materials (palette from the style card) ----------
  mat("bone", hex("#E9DDC6"), { roughness: 0.8 });
  mat("cartilage", hex("#DCEBF5"), { roughness: 0.25, clearcoat: 0.6 });
  mat("backdrop", hex("#0B1020"), { tag: "unlit", doubleSided: true });
  mat("capsule", hex("#B98A62"), { roughness: 0.7, doubleSided: true });
  mat("synoviumJoint", hex("#F08BB0"), { roughness: 0.35, doubleSided: true, emissiveColor: hex("#F08BB0"), emission: 0.05 });
  mat("matrix", hex("#F2B8D0"), { roughness: 0.5, opacity: 0.32, alphaMode: "blend" });
  mat("collagen", hex("#E58FB4"), { roughness: 0.6 });
  mat("typeB", hex("#5F7FE0"), { roughness: 0.35, clearcoat: 0.4 });
  mat("typeA", hex("#8B3FB8"), { roughness: 0.35, clearcoat: 0.4 });
  mat("capillary", hex("#D8342F"), { roughness: 0.4, doubleSided: true, emissiveColor: hex("#D8342F"), emission: 0.15 });
  mat("arteriole", hex("#C22A2A"), { roughness: 0.45, doubleSided: true });
  mat("venule", hex("#7A3CA0"), { roughness: 0.45, doubleSided: true });
  mat("lymphatic", hex("#9BC46A"), { roughness: 0.5, doubleSided: true });
  mat("fat", hex("#F6E7B0"), { roughness: 0.3, clearcoat: 0.5 });
  mat("fibroblast", hex("#E8946A"), { roughness: 0.5 });
  mat("hyaluronan", hex("#CFF3FF"), { roughness: 0.3, emissiveColor: hex("#BFEFFF"), emission: 0.6 });
  mat("lubricin", hex("#FFD35A"), { roughness: 0.3, emissiveColor: hex("#FFD35A"), emission: 0.5 });
  mat("filtrate", hex("#FFF3B0"), { roughness: 0.3, emissiveColor: hex("#FFF3B0"), emission: 0.8 });

  geometries.push({ id: "ball", type: "sphere", segments: 20, rings: 12 });
  geometries.push({ id: "dot", type: "sphere", segments: 8, rings: 6 });

  // ---------- joint (schematic hinge joint, lathes around Y) ----------
  // Catmull-Rom through the profile points, so the turned shapes are round and not faceted
  const smooth = (p, n = 6) => { const o = []; for (let i = 0; i < p.length - 1; i++) { const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)]; for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; o.push([0, 1].map((j) => +Math.max(j === 0 ? 0 : -9, 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t3)).toFixed(4))); } } o.push(p[p.length - 1]); return o; };
  const lathe = (id, profile, sweep) => geometries.push({ id, type: "lathe", profile: smooth(profile), segments: 72, ...(sweep ? { startAngle: 0, sweep } : {}) });
  lathe("femurG", [[0, 1.3], [0.2, 1.3], [0.2, 0.66], [0.26, 0.5], [0.33, 0.4], [0.365, 0.28], [0.335, 0.13], [0.2, 0.05], [0, 0.03]]);
  lathe("femurCartG", [[0, 0.012], [0.21, 0.033], [0.352, 0.115], [0.385, 0.28], [0.37, 0.37]]);
  lathe("tibiaG", [[0, -0.06], [0.34, -0.06], [0.375, -0.14], [0.31, -0.36], [0.2, -0.66], [0.2, -1.3], [0, -1.3]]);
  lathe("tibiaCartG", [[0, -0.028], [0.33, -0.028], [0.385, -0.075], [0.385, -0.11]]);
  const capOut = [[0.21, 0.7], [0.36, 0.56], [0.48, 0.32], [0.52, 0], [0.48, -0.3], [0.37, -0.54], [0.21, -0.7]];
  const capIn = capOut.map(([r, y]) => [r - 0.04, y * 0.97]).reverse();
  lathe("capsuleG", [...capOut, ...capIn, capOut[0]], Math.PI * 1.5);
  lathe("synJointG", [[0.375, 0.375], [0.335, 0.44], [0.25, 0.53], [0.215, 0.64], [0.31, 0.52], [0.43, 0.3], [0.465, 0], [0.43, -0.28], [0.325, -0.5], [0.215, -0.64], [0.3, -0.4], [0.385, -0.17], [0.39, -0.115]], Math.PI * 1.5);
  const jointYaw = yaw(Math.PI * 0.25); // turns the open quarter toward the camera (+Z); checked with scene_look
  node({ id: "backdrop", geometry: "ball", material: "backdrop", translation: [TX / 2, 0, 0], scale: [90, 90, 90], castShadow: false, receiveShadow: false });
  node({ id: "femur", geometry: "femurG", material: "bone" });
  node({ id: "femurCartilage", geometry: "femurCartG", material: "cartilage" });
  node({ id: "tibia", geometry: "tibiaG", material: "bone" });
  node({ id: "tibiaCartilage", geometry: "tibiaCartG", material: "cartilage" });
  node({ id: "capsule", geometry: "capsuleG", material: "capsule", rotation: jointYaw });
  node({ id: "synoviumJoint", geometry: "synJointG", material: "synoviumJoint", rotation: jointYaw });

  // ---------- tissue block ----------
  const contour = [];
  for (let i = 0; i <= 48; i++) { const x = -W / 2 + (W * i) / 48; contour.push([+x.toFixed(4), +(h(x) - 0.01).toFixed(4)]); }
  contour.push([W / 2, BOTTOM], [-W / 2, BOTTOM]);
  geometries.push({ id: "matrixG", type: "extrude", contour, depth: D, steps: 1 });
  node({ id: "matrix", geometry: "matrixG", material: "matrix", translation: [TX, 0, -D / 2] });

  // intima: type B (fibroblast-like, majority) and type A (macrophage-like, minority), 1-3 cells deep
  let nA = 0, nB = 0;
  for (let ix = 0; ix < 21; ix++) for (let iz = 0; iz < 11; iz++) {
    const layers = rnd() < 0.3 ? 3 : rnd() < 0.12 ? 1 : 2;
    for (let l = 0; l < layers; l++) {
      const x = -W / 2 + 0.07 + ix * 0.143 + R(-0.03, 0.03) + (l % 2) * 0.07;
      const z = -D / 2 + 0.07 + iz * 0.136 + R(-0.03, 0.03) + (l % 2) * 0.06;
      if (Math.abs(x) > W / 2 - 0.06 || Math.abs(z) > D / 2 - 0.05) continue;
      const y = h(x) + 0.045 + l * 0.088 + R(-0.01, 0.01);
      const top = l === layers - 1;
      if (top && rnd() < 0.17) { nA++; node({ id: "A" + nA, geometry: "ball", material: "typeA", translation: r3([TX + x, y + 0.02, z]), scale: r3([0.07, 0.066, 0.07]) }); }
      else { nB++; node({ id: "B" + nB, geometry: "ball", material: "typeB", translation: r3([TX + x, y, z]), rotation: yaw(R(-0.5, 0.5)), scale: r3([R(0.08, 0.095), 0.046, R(0.062, 0.074)]) }); }
    }
  }

  // capillaries just beneath the intima (some fenestrated in life; drawn as thin red tubes, 7 um wide)
  const tube = (id, path, radius, material, radial = 10) => { geometries.push({ id: id + "G", type: "tube", path: path.map(r3), radius, segments: Math.max(8, path.length * 3), radialSegments: radial }); node({ id, geometry: id + "G", material, translation: [TX, 0, 0] }); };
  const capPos = [];
  [-1.15, -0.45, 0.3, 1.0].forEach((x0, k) => {
    const p = []; for (let i = 0; i <= 12; i++) { const z = -D / 2 + 0.02 + (D - 0.0) * (i / 12) + 0.0; const x = x0 + 0.07 * Math.sin(i * 0.9 + k); p.push([x, h(x) - 0.105, Math.min(z, D / 2 + 0.02)]); capPos.push([x, h(x) - 0.105, z]); }
    tube("capZ" + k, p, 0.035, "capillary");
  });
  [-0.35, 0.3].forEach((z0, k) => {
    const p = []; for (let i = 0; i <= 20; i++) { const x = -W / 2 + 0.05 + (W - 0.1) * (i / 20); const z = z0 + 0.05 * Math.sin(i * 0.7 + k * 2); p.push([x, h(x) - 0.12, z]); capPos.push([x, h(x) - 0.12, z]); }
    tube("capX" + k, p, 0.032, "capillary");
  });
  // deeper: arteriole, venule, lymphatic, running through the block so the cut face shows their lumen
  const through = (id, x0, y0, radius, material, wob) => { const p = []; for (let i = 0; i <= 10; i++) { const z = -D / 2 - 0.02 + (D + 0.06) * (i / 10); p.push([x0 + wob * Math.sin(i * 0.8), y0 + wob * 0.6 * Math.cos(i * 0.7), z]); } tube(id, p, radius, material, 16); };
  through("arteriole", -0.75, -0.85, 0.1, "arteriole", 0.05);
  through("venule", 0.1, -1.0, 0.15, "venule", 0.06);
  through("lymphatic", -0.25, -1.5, 0.12, "lymphatic", 0.05);
  tube("feeder0", [[-0.75, -0.76, 0.2], [-0.7, -0.5, 0.25], [-0.55, -0.25, 0.3], [-0.45, h(-0.45) - 0.12, 0.3]], 0.03, "capillary");
  tube("feeder1", [[0.1, -0.86, -0.3], [0.2, -0.55, -0.33], [0.28, -0.3, -0.35], [0.3, h(0.3) - 0.12, -0.35]], 0.03, "capillary");

  // adipocytes (50-60 um) deep in the subintima
  for (let i = 0; i < 10; i++) { const r = R(0.23, 0.3); node({ id: "fat" + i, geometry: "ball", material: "fat", translation: r3([TX + R(0.55, 1.2), R(-1.45, -0.8), R(-0.4, 0.42)]), scale: [r, r * R(0.9, 1), r] }); }

  // collagen: wavy fibres, denser in the band just under the intima
  for (let g = 0; g < 8; g++) { const p = []; const ph = R(0, 6); for (let i = 0; i <= 14; i++) p.push([-0.4 + (0.8 * i) / 14, 0.035 * Math.sin(i * 0.9 + ph), 0.03 * Math.cos(i * 0.6 + ph)]); geometries.push({ id: "fibre" + g, type: "tube", path: p.map(r3), radius: 0.011, segments: 28, radialSegments: 5 }); }
  for (let i = 0; i < 90; i++) {
    const band = i < 40; const a = band ? R(-0.25, 0.25) : R(-1.2, 1.2);
    const reach = 0.4 * Math.abs(Math.cos(a)) + 0.05, reachZ = 0.4 * Math.abs(Math.sin(a)) + 0.05;
    const x = R(-W / 2 + reach, W / 2 - reach), z = R(-D / 2 + reachZ, D / 2 - reachZ);
    const y = band ? h(x) - R(0.2, 0.42) : R(BOTTOM + 0.08, -0.5);
    node({ id: "col" + i, geometry: "fibre" + (i % 8), material: "collagen", translation: r3([TX + x, y, z]), rotation: yaw(a) });
  }
  for (let i = 0; i < 16; i++) node({ id: "fb" + i, geometry: "ball", material: "fibroblast", translation: r3([TX + R(-1.3, 1.3), R(-1.6, -0.35), R(-0.6, 0.6)]), rotation: yaw(R(0, 3)), scale: [0.11, 0.032, 0.042] });

  // lubricin: gold dots coating the surface
  for (let i = 0; i < 110; i++) { const x = R(-W / 2 + 0.05, W / 2 - 0.05); node({ id: "lub" + i, geometry: "dot", material: "lubricin", translation: r3([TX + x, h(x) + R(0.2, 0.29), R(-D / 2 + 0.05, D / 2 - 0.05)]), scale: [0.014, 0.014, 0.014] }); }

  // hyaluronan: long strands in the cavity, drifting; a second set is released from the intima in shot 5
  for (let g = 0; g < 6; g++) { const p = []; const ph = R(0, 6); for (let i = 0; i <= 18; i++) p.push([-0.45 + (0.9 * i) / 18, 0.07 * Math.sin(i * 0.55 + ph), 0.06 * Math.cos(i * 0.4 + ph)]); geometries.push({ id: "ha" + g, type: "tube", path: p.map(r3), radius: 0.007, segments: 36, radialSegments: 5 }); }
  for (let i = 0; i < 34; i++) {
    const x = R(-1.2, 1.2), z = R(-0.6, 0.6), y = h(x) + R(0.4, 1.7), a = R(0, 3.1);
    node({ id: "ha_" + i, geometry: "ha" + (i % 6), material: "hyaluronan", translation: r3([TX + x, y, z]), rotation: yaw(a) });
    if (i < 16) tracks.push({ kind: "node", id: "ha_" + i, property: "translation", keyframes: [{ time: 0, value: r3([TX + x, y, z]) }, { time: TOTAL, value: r3([TX + x + R(-0.25, 0.25), y + R(0.1, 0.35), z + R(-0.1, 0.1)]) }] });
  }
  const tCells = START[4];
  for (let i = 0; i < 12; i++) {
    const x = R(-0.9, 0.7), z = R(0.1, 0.65), y0 = h(x) + 0.16, t0 = tCells + 0.6 + i * 0.45;
    node({ id: "haNew" + i, geometry: "ha" + (i % 6), material: "hyaluronan", translation: r3([TX + x, y0, z]), rotation: yaw(R(0, 3.1)), scale: [0.02, 0.02, 0.02] });
    tracks.push({ kind: "node", id: "haNew" + i, property: "scale", interpolation: "SMOOTH", keyframes: [{ time: 0, value: [0.02, 0.02, 0.02] }, { time: t0, value: [0.02, 0.02, 0.02] }, { time: t0 + 2.5, value: [0.8, 0.8, 0.8] }, { time: TOTAL, value: [1, 1, 1] }] });
    tracks.push({ kind: "node", id: "haNew" + i, property: "translation", interpolation: "SMOOTH", keyframes: [{ time: 0, value: r3([TX + x, y0, z]) }, { time: t0, value: r3([TX + x, y0, z]) }, { time: t0 + 3.5, value: r3([TX + x + R(-0.1, 0.1), y0 + R(0.3, 0.55), z]) }, { time: TOTAL, value: r3([TX + x + R(-0.2, 0.2), y0 + R(0.8, 1.3), z]) }] });
  }

  // plasma filtrate: dots leave the capillaries, cross the intima (no basement membrane) and reach the cavity
  const tV = START[5];
  for (let i = 0; i < 30; i++) {
    const c = capPos[Math.floor(rnd() * capPos.length)]; const t0 = tV + 0.4 + (i % 15) * 0.42 + R(0, 0.2);
    const p0 = r3([TX + c[0], c[1], c[2]]), p1 = r3([TX + c[0] + R(-0.05, 0.05), h(c[0]) + R(0.3, 0.5), c[2] + R(-0.05, 0.05)]), p2 = r3([p1[0] + R(-0.2, 0.2), p1[1] + R(0.5, 1.1), p1[2] + R(-0.1, 0.1)]);
    node({ id: "fil" + i, geometry: "dot", material: "filtrate", translation: p0, scale: [0.0005, 0.0005, 0.0005] });
    const tiny = [0.0005, 0.0005, 0.0005], full = [0.02, 0.02, 0.02];
    tracks.push({ kind: "node", id: "fil" + i, property: "scale", keyframes: [{ time: 0, value: tiny }, { time: t0, value: tiny }, { time: +(t0 + 0.2).toFixed(3), value: full }, { time: TOTAL, value: full }] });
    tracks.push({ kind: "node", id: "fil" + i, property: "translation", keyframes: [{ time: 0, value: p0 }, { time: t0, value: p0 }, { time: t0 + 2.6, value: p1 }, { time: TOTAL, value: p2 }] });
  }

  // synovium glows in shot 2
  tracks.push({ kind: "material", id: "synoviumJoint", property: "emission", keyframes: [{ time: 0, value: 0.05 }, { time: START[1] + 0.5, value: 0.05 }, { time: START[1] + 2, value: 1.1 }, { time: START[1] + 4.5, value: 0.9 }, { time: START[2], value: 0.6 }, { time: TOTAL, value: 0.6 }] });

  // ---------- camera: one move per shot, three points each ----------
  const T = (v) => [v[0] + TX, v[1], v[2]];
  const cams = [
    { eye: [[-1.0, 0.4, 2.9], [0, 0.5, 3.0], [1.0, 0.45, 2.85]], target: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] },
    { eye: [[0.9, 0.35, 2.6], [0.75, 0.25, 1.9], [0.7, 0.15, 1.55]], target: [[0.15, 0, 0], [0.3, 0, 0], [0.38, 0, 0.1]] },
    { eye: [T([-1.7, 0.5, 1.5]), T([-0.6, 0.42, 1.35]), T([0.5, 0.48, 1.3])], target: [T([-0.6, 0.12, 0.2]), T([0.2, 0.1, 0.2]), T([1.0, 0.1, 0.1])] },
    { eye: [T([-0.5, 0.15, 4.9]), T([0, 0.3, 4.6]), T([0.45, 0.55, 4.4])], target: [T([0, -0.7, 0]), T([0, -0.7, 0]), T([0, -0.68, 0])] },
    { eye: [T([-0.75, 0.42, 1.75]), T([-0.4, 0.46, 1.6]), T([-0.05, 0.5, 1.5])], target: [T([-0.45, 0.13, 0.55]), T([-0.25, 0.14, 0.55]), T([-0.05, 0.15, 0.55])] },
    { eye: [T([1.05, 0.22, 1.9]), T([0.75, 0.2, 1.75]), T([0.45, 0.26, 1.65])], target: [T([0.5, -0.05, 0.7]), T([0.35, -0.03, 0.7]), T([0.2, 0, 0.7])] },
    { eye: [T([0.5, 0.75, 2.5]), T([0.15, 1.1, 2.9]), T([-0.2, 1.5, 3.4])], target: [T([0.1, 0.3, 0]), T([0, 0.5, 0]), T([0, 0.6, 0])] },
  ];
  const eyeK = [], tgtK = [];
  cams.forEach((c, i) => {
    const t0 = START[i], t1 = t0 + SHOTS[i].duration;
    [t0, (t0 + t1) / 2, t1 - 0.002].forEach((t, k) => { eyeK.push({ time: +t.toFixed(3), value: r3(c.eye[k]) }); tgtK.push({ time: +t.toFixed(3), value: r3(c.target[k]) }); });
  });
  eyeK[eyeK.length - 1].time = TOTAL; tgtK[tgtK.length - 1].time = TOTAL;
  const camAt = PARTS[part][0];
  tracks.push({ kind: "camera", property: "eye", keyframes: eyeK }, { kind: "camera", property: "target", keyframes: tgtK });

  const P0 = START[PARTS[part][0]], P1 = PARTS[part][1] < SHOTS.length ? START[PARTS[part][1]] : TOTAL;
  // Clip every track to this part. A track that does not change in the part becomes the node's or material's base value
  // (the engine allows 128 tracks per scene).
  const clipped = [];
  for (const t of tracks) {
    const c = clip(t, P0, P1), v0 = c.keyframes[0].value;
    if (t.kind === "node") { const n = nodes.find((x) => x.id === t.id); n[t.property] = v0; }
    if (t.kind === "material") materials.find((x) => x.id === t.id)[t.property] = v0;
    if (c.keyframes.some((k) => JSON.stringify(k.value) !== JSON.stringify(v0))) clipped.push(c);
  }
  const navy = hex("#0B1020");
  return {
    format: "crucible.scene", schemaVersion: 1, geometries, materials, nodes,
    camera: { eye: r3(cams[camAt].eye[0]), target: r3(cams[camAt].target[0]), fov: 35, near: 0.05, far: 200 },
    environment: { setup: "studio", ground: false, world: false, environmentIntensity: 0.55, lightDirection: [-2, 4, 3] },
    effects: { exposure: 0.7, composite: { background: { top: navy, bottom: hex("#18223F") } }, ambientOcclusion: 0.6, ambientOcclusionRadius: 0.15, bloom: { strength: 0.35, threshold: 1, radius: 1.2 }, vignette: 0.25 },
    motion: { duration: P1 - P0, loop: false, tracks: clipped },
    timeline: { shots: SHOTS.slice(PARTS[part][0], PARTS[part][1]).map((s) => ({ name: s.name, duration: s.duration })) },
    _counts: { typeA: nA, typeB: nB },
  };
}
