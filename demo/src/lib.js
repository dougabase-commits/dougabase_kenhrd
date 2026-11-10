// ---------- shared toolkit: math, fonts, HDR point renderer, post-processing
const W = 1920, H = 1080, FPS = 30, BAR = 60, BEAT = 15, TOTAL = 1620;
const C = { ink: '#07080c', cream: '#f3eee4', coral: '#ff5a3c', blue: '#2f6bff', sky: '#6fd3ff' };
const SANS = '"Inter","Noto Sans JP",sans-serif', MONO = '"JetBrains Mono","Noto Sans JP",monospace';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  outCubic: k => 1 - (1 - k) ** 3, outExpo: k => k >= 1 ? 1 : 1 - 2 ** (-10 * k), inCubic: k => k ** 3,
  inOut: k => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2, outBack: k => k <= 0 ? 0 : 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2,
};
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const kick = f => AUDIO.kick[clamp(f, 0, TOTAL - 1) | 0];

const TEXTS = [];   // every string drawn anywhere registers here so webfont subsets preload
const tx = s => (TEXTS.push(s), s);
async function loadFonts() {
  const all = TEXTS.join('') + ' 0123456789,./:—·%';
  const specs = ['500 20px "Noto Sans JP"', '900 20px "Noto Sans JP"', '500 20px "Inter"', '900 20px "Inter"', '500 20px "JetBrains Mono"', '700 20px "JetBrains Mono"'];
  await Promise.all(specs.map(s => document.fonts.load(s, all))); await document.fonts.ready;
}
function mk(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Sample `count` points from rendered text -> Float32Array [x,y,...]
function sampleText(text, font, cx, cy, count, rand, spacing = '0px') {
  const c = mk(), g = c.getContext('2d', { willReadFrequently: true });
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = spacing; g.fillStyle = '#fff'; g.fillText(text, cx, cy);
  const d = g.getImageData(0, 0, W, H).data, px = [];
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) px.push(i >> 2);
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { const p = px[rand() * px.length | 0]; out[2 * i] = p % W + rand(); out[2 * i + 1] = (p / W | 0) + rand(); }
  return out;
}

// HDR additive point accumulator with bilinear splats + filmic tonemap
class Accum {
  constructor() { this.b = new Float32Array(W * H * 3); this.img = new ImageData(W, H); this.cv = mk(); this.g = this.cv.getContext('2d'); }
  clear() { this.b.fill(0); }
  splat(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return;
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, B = this.b; let o = (yi * W + xi) * 3, w = (1 - fx) * (1 - fy);
    B[o] += r * w; B[o + 1] += g * w; B[o + 2] += b * w; w = fx * (1 - fy); B[o + 3] += r * w; B[o + 4] += g * w; B[o + 5] += b * w;
    o += W * 3; w = (1 - fx) * fy; B[o] += r * w; B[o + 1] += g * w; B[o + 2] += b * w; w = fx * fy; B[o + 3] += r * w; B[o + 4] += g * w; B[o + 5] += b * w;
  }
  draw(ctx, exposure = 1, bg = [7, 8, 12]) {
    const B = this.b, d = this.img.data;
    for (let i = 0, j = 0; i < B.length; i += 3, j += 4) {
      d[j] = bg[0] + 255 * (1 - Math.exp(-B[i] * exposure)); d[j + 1] = bg[1] + 255 * (1 - Math.exp(-B[i + 1] * exposure));
      d[j + 2] = bg[2] + 255 * (1 - Math.exp(-B[i + 2] * exposure)); d[j + 3] = 255;
    }
    this.g.putImageData(this.img, 0, 0); ctx.drawImage(this.cv, 0, 0);
  }
}

