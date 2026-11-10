// 00 — a 90,000-particle galaxy collapses into the title. Pure function of time.
const Title = (() => {
  const N = 90000, r = rng(11); let tgt, P, acc;
  const T_TITLE = tx('Fable 5.2'), T_SUB = tx('素材ゼロ。すべて、コードから生まれた映像。'), T_EN = tx('NO FOOTAGE · NO STOCK · NO DAW — 100% GENERATED FROM CODE');
  function init(a) {
    acc = a; tgt = sampleText(T_TITLE, `900 330px ${SANS}`, W / 2, 470, N, r, '-6px'); P = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const rad = 50 + 1050 * r() ** .75, arm = (r() * 3 | 0) * 2.094;
      P[6 * i] = arm + rad * .0055 + (r() + r() + r() - 1.5) * .7; P[6 * i + 1] = rad; P[6 * i + 2] = (r() + r() - 1) * (40 + rad * .05);
      P[6 * i + 3] = r(); P[6 * i + 4] = r() * 6.283; P[6 * i + 5] = r();
    }
  }
  function draw(ctx, f) {
    const t = f / FPS; acc.clear();
    const zoom = lerp(1.5, .9, E.outCubic(prog(t, 0, 5))), ct = Math.cos(1.08), st = Math.sin(1.08), hit = t >= 6 ? Math.exp(-(t - 6) / .28) : 0;
    for (let i = 0; i < N; i++) {
      const a0 = P[6 * i], rad = P[6 * i + 1], h = P[6 * i + 2], d = P[6 * i + 3], ph = P[6 * i + 4], u = P[6 * i + 5];
      const a = a0 + t * .55 / (.35 + rad / 420), x3 = Math.cos(a) * rad, z3 = Math.sin(a) * rad;
      const y2 = h * ct - z3 * st, z2 = h * st + z3 * ct, s = 1000 / (1000 + z2 * .55) * zoom;
      const gx = W / 2 + x3 * s, gy = 500 + y2 * s;
      const k = E.inOut(prog(t, 2.9 + 2.0 * d, 4.0 + 2.0 * d));
      let x = gx, y = gy;
      if (k > 0) {
        let tx_ = tgt[2 * i], ty = tgt[2 * i + 1];
        if (hit > .003) { const dx = tx_ - W / 2, dy = ty - 470, l = Math.hypot(dx, dy) + 1; tx_ += dx / l * hit * 90 * u * u; ty += dy / l * hit * 90 * u * u; }
        tx_ += Math.sin(t * 2.1 + ph) * 1.2; ty += Math.cos(t * 1.7 + ph * 1.3) * 1.2;
        const sw = Math.sin(Math.PI * k) * 160 * (u - .3);
        x = lerp(gx, tx_, k) + Math.cos(ph + t * 3) * sw; y = lerp(gy, ty, k) + Math.sin(ph + t * 3) * sw;
      }
      const w = rad / 1100, br = (.4 + 1.6 * u * u * u) * (1 - k) * Math.min(1.6, s * s) + k * .3;
      // coral core -> blue rim in the galaxy; warm white once it becomes type
      const cr = lerp(lerp(1, .25, w), 1, k), cg = lerp(lerp(.42, .55, w), .9, k), cb = lerp(lerp(.25, 1, w), .8, k);
      acc.splat(x, y, cr * br, cg * br, cb * br);
    }
    acc.draw(ctx, 2.4 * prog(t, 0, 1.6));
    const a = prog(t, 5.9, 6.3);
    if (a > 0) text(ctx, T_TITLE, W / 2, 470, { font: `900 330px ${SANS}`, align: 'center', base: 'middle', alpha: a * .9, spacing: '-6px', fill: '#fff4ea' });
    reveal(ctx, T_SUB, W / 2, 760, 54, prog(t, 6.15, 7.0), { font: `900 54px ${SANS}`, align: 'center', spacing: '4px' });
    reveal(ctx, T_EN, W / 2, 836, 20, prog(t, 6.45, 7.3), { font: `500 20px ${MONO}`, align: 'center', fill: C.coral, spacing: '5px' });
    if (t >= 6) flash(ctx, f - 180, .6);
    post(ctx, f, { bloom: .75 });
  }
  return { init, draw, label: tx('00 / TITLE') };
})();
