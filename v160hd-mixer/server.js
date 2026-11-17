#!/usr/bin/env node
'use strict';

// V-160HD Audio Remote Mixer
// ブラウザ UI <-WebSocket-> このサーバー <-TCP 8023-> V-160HD

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { V160Client, PRIORITY } = require('./lib/v160');
const { INPUTS, OUTPUTS, DEFAULT_METER_ORDER, DEFAULT_STRIPS, LEVEL_MIN, LEVEL_MAX } = require('./lib/channels');

// ---------- 設定 ----------
const CONFIG_PATH = path.join(__dirname, 'config.json');
const STRIP_COUNT = 16;

function defaultConfig() {
  return {
    host: '',
    port: 8023,
    password: '',
    httpPort: 8160,
    meterPoint: 'AFL', // PFL(フェーダー前) / AFL(フェーダー後)
    meterIntervalMs: 100,
    pollIntervalMs: 1000,
    strips: DEFAULT_STRIPS.map((source) => ({ source, name: '' })),
  };
}

function loadConfig() {
  const cfg = defaultConfig();
  try {
    Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (_) {
    /* 初回起動 */
  }
  const valid = new Set(INPUTS.map((i) => i.id));
  const strips = [];
  for (let i = 0; i < STRIP_COUNT; i++) {
    const s = (cfg.strips && cfg.strips[i]) || {};
    strips.push({
      source: valid.has(s.source) ? s.source : DEFAULT_STRIPS[i],
      name: typeof s.name === 'string' ? s.name.slice(0, 16) : '',
    });
  }
  cfg.strips = strips;
  return cfg;
}

// コマンドライン引数で一時的に上書きした接続先はファイルに保存しない
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...config, ...savedConn }, null, 2));
}

const config = loadConfig();
const savedConn = { host: config.host, port: config.port, password: config.password, httpPort: config.httpPort };

// コマンドライン引数で上書き（例: node server.js --host 192.168.0.10 --password 1234）
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const m = argv[i].match(/^--(host|port|password|http-port)$/);
  if (!m || argv[i + 1] == null) continue;
  const v = argv[++i];
  if (m[1] === 'host') config.host = v;
  if (m[1] === 'port') config.port = Number(v);
  if (m[1] === 'password') config.password = v;
  if (m[1] === 'http-port') config.httpPort = Number(v);
}

// ---------- ミキサー状態 ----------
// level: 0.1dB 単位の整数（-800〜100）、null は -INF
const state = {
  inputs: Object.fromEntries(INPUTS.map((c) => [c.id, { level: null, mute: false, solo: false, known: false }])),
  outputs: Object.fromEntries(OUTPUTS.map((c) => [c.id, { level: null, mute: false, known: false }])),
};
let meterOrder = DEFAULT_METER_ORDER.slice();
let meters = {};
const lastTouched = new Map(); // key -> 時刻（操作中の値をポーリングで上書きしないため）
const TOUCH_HOLD_MS = 1500;

const client = new V160Client();
client.configure(config);

function levelToParam(level) {
  return level == null ? '-INF' : String(Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.round(level))));
}
function parseLevel(s) {
  if (s == null || /INF/i.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
function parseOnOff(s) {
  return String(s).toUpperCase() === 'ON';
}

// "IAL:XLR1,-60" → ['XLR1','-60']
function argsOf(tokens, cmd) {
  const t = tokens.find((x) => x.startsWith(cmd + ':'));
  return t ? t.slice(cmd.length + 1).split(',') : null;
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ noServer: true });

function broadcast(msg, except) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws !== except && ws.readyState === 1) ws.send(data);
  }
}

function snapshot() {
  return {
    type: 'snapshot',
    inputs: INPUTS.map(({ id, label }) => ({ id, label })),
    outputs: OUTPUTS.map(({ id, label }) => ({ id, label })),
    inputMeters: Object.fromEntries(INPUTS.map((c) => [c.id, c.meter])),
    outputMeters: Object.fromEntries(OUTPUTS.map((c) => [c.id, c.meter])),
    state,
    config: {
      host: config.host,
      port: config.port,
      hasPassword: !!config.password,
      meterPoint: config.meterPoint,
      strips: config.strips,
    },
    status: { status: client.status, message: '', version: client.version },
  };
}