// ---------- post: bloom, vignette, grain
const _b1 = mk(W / 4, H / 4), _b2 = mk(W / 8, H / 8), _grain = [];
{ const r = rng(7); for (let k = 0; k < 6; k++) { const c = mk(512, 512), g = c.getContext('2d'), im = g.createImageData(512, 512); for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 150; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); _grain.push(c); } }
const _vig = mk(); { const g = _vig.getContext('2d'), gr = g.createRadialGradient(W / 2, H / 2, H * .6, W / 2, H / 2, H * 1.2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
function post(ctx, f, { bloom = .6, grain = .07, vig = 1 } = {}) {
  if (bloom > 0) {
    const a = _b1.getContext('2d'), b = _b2.getContext('2d');
    a.filter = 'blur(6px) brightness(1.1)'; a.drawImage(ctx.canvas, 0, 0, W / 4, H / 4);
    b.filter = 'blur(14px)'; b.drawImage(ctx.canvas, 0, 0, W / 8, H / 8);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = bloom * .55; ctx.drawImage(_b1, 0, 0, W, H); ctx.globalAlpha = bloom * .6; ctx.drawImage(_b2, 0, 0, W, H); ctx.restore();
  }
  if (vig > 0) { ctx.save(); ctx.globalAlpha = vig; ctx.drawImage(_vig, 0, 0); ctx.restore(); }
  if (grain > 0) {
    const r = rng(f * 977 + 3), t = _grain[f % 6], ox = -(r() * 512 | 0), oy = -(r() * 512 | 0);
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = grain;
    for (let y = oy; y < H; y += 512) for (let x = ox; x < W; x += 512) ctx.drawImage(t, x, y); ctx.restore();
  }
}

// ---------- typographic helpers
function text(ctx, s, x, y, { font, fill = C.cream, align = 'left', base = 'alphabetic', alpha = 1, spacing = '0px' } = {}) {
  ctx.save(); ctx.font = font; ctx.fillStyle = fill; ctx.textAlign = align; ctx.textBaseline = base; ctx.globalAlpha *= alpha; ctx.letterSpacing = spacing; ctx.fillText(s, x, y); ctx.restore();
}
// masked slide-up line reveal; k in 0..1
function reveal(ctx, s, x, y, size, k, o = {}) {
  if (k <= 0) return; const e = E.outExpo(clamp(k));
  ctx.save(); ctx.beginPath(); ctx.rect(0, y - size * 1.05, W, size * 1.4); ctx.clip();
  text(ctx, s, x, y + (1 - e) * size * 1.2, o); ctx.restore();
}
// lower-left caption block shared by scenes. lf = local frame, len = scene length
function caption(ctx, lf, len, no, en, jp) {
  const a = prog(lf, 14, 40), out = 1 - prog(lf, len - 16, len - 4); if (a <= 0 || out <= 0) return;
  ctx.save(); ctx.globalAlpha = out * a; const sg = ctx.createLinearGradient(0, 700, 0, H); sg.addColorStop(0, 'rgba(4,5,9,0)'); sg.addColorStop(1, 'rgba(4,5,9,.8)'); ctx.fillStyle = sg; ctx.fillRect(0, 700, W, 380);
  ctx.globalAlpha = out;
  const y = 905; ctx.fillStyle = C.coral; ctx.fillRect(110, y - 62, 6, 128 * E.outExpo(a));
  reveal(ctx, no + '  ' + en, 140, y - 30, 26, a, { font: `700 26px ${MONO}`, fill: C.coral, spacing: '4px' });
  reveal(ctx, jp, 138, y + 46, 58, prog(lf, 20, 48), { font: `900 58px ${SANS}`, fill: C.cream });
  ctx.restore();
}
function hud(ctx, f, label, col = C.cream) {
  ctx.save(); ctx.globalAlpha = .62 * prog(f, 20, 50) * (1 - prog(f, 1560, 1600));
  text(ctx, HUD_L, 60, 64, { font: `500 17px ${MONO}`, fill: col, spacing: '3px' });
  text(ctx, label, W - 60, 64, { font: `500 17px ${MONO}`, fill: col, align: 'right', spacing: '3px' });
  const s = f / FPS, tc = `00:${String(s | 0).padStart(2, '0')}:${String(f % FPS).padStart(2, '0')}`;
  text(ctx, tc, W - 60, H - 50, { font: `500 17px ${MONO}`, fill: col, align: 'right', spacing: '3px' });
  ctx.fillStyle = col; ctx.globalAlpha *= .35; ctx.fillRect(60, H - 34, W - 120, 1); ctx.globalAlpha *= 2.6; ctx.fillRect(60, H - 35, (W - 120) * f / TOTAL, 3);
  ctx.restore();
}
const HUD_L = tx('FABLE 5.2 — CODE-GENERATED REEL');
function flash(ctx, lf, amt = .55) { const a = amt * Math.exp(-lf / 3.2); if (a < .01) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = '#ffe9dc'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
