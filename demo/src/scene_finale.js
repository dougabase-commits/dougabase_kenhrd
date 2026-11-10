// 05 — 160,000 particles morph sphere → torus knot → wave field → the title. Pure function of time.
const Finale = (() => {
  const N = 160000; let R, tgt, acc;
  const LINES = [tx('想像を、'), tx('そのまま、'), tx('映像に。')], T_TITLE = 'Fable 5.2';
  const END1 = tx('この映像の全フレームと全サウンドは、'), END2 = tx('Claude Fable 5.2 が書いたコードだけで生成されています。');
  let END3;
  function init(a) {
    acc = a; const r = rng(23); R = new Float32Array(N * 6); for (let i = 0; i < N * 6; i++) R[i] = r();
    tgt = sampleText(T_TITLE, `900 330px ${SANS}`, W / 2, 430, N, r, '-6px');
    END3 = `${TOTAL.toLocaleString('en-US')} FRAMES · ${AUDIO.samples.toLocaleString('en-US')} AUDIO SAMPLES · ${STATS.loc.toLocaleString('en-US')} LINES OF CODE · 0 EXTERNAL ASSETS`;
  }
  function draw(ctx, f) {
    const lf = f - 1200, t = lf / FPS, K = kick(f); acc.clear();
    const ry = t * .7, cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(.42), sx = Math.sin(.42);
    const hit = t >= 8 ? Math.exp(-(t - 8) / .3) : 0, pulse = 1 + .07 * K, TAU = 6.2832;
    for (let i = 0; i < N; i++) {
      const u = R[6 * i], v = R[6 * i + 1], d = R[6 * i + 2], g1 = R[6 * i + 3] - .5, g2 = R[6 * i + 4] - .5, g3 = R[6 * i + 5] - .5;
      const k1 = E.inOut(prog(t, 1.2 + .4 * d, 1.75 + .4 * d)), k2 = E.inOut(prog(t, 3.2 + .4 * d, 3.75 + .4 * d)), k3 = E.inOut(prog(t, 6.0 + 1.0 * d, 7.0 + 1.0 * d));
      let x = 0, y = 0, z = 0;
      if (k1 < 1) {                       // breathing sphere
        const th = TAU * u, ph = Math.acos(1 - 2 * v), rr = 300 * pulse * (1 + .22 * Math.sin(3 * th + t * 2.2) * Math.sin(5 * ph - t * 1.6)) * E.outBack(prog(t, 0, .9));
        x = rr * Math.sin(ph) * Math.cos(th); y = rr * Math.cos(ph); z = rr * Math.sin(ph) * Math.sin(th);
      }
      if (k1 > 0 && k2 < 1) {             // (2,3) torus knot with flowing tube
        const a = TAU * u + t * .35, c = (2 + Math.cos(3 * a)) * 118 * pulse, tw = 30;
        const X = c * Math.cos(2 * a) + g1 * tw, Y = c * Math.sin(2 * a) + g2 * tw, Z = Math.sin(3 * a) * 150 + g3 * tw;
        x = lerp(x, X, k1); y = lerp(y, Y, k1); z = lerp(z, Z, k1);
      }
      if (k2 > 0 && k3 < 1) {             // wave field drawn as a woven grid, ripples on every kick
        let gu = u, gv = v; if (i & 1) gu = Math.round(u * 70) / 70; else gv = Math.round(v * 70) / 70;
        const X = (gu - .5) * 1700, Z = (gv - .5) * 1700, dd = Math.hypot(X, Z);
        const Y = 120 + 70 * Math.sin(X * .011 + t * 2.3) * Math.cos(Z * .013 + t * 1.7) + (40 + 90 * K) * Math.sin(dd * .022 - t * 9) * Math.exp(-dd * .0022);
        x = lerp(x, X, k2); y = lerp(y, Y, k2); z = lerp(z, Z, k2);
      }
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx, s = 1300 / (1300 + z2);
      let px = W / 2 + x1 * s, py = 470 + y1 * s, b = (.11 + .22 * d * d) * s * s * (1 + .5 * K);
      let cr = lerp(1, .2, u), cg = lerp(.4, .55, u), cb = lerp(.22, 1.1, u);
      if (v > .93) { cr = cg = cb = 1.3; }
      if (k3 > 0) {
        let tx_ = tgt[2 * i], ty = tgt[2 * i + 1];
        if (hit > .003) { const dx = tx_ - W / 2, dy = ty - 430, l = Math.hypot(dx, dy) + 1, p = hit * 120 * d * d; tx_ += dx / l * p; ty += dy / l * p; }
        tx_ += Math.sin(t * 2 + u * 40) * 1.1; ty += Math.cos(t * 1.6 + v * 40) * 1.1;
        const sw = Math.sin(Math.PI * k3) * 320 * g1;
        px = lerp(px, tx_, k3) + Math.cos(u * TAU + t * 4) * sw; py = lerp(py, ty, k3) + Math.sin(u * TAU + t * 4) * sw;
        b = lerp(b, .17, k3); cr = lerp(cr, 1, k3); cg = lerp(cg, .9, k3); cb = lerp(cb, .8, k3);
      }
      acc.splat(px, py, cr * b, cg * b, cb * b);
    }
    acc.draw(ctx, 2.2); flash(ctx, lf, .6);
    for (let i = 0; i < 3; i++) {       // one phrase per bar, bottom centre
      const a = [0, 2, 4][i], b = [2, 4, 6.3][i], k = prog(t, a + .15, a + .7) * (1 - prog(t, b - .25, b));
      if (k > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, k * 3); reveal(ctx, LINES[i], W / 2, 968, 84, prog(t, a + .15, a + .7), { font: `900 84px ${SANS}`, align: 'center', spacing: '10px' }); ctx.restore(); }
    }
    if (t >= 8) {
      flash(ctx, lf - 240, .75);
      text(ctx, T_TITLE, W / 2, 430, { font: `900 330px ${SANS}`, align: 'center', base: 'middle', alpha: .9 * prog(t, 7.95, 8.3), spacing: '-6px', fill: '#fff4ea' });
      reveal(ctx, END1, W / 2, 700, 44, prog(t, 8.3, 9.2), { font: `500 44px ${SANS}`, align: 'center', spacing: '3px' });
      reveal(ctx, END2, W / 2, 772, 44, prog(t, 8.55, 9.45), { font: `900 44px ${SANS}`, align: 'center', spacing: '3px' });
      reveal(ctx, END3, W / 2, 862, 19, prog(t, 9.0, 9.9), { font: `500 19px ${MONO}`, align: 'center', fill: C.coral, spacing: '4px' });
    }
    post(ctx, f, { bloom: .8 });
    const fade = prog(t, 12.2, 13.7); if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }
  return { init, draw, label: tx('05 / FINALE') };
})();