function patchChannel(kind, id, values, except) {
  const target = kind === 'out' ? state.outputs[id] : state.inputs[id];
  if (!target) return;
  let changed = false;
  for (const [k, v] of Object.entries(values)) {
    if (target[k] !== v) {
      target[k] = v;
      changed = true;
    }
  }
  if (!target.known) {
    target.known = true;
    changed = true;
  }
  if (changed) broadcast({ type: 'channel', kind, id, value: target }, except);
}

function report(err) {
  if (err && err.message !== 'not connected' && err.message !== 'disconnected') {
    broadcast({ type: 'log', level: 'warn', message: err.message });
  }
}

function handleMessage(ws, msg) {
  const kind = msg.kind === 'out' ? 'out' : 'in';
  const list = kind === 'out' ? state.outputs : state.inputs;
  const id = msg.id;
  switch (msg.type) {
    case 'level': {
      if (!list[id]) return;
      const level = msg.level == null ? null : Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.round(msg.level)));
      const key = `${kind}:${id}:level`;
      lastTouched.set(key, Date.now());
      patchChannel(kind, id, { level }, ws);
      const cmd = kind === 'out' ? 'OAL' : 'IAL';
      client.send(`${cmd}:${id},${levelToParam(level)};`, { priority: PRIORITY.SET, key }).catch(report);
      break;
    }
    case 'mute':
    case 'solo': {
      if (!list[id]) return;
      if (msg.type === 'solo' && kind === 'out') return;
      const on = !!msg.on;
      const key = `${kind}:${id}:${msg.type}`;
      lastTouched.set(key, Date.now());
      patchChannel(kind, id, { [msg.type]: on });
      const cmd = msg.type === 'solo' ? 'IAS' : kind === 'out' ? 'OAM' : 'IAM';
      client.send(`${cmd}:${id},${on ? 'ON' : 'OFF'};`, { priority: PRIORITY.SET, key }).catch(report);
      break;
    }
    case 'strip': {
      const i = Number(msg.index);
      if (!(i >= 0 && i < STRIP_COUNT)) return;
      if (msg.source && state.inputs[msg.source]) config.strips[i].source = msg.source;
      if (typeof msg.name === 'string') config.strips[i].name = msg.name.slice(0, 16);
      saveConfig();
      broadcast({ type: 'strips', strips: config.strips });
      break;
    }
    case 'resetStrips': {
      config.strips = DEFAULT_STRIPS.map((source) => ({ source, name: '' }));
      saveConfig();
      broadcast({ type: 'strips', strips: config.strips });
      break;
    }
    case 'meterPoint': {
      if (msg.value === 'PFL' || msg.value === 'AFL') {
        config.meterPoint = msg.value;
        saveConfig();
        broadcast({ type: 'meterPoint', value: config.meterPoint });
      }
      break;
    }
    case 'connect': {
      config.host = String(msg.host || '').trim();
      config.port = Number(msg.port) || 8023;
      if (typeof msg.password === 'string' && msg.password !== '') config.password = msg.password;
      if (msg.clearPassword) config.password = '';
      Object.assign(savedConn, { host: config.host, port: config.port, password: config.password });
      saveConfig();
      client.configure(config);
      client.restart();
      broadcast({ type: 'connection', host: config.host, port: config.port, hasPassword: !!config.password });
      break;
    }
    case 'disconnect':
      client.stop();
      break;
  }
}

// ---------- ポーリング ----------
let polling = false;
async function pollOnce() {
  if (polling || client.status !== 'ready') return;
  polling = true;
  try {
    const now = Date.now();
    const fresh = (key) => now - (lastTouched.get(key) || 0) > TOUCH_HOLD_MS;
    const jobs = [];
    for (const c of INPUTS) {
      jobs.push(
        client.send(`QIAL:${c.id};`).then((t) => {
          const a = argsOf(t, 'IAL');
          if (a && fresh(`in:${c.id}:level`)) patchChannel('in', c.id, { level: parseLevel(a[1]) });
        }),
        client.send(`QIAM:${c.id};`).then((t) => {
          const a = argsOf(t, 'IAM');
          if (a && fresh(`in:${c.id}:mute`)) patchChannel('in', c.id, { mute: parseOnOff(a[1]) });
        }),
        client.send(`QIAS:${c.id};`).then((t) => {
          const a = argsOf(t, 'IAS');
          if (a && fresh(`in:${c.id}:solo`)) patchChannel('in', c.id, { solo: parseOnOff(a[1]) });
        }),
      );
    }
    for (const c of OUTPUTS) {
      jobs.push(
        client.send(`QOAL:${c.id};`).then((t) => {
          const a = argsOf(t, 'OAL');
          if (a && fresh(`out:${c.id}:level`)) patchChannel('out', c.id, { level: parseLevel(a[1]) });
        }),
        client.send(`QOAM:${c.id};`).then((t) => {
          const a = argsOf(t, 'OAM');
          if (a && fresh(`out:${c.id}:mute`)) patchChannel('out', c.id, { mute: parseOnOff(a[1]) });
        }),
      );
    }
    const results = await Promise.allSettled(jobs);
    const firstErr = results.find((r) => r.status === 'rejected');
    if (firstErr) report(firstErr.reason);
  } finally {
    polling = false;
  }
}

