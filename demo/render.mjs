// Renders frames with headless Chromium. usage: node render.mjs [--frames 0,100,..] [--workers 4]
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.dirname(fileURLToPath(import.meta.url)), arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const audio = JSON.parse(fs.readFileSync(`${root}/build/audio.json`));
fs.writeFileSync(`${root}/build/audio_data.js`, 'window.AUDIO=' + JSON.stringify(audio));
const srcs = [...fs.readdirSync(`${root}/src`).map(f => `src/${f}`), 'audio/make_audio.py', 'render.mjs', 'build.sh'];
const loc = srcs.reduce((n, f) => n + fs.readFileSync(`${root}/${f}`, 'utf8').split('\n').length, 0);
fs.writeFileSync(`${root}/build/stats.js`, `window.STATS={loc:${loc}}`);
const list = arg('--frames') ? arg('--frames').split(',').map(Number) : [...Array(audio.frames).keys()];
const out = `${root}/build/${arg('--frames') ? 'preview' : 'frames'}`; fs.mkdirSync(out, { recursive: true });
const nw = Math.min(+(arg('--workers') || 4), list.length), browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let done = 0; const t0 = Date.now();
await Promise.all([...Array(nw).keys()].map(async w => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('PAGE', e.message));
  await page.goto(`file://${root}/src/index.html`);
  await page.waitForFunction('window.ready||window.err', null, { timeout: 120000 });
  const err = await page.evaluate('window.err'); if (err) throw new Error(err);
  const a = Math.floor(list.length * w / nw), b = Math.floor(list.length * (w + 1) / nw);   // contiguous chunk per worker
  for (const f of list.slice(a, b)) {
    await page.evaluate(f => window.renderFrame(f), f);
    await page.screenshot({ path: `${out}/f_${String(f).padStart(5, '0')}.png` });
    if (++done % 60 === 0) console.log(`${done}/${list.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}));
await browser.close(); console.log(`rendered ${list.length} frames, ${loc} lines of code`);
