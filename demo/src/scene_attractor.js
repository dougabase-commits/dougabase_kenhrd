// 02 — Halvorsen strange attractor: 400,000 points integrated with RK4, rendered with depth of field.
const Attractor = (() => {
  const TR = 200, LEN = 2000, N = TR * LEN; let P, J, acc;
  const A = 1.4, fx = (x, y, z) => -A * x - 4 * y - 4 * z - y * y, DT = .0045;
  function init(a) {
    acc = a; P = new Float32Array(N * 4); J = new Float32Array(N * 2); const r = rng(5); let n = 0;
    for (let k = 0; k < TR; k++) {
      let x = -5 + r() * 2, y = r() * 2, z = r() * 2;
      for (let i = -600; i < LEN; i++) {
        const st = (x, y, z) => [fx(x, y, z), fx(y, z, x), fx(z, x, y)];
        const k1 = st(x, y, z), k2 = st(x + k1[0] * DT / 2, y + k1[1] * DT / 2, z + k1[2] * DT / 2), k3 = st(x + k2[0] * DT / 2, y + k2[1] * DT / 2, z + k2[2] * DT / 2), k4 = st(x + k3[0] * DT, y + k3[1] * DT, z + k3[2] * DT);
        x += DT / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += DT / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); z += DT / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        if (i >= 0) { P[4 * n] = x + 2.6; P[4 * n + 1] = y + 2.6; P[4 * n + 2] = z + 2.6; P[4 * n + 3] = Math.min(1, Math.hypot(...k1) / 70); const ja = r() * 6.283, jr = Math.sqrt(r()); J[2 * n] = Math.cos(ja) * jr; J[2 * n + 1] = Math.sin(ja) * jr; n++; }
      }
    }
  }
  function draw(ctx, f) {
    const lf = f - 480, t = lf / FPS, K = kick(f); acc.clear();
    const ay = t * .42 + .6, ax = .5 + .25 * Math.sin(t * .31), cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    // rotate the (1,1,1) symmetry axis toward the viewer first so the three lobes read clearly
    const sc = 46 * lerp(.6, 1, E.outCubic(prog(t, 0, 2.5))) * (1 + .035 * K), dist = 1500, focus = Math.sin(t * .5) * 180;
    const grow = E.inOut(prog(t, 0, 3.2)) * LEN, flow = t * 520;
    for (let k = 0, n = 0; k < TR; k++) for (let i = 0; i < LEN; i++, n++) {
      if (i > grow) { n += LEN - i; break; }
      const X = P[4 * n] * sc, Y = P[4 * n + 1] * sc, Z = P[4 * n + 2] * sc, v = P[4 * n + 3];
      const x1 = X * cy + Z * sy, z1 = -X * sy + Z * cy, y1 = Y * cx - z1 * sx, z2 = Y * sx + z1 * cx, s = dist / (dist + z2);
      const coc = Math.abs(z2 - focus) * .012 + .3, px = W / 2 + x1 * s + J[2 * n] * coc, py = 520 - y1 * s + J[2 * n + 1] * coc;
      // comets of light chase each other along every trajectory
      const ph = ((i + k * 137 - flow) % 500 + 500) % 500, com = ph > 440 ? ((ph - 440) / 60) ** 3 : 0;
      const b = (.05 + .8 * com + .03 * K) * s * s;
      acc.splat(px, py, b * lerp(.16, 1.1, v), b * lerp(.45, .42, v), b * lerp(1.15, .22, v) + b * com * .5);
    }
    acc.draw(ctx, 2.0); flash(ctx, lf);
    caption(ctx, lf, 240, '02', CAP_EN, CAP_JP); post(ctx, f, { bloom: .8 });
  }
  const CAP_EN = tx('MATHEMATICS — STRANGE ATTRACTOR / 400,000 POINTS'), CAP_JP = tx('微分方程式が描く、40万の光。');
  return { init, draw, label: tx('02 / ATTRACTOR') };
})();