let meterBusy = false;
async function meterOnce() {
  if (meterBusy || client.status !== 'ready' || wss.clients.size === 0) return;
  meterBusy = true;
  try {
    const t = await client.send(`MTRLV:${config.meterPoint};`, { priority: PRIORITY.METER, key: 'meter' });
    const a = argsOf(t, 'MTRLV');
    if (!a) return;
    // 応答の先頭に "PFL"/"AFL" が付く場合は読み飛ばす
    const vals = /^[A-Z]FL$/.test(a[0]) ? a.slice(1) : a;
    const out = {};
    vals.forEach((v, i) => {
      const name = meterOrder[i];
      if (name) out[name] = /INF/i.test(v) ? null : Number(v);
    });
    meters = out;
    broadcast({ type: 'meters', values: meters });
  } catch (e) {
    /* メーター取得失敗は無視（次回再試行） */
  } finally {
    meterBusy = false;
  }
}

// 接続時に MTRCH でメーターの並びを実機から取得
async function loadMeterOrder() {
  const order = [];
  try {
    for (let i = 0; i < DEFAULT_METER_ORDER.length; i++) {
      const t = await client.send(`MTRCH:${i};`, { priority: PRIORITY.METER });
      const a = argsOf(t, 'MTRCH');
      if (!a || a.length < 2) throw new Error('bad MTRCH');
      order.push(a[1]);
    }
    meterOrder = order;
  } catch (_) {
    meterOrder = DEFAULT_METER_ORDER.slice();
  }
}

client.on('status', (s) => {
  if (s.status !== 'ready') {
    for (const c of Object.values(state.inputs)) c.known = false;
    for (const c of Object.values(state.outputs)) c.known = false;
  }
  broadcast({ type: 'status', ...s });
  console.log(`[V-160HD] ${s.status}${s.message ? ' - ' + s.message : ''}${s.version ? ' (' + s.version + ')' : ''}`);
});
client.on('ready', async () => {
  await pollOnce();
  broadcast(snapshot());
  loadMeterOrder();
});
client.on('log', (m) => console.log('[V-160HD]', m));

setInterval(pollOnce, Math.max(250, config.pollIntervalMs));
setInterval(meterOnce, Math.max(50, config.meterIntervalMs));

// ---------- HTTP ----------
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(snapshot()));
  ws.send(JSON.stringify({ type: 'status', status: client.status, message: statusMessage(), version: client.version }));
  ws.on('message', (data) => {
    try {
      handleMessage(ws, JSON.parse(data));
    } catch (e) {
      console.error('bad message', e.message);
    }
  });
});

function statusMessage() {
  return { ready: '接続済み', connecting: '接続中…', login: 'ログイン中…' }[client.status] || (config.host ? '未接続' : 'V-160HD の IP アドレスを設定してください');
}

server.listen(config.httpPort, '0.0.0.0', () => {
  console.log('V-160HD Audio Mixer');
  console.log(`  このPC:        http://localhost:${config.httpPort}/`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  同じLANの端末: http://${a.address}:${config.httpPort}/`);
    }
  }
  if (config.host) {
    console.log(`  接続先 V-160HD: ${config.host}:${config.port}`);
    client.start();
  } else {
    console.log('  ブラウザの「接続設定」から V-160HD の IP アドレスを入力してください');
  }
});

process.on('SIGINT', () => {
  client.stop();
  process.exit(0);
});
