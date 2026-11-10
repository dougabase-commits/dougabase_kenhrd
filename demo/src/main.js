const ctx = document.getElementById('c').getContext('2d');
const SCENES = [[0, Title], [240, Tunnel], [480, Attractor], [720, Typo], [960, Making], [1200, Finale]];
window.renderFrame = f => {
  let sc = SCENES[0][1]; for (const [s, o] of SCENES) if (f >= s) sc = o;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  sc.draw(ctx, f); if (sc.label) hud(ctx, f, sc.label);
};
(async () => { tx('FRAMES AUDIO SAMPLES LINES OF CODE EXTERNAL ASSETS'); await loadFonts(); const acc = new Accum(); for (const [, s] of SCENES) s.init(acc); window.ready = true; })().catch(e => { window.err = String(e.stack || e); });
