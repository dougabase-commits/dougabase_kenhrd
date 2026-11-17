'use strict';

// ===== フェーダーカーブ（位置 0..1 ⇔ dB）=====
// コンソールらしい対数寄りのカーブ。0dB が上から 1/4 付近。
const TAPER = [
  [0.02, -80], [0.10, -60], [0.22, -40], [0.40, -20],
  [0.52, -10], [0.63, -5], [0.75, 0], [0.875, 5], [1.0, 10],
];
const INF_POS = 0.015; // これより下は -INF

function posToDb(p) {
  if (p < INF_POS) return -Infinity;
  if (p <= TAPER[0][0]) return TAPER[0][1];
  for (let i = 1; i < TAPER.length; i++) {
    const [p1, d1] = TAPER[i];
    const [p0, d0] = TAPER[i - 1];
    if (p <= p1) return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
  }
  return 10;
}
function dbToPos(db) {
  if (db == null || db === -Infinity || db < -80) return 0;
  if (db <= TAPER[0][1]) return TAPER[0][0];
  for (let i = 1; i < TAPER.length; i++) {
    const [p1, d1] = TAPER[i];
    const [p0, d0] = TAPER[i - 1];
    if (db <= d1) return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
  }
  return 1;
}
// レベル値（0.1dB 単位の整数、null=-INF）
const levelToDb = (l) => (l == null ? -Infinity : l / 10);
const dbToLevel = (db) => (db === -Infinity ? null : Math.round(Math.max(-80, Math.min(10, db)) * 10));
const fmtLevel = (l) => {
  if (l == null) return '-INF';
  const v = l / 10;
  return (v > 0 ? '+' : '') + v.toFixed(1);
};

// ===== 状態 =====
let ws = null;
let model = null; // サーバーからの snapshot
const stripViews = []; // { kind, id(), el, ... }
let meterValues = {};

