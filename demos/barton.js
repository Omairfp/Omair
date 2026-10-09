/**
 * Barton: a volar Barton fracture of the distal radius, standing upright. The
 * radius and ulna rise from below; on the radius sits the volar rim fragment,
 * sheared off its articular lip, and the carpus rides on it in two rows. Volar is +y, toward the viewer. At rest the
 * fragment and the carpus have slipped volarly and proximally together: the
 * fracture-subluxation. The camera turns to 70° so the column is seen near
 * lateral, the view the fracture is read in, with volar to the left.
 * Raising the pointer is traction: on a spring the fragment and the carpus
 * are drawn back into place (ligamentotaxis). The
 * read-out is the displacement left, in mm. The slider is how far it slipped.
 */
const {
  Cam, clamp, facing, fit, hull, open, poly, prism, proj, ringAt, rings, rrect, run,
  spring, stepS, disposer, mk, pointer, put, register, solid,
} = HL;

const ZS = 64, ZT = 90, ZF = 72, MM = 0.4;

/** A solid whose top ring differs from its foot: hull of the two, and the top's crease. */
function taper(P, front, f, t, b, z0, z1) {
  const foot = rrect(f[0], f[1], f[2], f[3], f[4], 6), top = rrect(t[0], t[1], t[2], t[3], t[4], 6);
  const inner = rrect(t[0] + b, t[1] + b, t[2] - b, t[3] - b, t[4] - b, 6);
  return { sil: poly(hull(ringAt(P, foot, z0).concat(ringAt(P, top, z1)))), crease: open(ringAt(P, run(inner, front), z1)) };
}

/** A rounded block from its footprint, shifted by (dy, dz). */
const block = (P, front, [x0, y0, x1, y1, r, z0, z1], dy, dz) => {
  const [ring, inner] = rings(x0, y0 + dy, x1, y1 + dy, r, 1.1);
  return prism(P, front, ring, inner, z0 + dz, z1 + dz);
};

// The carpus, back to front: proximal row (triquetrum, lunate, scaphoid), then the distal row.
const CARPUS = [
  [-30, -10, -15, 9, 6, 91.5, 104], [-14, -11, 2, 10, 6, 91.5, 106], [3, -11, 22, 10, 7, 91.5, 105],
  [-28, -9, -12, 8, 5, 107, 119], [-11, -10, 5, 9, 5, 108, 122], [6, -9, 23, 8, 5, 107, 118],
];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let D = value;

  const C = Cam(70, 0.5, 2.05);
  fit(C, [[-40, -14, 0], [24, 42, 0], [-40, -14, 122], [24, 42, 122], [24, -14, 0], [-40, 42, 122]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // Fixed: the ulna with its head, then the radial shaft and the dorsal main piece of the distal radius.
  put(solid(g), block(P, front, [-38, -8, -24, 6, 6, 0, 82], 0, 0));
  put(solid(g), taper(P, front, [-38, -8, -24, 6, 6], [-40, -9, -22, 7, 8], 1.2, 82, 92));
  put(solid(g), block(P, front, [-13, -9, 13, 9, 8, 0, ZS - 6], 0, 0));
  put(solid(g), taper(P, front, [-13, -9, 13, 9, 8], [-20, -12, 22, 12, 6], 1.4, ZS - 6, ZS));
  put(solid(g), block(P, front, [-20, -12, 22, 12, 6, ZS, ZF], 0, 0));
  put(solid(g), block(P, front, [-20, -12, 22, 2, 5, ZF, ZT], 0, 0));

  // Moving: the volar rim fragment, then the carpus that rides with it.
  const frag = solid(g), carp = CARPUS.map(() => solid(g));
  frag.sil.classList.add("hi");

  const sp = spring(0, { eps: 0.002 });
  let drawn = NaN;
  function draw() {
    const d = D * (1 - clamp(sp.x, 0, 1));
    if (d === drawn) return;
    drawn = d;
    const dy = d, dz = -0.5 * d;
    put(frag, block(P, front, [-20, 2.6, 22, 12, 4, ZF, ZT], dy, dz));
    CARPUS.forEach((b, k) => put(carp[k], block(P, front, b, dy, dz)));
  }

  const B = register(stage, (dt) => {
    const m = stepS(sp, dt);
    draw();
    return m;
  });
  bag.add(B.unregister);

  // The pointer's height on a fixed scale, from the shaft's middle (none) to the distal carpal row (full traction).
  const y0 = P(0, 0, 35)[1], y1 = P(0, 0, 118)[1];
  const mm = (t) => Math.round(D * (1 - t) * MM) + " mm";
  bag.add(pointer(stage, {
    move: ([, y]) => {
      sp.t = clamp((y0 - y) / (y0 - y1), 0, 1);
      read.textContent = mm(sp.t);
      B.wake();
    },
    leave: () => { sp.t = 0; read.textContent = "rest"; B.wake(); },
  }));
  read.textContent = "rest";
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { D = v; drawn = NaN; B.wake(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "barton",
  means: "A volar Barton fracture: the rim fragment and carpus slip volarly; raise the pointer and traction draws them back.",
  rules: [3, 5, 8, 9],
  range: [12, 20, 28],
  mount,
});
