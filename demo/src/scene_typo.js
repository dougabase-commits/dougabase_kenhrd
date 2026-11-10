// 03 — kinetic typography cut to the beat: one card per beat, then a recap grid, then the punchline.
const Typo = (() => {
  const WORDS = [['企画', 'PLANNING'], ['構成', 'STRUCTURE'], ['デザイン', 'DESIGN'], ['モーション', 'MOTION'], ['3DCG', 'REALTIME 3D'], ['音楽', 'MUSIC'], ['効果音', 'SOUND FX'], ['編集', 'EDITING']].map(w => w.map(tx));
  const PAL = [[C.ink, C.cream, C.coral], [C.coral, C.ink, C.cream], [C.cream, C.ink, C.coral], [C.blue, C.cream, C.ink]];
  const PUNCH = tx('ぜんぶ、コードで。'), PUNCH_EN = tx('EVERY FRAME. EVERY SOUND. WRITTEN, NOT FILMED.'), OF = tx('/ 08');
  function fit(ctx, s, max, size) { ctx.font = `900 ${size}px ${SANS}`; const w = ctx.measureText(s).width; return w > max ? size * max / w : size; }
  function card(ctx, i, lf) {       // lf: frames since this card's beat
    const [bg, fg, ac] = PAL[i % 4], [jp, en] = WORDS[i], k = E.outExpo(prog(lf, 0, 7)), drift = lf / BEAT;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (i % 2 === 0) {            // layout A: giant centred word + outlined echoes
      const size = fit(ctx, jp, 1500, 520);
      ctx.save(); ctx.translate(W / 2, H / 2 + 10); ctx.scale(1 + .05 * drift, 1 + .05 * drift);
      ctx.font = `900 ${size}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.beginPath(); ctx.rect(-W, -size * .62, 2 * W, size * 1.3); ctx.clip();
      ctx.fillStyle = ac; const sh = 16 * E.outExpo(prog(lf, 3, 11)); ctx.fillText(jp, sh, (1 - k) * size * 1.2 + sh);
      ctx.fillStyle = fg; ctx.fillText(jp, 0, (1 - k) * size * 1.2); ctx.restore();
      ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(W - 250, 250, 70 * E.outBack(prog(lf, 2, 10)), 0, 7); ctx.fill();
    } else {                       // layout B: three marquee rows sliding against each other
      const size = 330; ctx.font = `900 ${size}px ${SANS}`; ctx.textBaseline = 'middle'; const gap = 110, w = ctx.measureText(jp).width + gap;
      for (let r = 0; r < 3; r++) {
        const dir = r % 2 ? 1 : -1, off = ((dir * (lf * 14 + (1 - k) * 900) + r * 333) % w + w) % w, y = H / 2 + (r - 1) * 350;
        for (let x = -off - w; x < W + w; x += w) { if (r === 1) { ctx.fillStyle = fg; ctx.fillText(jp, x, y); } else { ctx.lineWidth = 3; ctx.strokeStyle = fg; ctx.globalAlpha = .55; ctx.strokeText(jp, x, y); ctx.globalAlpha = 1; } }
      }
      ctx.fillStyle = ac; ctx.fillRect(0, H / 2 - 178, W * k, 8); ctx.fillRect(W * (1 - k), H / 2 + 170, W * k, 8);
    }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 300, 124);
    text(ctx, `0${i + 1} ${OF}`, 60, 84, { font: `700 30px ${MONO}`, fill: fg, spacing: '4px' });
    ctx.fillStyle = bg; const ew = (ctx.font = `700 34px ${MONO}`, ctx.letterSpacing = '10px', ctx.measureText(en).width); ctx.letterSpacing = '0px';
    ctx.fillRect(W - 90 - ew, H - 118, ew + 50, 66);
    reveal(ctx, en, W - 60, H - 72, 34, prog(lf, 2, 10), { font: `700 34px ${MONO}`, fill: fg, align: 'right', spacing: '10px' });
  }
  function draw(ctx, f) {
    const lf = f - 720;
    if (lf < 120) {
      const i = lf / BEAT | 0, cl = lf % BEAT;
      if (cl < 3 && i > 0) {           // hard wipe from the previous card
        card(ctx, i - 1, BEAT + cl); const p = E.outCubic((cl + 1) / 4);
        ctx.save(); ctx.beginPath(); i % 2 ? ctx.rect(0, 0, W * p, H) : ctx.rect(0, H * (1 - p), W, H * p); ctx.clip(); card(ctx, i, cl); ctx.restore();
      } else card(ctx, i, cl);
    } else if (lf < 180) {             // recap grid lights up on every 8th note
      const g = lf - 120; ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
      const cw = (W - 120) / 4, ch = (H - 200) / 2;
      for (let i = 0; i < 8; i++) {
        const x = 60 + (i % 4) * cw, y = 100 + (i / 4 | 0) * ch, on = g - i * 7.5, k = E.outExpo(prog(on, 0, 6));
        ctx.strokeStyle = 'rgba(243,238,228,.25)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, cw, ch);
        if (on < 0) continue; const [bg, fg] = PAL[(i + 1) % 4];
        ctx.fillStyle = bg; ctx.fillRect(x, y + ch * (1 - k), cw, ch * k);
        const size = fit(ctx, WORDS[i][0], cw - 80, 170);
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
        text(ctx, WORDS[i][0], x + cw / 2, y + ch / 2 + (1 - k) * 200, { font: `900 ${size}px ${SANS}`, fill: fg, align: 'center', base: 'middle' });
        text(ctx, WORDS[i][1], x + 24, y + ch - 26, { font: `700 20px ${MONO}`, fill: fg, spacing: '4px', alpha: k }); ctx.restore();
      }
    } else {                           // punchline
      const g = lf - 180, k = E.outExpo(prog(g, 0, 9)), out = E.inCubic(prog(g, 52, 60));
      ctx.fillStyle = C.coral; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2 - 30); const s = (1.25 - .25 * k) * (1 + g * .0012); ctx.scale(s, s);
      text(ctx, PUNCH, 0, 0, { font: `900 200px ${SANS}`, fill: C.ink, align: 'center', base: 'middle', spacing: '6px' }); ctx.restore();
      ctx.fillStyle = C.ink; ctx.fillRect(W / 2 - 380 * k, H / 2 + 120, 760 * k, 6);
      reveal(ctx, PUNCH_EN, W / 2, H / 2 + 200, 28, prog(g, 8, 20), { font: `700 28px ${MONO}`, fill: C.ink, align: 'center', spacing: '7px' });
      flash(ctx, g, .5);
      if (out > 0) { ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H * out / 2 + 1); ctx.fillRect(0, H - H * out / 2, W, H * out / 2 + 1); }
    }
    post(ctx, f, { bloom: 0, grain: .05, vig: .25 });
  }
  return { init() { }, draw, label: '' };
})();
