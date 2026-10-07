/**
 * Spine: the lumbar column, L1 to L5, standing on the top of the sacrum. Each
 * vertebra is a rounded body with its arch behind it: two transverse
 * processes, the spinal canal, and a spinous process reaching back. A disc
 * sits on every body. The pointer's height picks a vertebra; it lifts, the
 * two discs touching it open fully and the rest open less with distance, so
 * the column decompresses outwards from it. At rest the column holds a
 * lordotic curve and the L4–L5 disc is bright. The slider is the gap.
 */
const {
  Cam, clamp, facing, fillet, fit, poly, prism, proj, ringAt, rrect,
  tdone, tset, tval, tween, disposer, mk, pointer, put, register, solid,
} = HL;

const N = 5, BW = 40, BD = 30, BH = 13, DH = 6, STEP = BH + DH, SB = 14, LORD = 7;
const FALL = [1, 0.3, 0.1, 0.05];

/** The arch seen from above, posterior to -y: pedicles, transverse processes, the canal, the spinous process. */
const ARCH = fillet(
  [[-9, -8], [-11, -20], [-29, -22], [-31, -27], [-13, -29], [-5, -34], [-4, -51], [4, -51], [5, -34],
   [13, -29], [31, -27], [29, -22], [11, -20], [9, -8], [5, -8], [6, -19], [3, -25], [-3, -25], [-6, -19], [-5, -8]],
  [1, 2, 2, 2, 3, 2, 2, 2, 2, 3, 2, 2, 2, 1, 1, 2, 2, 2, 2, 1],
  3,
);

/** A rounded oval footprint and its crease ring, with enough steps for a large round. */
const oval = (x0, y0, x1, y1, r, b) => [rrect(x0, y0, x1, y1, r, 14), rrect(x0 + b, y0 + b, x1 - b, y1 - b, r - b, 14)];

/** Vertebra j's lordotic shift forward (+y): most at L3, least at the ends. */
const lord = (j) => LORD * Math.sin((Math.PI * (j + 0.5)) / N);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let gap = value;

  const C = Cam(45, 0.5, 1.75);
  const top = N * STEP + 18 * 2.5;
  fit(C, [[-36, -51, -SB], [36, 22, -SB], [36, -51, top], [-36, 22, top], [36, 22, -SB], [-36, -51, top]], 200, 160);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // The sacrum's top: a wide plinth the column stands on.
  const [sr, si] = oval(-34, -20, 34, 18, 15, 1.8);
  put(solid(g), prism(P, front, sr, si, -SB, 0));

  const vs = [];
  for (let j = 0; j < N; j++) {
    const yo = lord(j), yd = j ? (lord(j - 1) + yo) / 2 : yo / 2;
    const disc = { el: solid(g), ring: oval(-BW / 2 + 2.5, -BD / 2 + 2.5 + yd, BW / 2 - 2.5, BD / 2 - 2.5 + yd, 11, 1.2) };
    disc.nuc = mk("path", { class: "nf lo" }, disc.el.g);
    disc.nr = rrect(-8, -8 + yd, 8, 3 + yd, 5, 6);
    const ag = mk("g", {}, g);
    const under = mk("path", { class: "lo" }, ag), over = mk("path", { class: "sil" }, ag);
    const body = solid(g), ring = oval(-BW / 2, -BD / 2 + yo, BW / 2, BD / 2 + yo, 13, 1.4);
    vs.push({ j, yo, disc, under, over, body, ring, lift: tween(0), drawn: NaN, below: NaN });
  }

  /** Vertebra j's paths at its lift, and the disc under it at the lift of the vertebra below. */
  function draw(v, z, zd) {
    if (z !== v.drawn) {
      v.drawn = z;
      const zb = v.j * STEP + DH + z, za = zb + BH * 0.85;
      put(v.body, prism(P, front, v.ring[0], v.ring[1], zb, zb + BH));
      v.under.setAttribute("d", poly(ARCH.map(([x, y]) => P(x, y + v.yo, za - 5))));
      v.over.setAttribute("d", poly(ARCH.map(([x, y]) => P(x, y + v.yo, za))));
    }
    if (zd !== v.below) {
      v.below = zd;
      const z0 = v.j * STEP + zd, d = v.disc;
      put(d.el, prism(P, front, d.ring[0], d.ring[1], z0, z0 + DH));
      d.nuc.setAttribute("d", poly(ringAt(P, d.nr, z0 + DH)));
    }
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    vs.forEach((v, j) => {
      draw(v, tval(v.lift, now), j ? tval(vs[j - 1].lift, now) : 0);
      if (!tdone(v.lift, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  // Hit test: each vertebra's REST centre on screen. Lifting never moves these.
  const centres = vs.map((v) => P(0, v.yo, v.j * STEP + DH + BH / 2));
  const half = (centres[0][1] - centres[1][1]) / 2;
  function hit([x, y]) {
    let a = -1, best = Infinity;
    centres.forEach((c, j) => { const d = Math.abs(y - c[1]); if (d < best) { best = d; a = j; } });
    if (Math.abs(x - centres[a][0]) > 70 || best > half * 1.6) return -1;
    return a;
  }

  let act = -1;
  /** Picks vertebra a (-1 puts the column back): disc k opens by its distance from the two discs touching a. */
  function setActive(a, force) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    let z = 0;
    vs.forEach((v, j) => {
      if (a >= 0) z += gap * FALL[Math.min(3, j <= a ? a - j : j - a - 1)];
      tset(v.lift, a >= 0 ? z : 0, now, Math.abs(j - Math.max(0, from)) * 45);
      v.body.sil.classList.toggle("hi", j === a);
      v.over.classList.toggle("hi", j === a);
      v.disc.el.sil.classList.toggle("hi", a < 0 && j === 1);
    });
    read.textContent = a < 0 ? "rest" : "L" + (N - a);
    B.wake();
  }
  setActive(-1, true);

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { gap = clamp(v, 0, 18); if (act >= 0) setActive(act, true); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "spine",
  means: "A lumbar spine, L1 to L5: the vertebra under the pointer lifts, and the discs open outwards from it.",
  rules: [1, 2, 3, 5],
  range: [6, 12, 18],
  mount,
});
