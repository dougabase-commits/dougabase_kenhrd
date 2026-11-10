// 04 — making-of: the real synth code types itself while the real track drives the meters.
const Making = (() => {
  const CODE = tx(`# キックドラム — サンプルは使わず波形から合成
def kick():
    n = int(0.42 * SR); tt = np.arange(n) / SR
    f = 46 + 130 * np.exp(-tt / 0.028)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x = x * np.exp(-tt / 0.13)
    click = hp(rng.standard_normal(n), 3000)
    x += click * np.exp(-tt / 0.004) * 0.25
    return np.tanh(x * 1.8) * 0.9

# サイドチェイン → リバーブ → マスター
mix = (pad + arp + bass) * duck + drums + wet
mix = np.tanh(mix * 1.5)
wavfile.write("music.wav", SR, mix)`).split('\n');
  const L = { head: tx('音楽も、効果音も、コードで合成。'), en: tx('04  MAKING OF — SOUND SYNTHESIS'), file: tx('soundtrack.py'), spec: tx('SPECTRUM — LIVE FROM THIS TRACK'), wave: tx('WAVEFORM'),
    s: [tx('FRAMES RENDERED'), tx('LINES OF CODE'), tx('AUDIO SAMPLES'), tx('EXTERNAL ASSETS')] };
  const KW = /^(def|return|import|from|for|in|if)$/;
  function line(ctx, s, x, y, nchar) {     // tiny syntax highlighter
    ctx.font = `500 25px ${MONO}`; let shown = 0;
    const emit = (tok, col) => { if (shown >= nchar) return; const part = tok.slice(0, nchar - shown); ctx.fillStyle = col; ctx.fillText(part, x, y); x += ctx.measureText(part).width; shown += tok.length; };
    if (s.trimStart().startsWith('#')) return emit(s, '#6f7a8c');
    for (const tok of s.match(/"[^"]*"|[A-Za-z_]\w*|\d+\.?\d*|\s+|./g) || []) {
      emit(tok, tok[0] === '"' ? '#9be39b' : KW.test(tok) ? C.coral : /^\d/.test(tok) ? '#ffc56e' : /^(np|SR|rng|wavfile)$/.test(tok) ? C.sky : /^[A-Za-z_]/.test(tok) ? C.cream : '#8d98ab');
    }
  }
  function panel(ctx, x, y, w, h, title, k) {
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 40);
    ctx.fillStyle = 'rgba(18,21,30,.92)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.strokeStyle = 'rgba(243,238,228,.14)'; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, title, x + 26, y + 40, { font: `700 17px ${MONO}`, fill: '#8d98ab', spacing: '3px' });
  }
  function draw(ctx, f) {
    const lf = f - 960, K = kick(f), out = 1 - prog(lf, 226, 240);
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = .07; ctx.fillStyle = C.cream; for (let x = 60; x < W; x += 60) ctx.fillRect(x, 0, 1, H); for (let y = 60; y < H; y += 60) ctx.fillRect(0, y, W, 1); ctx.restore();
    ctx.save(); ctx.globalAlpha = out;
    reveal(ctx, L.en, 110, 150, 24, prog(lf, 4, 24), { font: `700 24px ${MONO}`, fill: C.coral, spacing: '4px' });
    reveal(ctx, L.head, 108, 232, 64, prog(lf, 8, 32), { font: `900 64px ${SANS}` });
    // editor
    const k0 = E.outExpo(prog(lf, 10, 34)); panel(ctx, 110, 290, 900, 640, '', k0);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = [C.coral, '#ffc56e', '#9be39b'][i]; ctx.beginPath(); ctx.arc(142 + i * 26, 322, 7, 0, 7); ctx.fill(); }
    text(ctx, L.file, 240, 329, { font: `500 18px ${MONO}`, fill: '#8d98ab' });
    let budget = Math.max(0, (lf - 26) * 3.6), cx = 0, cy = 0;
    ctx.textBaseline = 'alphabetic';
    CODE.forEach((s, i) => {
      const y = 392 + i * 35; text(ctx, String(i + 1).padStart(2, ' '), 140, y, { font: `500 25px ${MONO}`, fill: '#3d4656' });
      if (budget > 0) { line(ctx, s, 200, y, budget); ctx.font = `500 25px ${MONO}`; cx = 200 + ctx.measureText(s.slice(0, budget)).width; cy = y; }
      budget -= s.length + 4;
    });
    if (lf % 16 < 10 && cy) { ctx.fillStyle = C.coral; ctx.fillRect(cx + 3, cy - 24, 13, 30); }
    ctx.restore();
    // spectrum
    const k1 = E.outExpo(prog(lf, 16, 40)); panel(ctx, 1050, 290, 760, 300, L.spec, k1 * out);
    const B = AUDIO.bands[f], bw = 708 / B.length;
    for (let i = 0; i < B.length; i++) {
      const h = Math.max(3, B[i] * 215), x = 1076 + i * bw, g = ctx.createLinearGradient(0, 570, 0, 570 - h); g.addColorStop(0, C.blue); g.addColorStop(1, C.coral);
      ctx.fillStyle = g; ctx.fillRect(x, 570 - h, bw - 4, h);
    }
    ctx.restore();
    // waveform
    const k2 = E.outExpo(prog(lf, 22, 46)); panel(ctx, 1050, 610, 760, 150, L.wave, k2 * out);
    const wv = AUDIO.wave[f]; ctx.beginPath(); wv.forEach((v, i) => { const x = 1076 + i * 708 / (wv.length - 1), y = 700 + v * 50; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = C.sky; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
    // stat tiles
    const vals = [TOTAL, STATS.loc, AUDIO.samples, 0];
    for (let i = 0; i < 4; i++) {
      const k = E.outExpo(prog(lf, 30 + i * 6, 54 + i * 6)), x = 1050 + (i % 2) * 390, y = 780 + (i / 2 | 0) * 80; panel(ctx, x, y, 370, 70, '', k * out);
      const n = Math.round(vals[i] * E.outCubic(prog(lf, 40 + i * 6, 120 + i * 6)));
      text(ctx, L.s[i], x + 22, y + 43, { font: `700 15px ${MONO}`, fill: '#8d98ab', spacing: '2px' });
      text(ctx, n.toLocaleString('en-US'), x + 348, y + 48, { font: `900 34px ${SANS}`, fill: i === 3 ? C.coral : C.cream, align: 'right' }); ctx.restore();
    }
    flash(ctx, lf, .4); post(ctx, f, { bloom: .3 + .1 * K, vig: .7 });
  }
  return { init() { }, draw, label: tx('04 / MAKING OF') };
})();