const $ = (s, r = document) => r.querySelector(s);
const stripsEl = $('#strips');
const mastersEl = $('#masters');

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ===== WebSocket =====
function connectWs() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/`);
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    setStatus({ status: 'disconnected', message: 'ミキサーサーバーとの接続が切れました（再接続中…）' });
    setTimeout(connectWs, 1500);
  };
}

function onMessage(msg) {
  switch (msg.type) {
    case 'snapshot':
      model = msg;
      build();
      break;
    case 'status':
      setStatus(msg);
      break;
    case 'channel': {
      const list = msg.kind === 'out' ? model.state.outputs : model.state.inputs;
      list[msg.id] = msg.value;
      refreshChannel(msg.kind, msg.id);
      break;
    }
    case 'strips':
      model.config.strips = msg.strips;
      stripViews.filter((v) => v.kind === 'in').forEach((v) => updateStripHead(v));
      stripViews.forEach(refreshView);
      break;
    case 'meters':
      meterValues = msg.values;
      break;
    case 'meterPoint':
      model.config.meterPoint = msg.value;
      $('#meterPoint').value = msg.value;
      break;
    case 'connection':
      Object.assign(model.config, msg);
      break;
    case 'log':
      showBanner(msg.message, 4000);
      break;
  }
}

function setStatus(s) {
  const el = $('#status');
  el.className = `status ${s.status}`;
  const text = s.status === 'ready' ? `接続済み${s.version ? ' — ' + s.version : ''}${model ? ' (' + model.config.host + ')' : ''}` : s.message || s.status;
  $('#statusText').textContent = text;
  if (s.status !== 'ready' && s.message) showBanner(s.message);
  else hideBanner();
}

let bannerTimer = null;
function showBanner(text, ms) {
  const b = $('#banner');
  b.textContent = text;
  b.hidden = false;
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(hideBanner, ms);
}
function hideBanner() {
  $('#banner').hidden = true;
}

// ===== UI 構築 =====
function build() {
  stripsEl.innerHTML = '';
  mastersEl.innerHTML = '';
  stripViews.length = 0;
  $('#meterPoint').value = model.config.meterPoint;

  for (let i = 0; i < 16; i++) {
    const v = createStrip('in', () => model.config.strips[i].source, i);
    stripsEl.appendChild(v.el);
  }
  for (const out of model.outputs) {
    const v = createStrip('out', () => out.id, -1, out.label);
    mastersEl.appendChild(v.el);
  }
  stripViews.forEach(refreshView);
}

function createStrip(kind, getId, index, fixedLabel) {
  const el = $('#stripTpl').content.firstElementChild.cloneNode(true);
  const v = {
    kind, getId, index, el,
    fader: $('.fader', el), cap: $('.cap', el), fill: $('.fill', el),
    db: $('.db', el), mute: $('.mute', el), solo: $('.solo', el),
    meterEl: $('.meter', el), barL: $$('.bar i', el)[0], barR: $$('.bar i', el)[1],
    peakL: $$('.bar b', el)[0], peakR: $$('.bar b', el)[1],
    peak: [{ v: 0, t: 0 }, { v: 0, t: 0 }],
    dragging: false,
    localLevel: null,
  };
  stripViews.push(v);

  // 目盛り
  const scale = $('.scale', el);
  for (const [d, t] of [[10, '+10'], [5, '+5'], [0, '0'], [-5, '-5'], [-10, '-10'], [-20, '-20'], [-40, '-40'], [-60, '-60'], [-Infinity, '∞']]) {
    const s = document.createElement('span');
    s.textContent = t;
    s.style.top = `${(1 - dbToPos(d)) * 100}%`;
    scale.appendChild(s);
  }

  if (kind === 'in') {
    el.querySelector('.num').textContent = `CH ${index + 1}`;
    const src = $('.src', el);
    for (const inp of model.inputs) {
      const o = document.createElement('option');
      o.value = inp.id;
      o.textContent = inp.label;
      src.appendChild(o);
    }
    src.onchange = () => send({ type: 'strip', index, source: src.value });
    const name = $('.name', el);
    name.onchange = () => send({ type: 'strip', index, name: name.value });
    name.onkeydown = (e) => e.key === 'Enter' && name.blur();
    updateStripHead(v);
  } else {
    el.classList.add('master');
    el.querySelector('.num').textContent = 'OUTPUT';
    $('.name-view', el).textContent = fixedLabel;
  }

  // ミュート / ソロ
  v.mute.onclick = () => {
    const ch = channelOf(v);
    if (ch) send({ type: 'mute', kind, id: getId(), on: !ch.mute });
    if (ch) { ch.mute = !ch.mute; refreshChannel(kind, getId()); }
  };
  v.solo.onclick = () => {
    const ch = channelOf(v);
    if (ch) send({ type: 'solo', kind, id: getId(), on: !ch.solo });
    if (ch) { ch.solo = !ch.solo; refreshChannel(kind, getId()); }
  };

  bindFader(v);
  bindDbInput(v);
  return v;
}

function $$(s, r) {
  return Array.from(r.querySelectorAll(s));
}

function updateStripHead(v) {
  const s = model.config.strips[v.index];
  const label = model.inputs.find((i) => i.id === s.source)?.label || s.source;
  $('.src', v.el).value = s.source;
  const nameInput = $('.name', v.el);
  if (document.activeElement !== nameInput) nameInput.value = s.name;
  nameInput.placeholder = label;
  $('.name-view', v.el).textContent = s.name || label;
  $('.name-view', v.el).title = `${label}${s.name ? ' / ' + s.name : ''}`;
  const meters = model.inputMeters[s.source] || [];
  v.meterEl.classList.toggle('mono', meters.length < 2);
}

function channelOf(v) {
  const list = v.kind === 'out' ? model.state.outputs : model.state.inputs;
  return list[v.getId()];
}

function refreshChannel(kind, id) {
  for (const v of stripViews) if (v.kind === kind && v.getId() === id) refreshView(v);
}

function refreshView(v) {
  const ch = channelOf(v);
  if (!ch) return;
  v.el.classList.toggle('unknown', !ch.known);
  v.el.classList.toggle('muted', !!ch.mute);
  v.mute.classList.toggle('on', !!ch.mute);
  v.solo.classList.toggle('on', !!ch.solo);
  if (!v.dragging) setFaderVisual(v, ch.level);
}

function setFaderVisual(v, level) {
  const p = dbToPos(levelToDb(level));
  v.cap.style.top = `${(1 - p) * 100}%`;
  v.fill.style.height = `${p * 100}%`;
  v.db.textContent = fmtLevel(level);
  v.fader.setAttribute('aria-valuetext', fmtLevel(level) + ' dB');
}

// レベル変更（UI→サーバー）。送信は ~30ms に間引き、最後の値は必ず送る。
function setLevel(v, level) {
  const ch = channelOf(v);
  if (!ch) return;
  ch.level = level;
  setFaderVisual(v, level);
  // 同じソースを割り当てた他のストリップも更新
  for (const o of stripViews) if (o !== v && o.kind === v.kind && o.getId() === v.getId()) setFaderVisual(o, level);
  v.pendingLevel = level;
  if (!v.sendTimer) {
    flushLevel(v);
    v.sendTimer = setTimeout(function tick() {
      v.sendTimer = null;
      if (v.pendingLevel !== undefined) flushLevel(v);
    }, 30);
  }
}
function flushLevel(v) {
  send({ type: 'level', kind: v.kind, id: v.getId(), level: v.pendingLevel });
  v.pendingLevel = undefined;
}

function bindFader(v) {
  const f = v.fader;
  let startY = 0, startPos = 0, height = 1;

  f.addEventListener('pointerdown', (e) => {
    if (!channelOf(v)) return;
    e.preventDefault();
    f.setPointerCapture(e.pointerId);
    v.dragging = true;
    f.classList.add('dragging');
    height = f.getBoundingClientRect().height;
    startY = e.clientY;
    startPos = dbToPos(levelToDb(channelOf(v).level));
    f.focus();
  });
  f.addEventListener('pointermove', (e) => {
    if (!v.dragging) return;
    const fine = e.shiftKey ? 0.2 : 1;
    const p = Math.max(0, Math.min(1, startPos - ((e.clientY - startY) / height) * fine));
    if (e.shiftKey) {
      // 微調整モード切替時に基準を取り直す
      startPos = p;
      startY = e.clientY;
    }
    setLevel(v, dbToLevel(posToDb(p)));
  });
  const end = () => {
    if (!v.dragging) return;
    v.dragging = false;
    f.classList.remove('dragging');
  };
  f.addEventListener('pointerup', end);
  f.addEventListener('pointercancel', end);

  // ダブルクリックで 0dB
  f.addEventListener('dblclick', () => setLevel(v, 0));

  // ホイール: 0.5dB（Shift で 0.1dB）
  f.addEventListener('wheel', (e) => {
    e.preventDefault();
    const ch = channelOf(v);
    if (!ch) return;
    const step = e.shiftKey ? 1 : 5;
    nudge(v, e.deltaY < 0 ? step : -step);
  }, { passive: false });

  f.addEventListener('keydown', (e) => {
    const map = { ArrowUp: 5, ArrowDown: -5, PageUp: 50, PageDown: -50 };
    if (e.key in map) {
      e.preventDefault();
      nudge(v, e.shiftKey ? Math.sign(map[e.key]) : map[e.key]);
    } else if (e.key === '0') {
      setLevel(v, 0);
    } else if (e.key === 'm' || e.key === 'M') {
      v.mute.click();
    }
  });
}

function nudge(v, deltaTenths) {
  const ch = channelOf(v);
  let l = ch.level;
  if (l == null) {
    if (deltaTenths < 0) return;
    l = -800;
  } else {
    l += deltaTenths;
    if (l < -800) l = null;
  }
  setLevel(v, l == null ? null : Math.min(100, l));
}

function bindDbInput(v) {
  v.db.addEventListener('dblclick', () => {
    const ch = channelOf(v);
    if (!ch) return;
    const input = document.createElement('input');
    input.value = ch.level == null ? '-inf' : (ch.level / 10).toFixed(1);
    v.db.textContent = '';
    v.db.appendChild(input);
    input.select();
    const done = (commit) => {
      if (commit) {
        const t = input.value.trim().toLowerCase();
        if (/^-?inf/.test(t) || t === '-∞') setLevel(v, null);
        else {
          const n = parseFloat(t);
          if (Number.isFinite(n)) setLevel(v, Math.round(Math.max(-80, Math.min(10, n)) * 10));
        }
      }
      setFaderVisual(v, channelOf(v).level);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.onblur = null; done(true); }
      if (e.key === 'Escape') { input.onblur = null; done(false); }
    };
    input.onblur = () => done(true);
  });
}

// ===== メーター描画 =====
function meterHeight(db) {
  return db == null ? 0 : dbToPos(db) * 100;
}
function drawMeters() {
  const now = performance.now();
  if (model) {
    for (const v of stripViews) {
      const id = v.getId();
      const names = (v.kind === 'out' ? model.outputMeters : model.inputMeters)[id] || [];
      const vals = [meterValues[names[0]], meterValues[names[1] ?? names[0]]];
      [v.barL, v.barR].forEach((bar, i) => {
        const h = meterHeight(vals[i]);
        bar.style.height = `${h}%`;
        const pk = v.peak[i];
        if (h >= pk.v) {
          pk.v = h;
          pk.t = now;
        } else if (now - pk.t > 1500) {
          pk.v = Math.max(h, pk.v - 1.5);
        }
        (i ? v.peakR : v.peakL).style.bottom = `calc(${pk.v}% - 2px)`;
      });
    }
  }
  requestAnimationFrame(drawMeters);
}

// メーターのグラデーションをフェーダー高に合わせる
function syncMeterGradient() {
  const m = document.querySelector('.meter');
  if (m) document.documentElement.style.setProperty('--meter-h', `${m.getBoundingClientRect().height}px`);
}
window.addEventListener('resize', syncMeterGradient);

// ===== ツールバー =====
$('#editBtn').onclick = () => {
  const on = document.body.classList.toggle('editing');
  $('#editBtn').classList.toggle('active', on);
  $('#editBtn').textContent = on ? '編集完了' : 'CH 編集';
};
$('#meterPoint').onchange = (e) => send({ type: 'meterPoint', value: e.target.value });

const dlg = $('#connDialog');
$('#connBtn').onclick = () => {
  $('#cfHost').value = model?.config.host || '';
  $('#cfPort').value = model?.config.port || 8023;
  $('#cfPassword').value = '';
  $('#cfPassword').placeholder = model?.config.hasPassword ? '設定済み（変更する場合のみ入力）' : '未設定（4桁）';
  $('#cfClearPw').checked = false;
  dlg.showModal();
};
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'connect') {
    send({
      type: 'connect',
      host: $('#cfHost').value,
      port: Number($('#cfPort').value) || 8023,
      password: $('#cfPassword').value,
      clearPassword: $('#cfClearPw').checked,
    });
  } else if (dlg.returnValue === 'disconnect') {
    send({ type: 'disconnect' });
  }
});

connectWs();
requestAnimationFrame(() => {
  syncMeterGradient();
  drawMeters();
});
new MutationObserver(syncMeterGradient).observe(stripsEl, { childList: true });
