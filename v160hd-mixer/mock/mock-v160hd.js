#!/usr/bin/env node
'use strict';

// 実機なしで動作確認するための V-160HD 簡易シミュレーター
//   node mock/mock-v160hd.js [--port 8023] [--password 1234]
// オーディオ関連の Basic control commands (IAL/IAM/IAS/OAL/OAM/MTRLV/MTRCH/VER) のみ対応。

const net = require('net');
const { INPUTS, OUTPUTS, DEFAULT_METER_ORDER } = require('../lib/channels');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : def;
};
const PORT = Number(opt('port', 8023));
const PASSWORD = opt('password', '');

const inputs = Object.fromEntries(INPUTS.map((c) => [c.id, { level: 0, mute: false, solo: false }]));
const outputs = Object.fromEntries(OUTPUTS.map((c) => [c.id, { level: 0, mute: false }]));
inputs.SDI3.level = null; // -INF の例
inputs.HDMI2.mute = true;

const fmtLevel = (l) => (l == null ? '-INF' : String(l));
const parseLevel = (s) => {
  if (/^-INF$/i.test(s)) return null;
  if (!/^-?\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= -800 && n <= 100 ? n : undefined;
};

function meterValues(point) {
  const t = Date.now() / 1000;
  const out = DEFAULT_METER_ORDER.map((name, i) => {
    const m = name.match(/^(IN|OUT)-([A-Z]+\d?)/);
    let ch = m && (m[1] === 'IN' ? inputs[m[2]] : outputs[m[2]]);
    if (name.startsWith('OUT-DSK')) ch = { level: 0, mute: false };
    if (!ch) return '-INF';
    // それっぽく揺れる信号
    let db = -18 + 9 * Math.sin(t * (1.3 + (i % 7) * 0.37) + i) + 4 * Math.sin(t * 7.1 + i * 2.3);
    if (point === 'AFL') {
      if (ch.mute || ch.level == null) return '-INF';
      db += ch.level / 10;
    }
    db = Math.round(Math.max(-80, Math.min(10, db)));
    return db <= -80 ? '-INF' : String(db);
  });
  return out.join(',');
}

function handle(cmd) {
  const m = cmd.match(/^([A-Z]+)(?::(.*))?$/);
  if (!m) return 'ERR:0;';
  const [, code, p = ''] = m;
  const a = p ? p.split(',') : [];
  switch (code) {
    case 'VER':
      return 'VER:V-160HD,3.30;';
    case 'IAL': {
      const ch = inputs[a[0]];
      const l = parseLevel(a[1]);
      if (!ch || l === undefined) return a.length === 2 && ch ? 'ERR:5;' : 'ERR:0;';
      ch.level = l;
      return 'ACK;';
    }
    case 'QIAL':
      return inputs[a[0]] ? `IAL:${a[0]},${fmtLevel(inputs[a[0]].level)};ACK;` : 'ERR:0;';
    case 'IAM':
    case 'IAS': {
      const ch = inputs[a[0]];
      if (!ch) return 'ERR:0;';
      const k = code === 'IAM' ? 'mute' : 'solo';
      ch[k] = a.length > 1 ? a[1] === 'ON' : !ch[k];
      return 'ACK;';
    }
    case 'QIAM':
    case 'QIAS': {
      const ch = inputs[a[0]];
      if (!ch) return 'ERR:0;';
      const k = code === 'QIAM' ? 'mute' : 'solo';
      return `${code.slice(1)}:${a[0]},${ch[k] ? 'ON' : 'OFF'};ACK;`;
    }
    case 'OAL': {
      const ch = outputs[a[0]];
      const l = parseLevel(a[1]);
      if (!ch || l === undefined) return 'ERR:5;';
      ch.level = l;
      return 'ACK;';
    }
    case 'QOAL':
      return outputs[a[0]] ? `OAL:${a[0]},${fmtLevel(outputs[a[0]].level)};ACK;` : 'ERR:0;';
    case 'OAM': {
      const ch = outputs[a[0]];
      if (!ch) return 'ERR:0;';
      ch.mute = a[1] === 'ON';
      return 'ACK;';
    }
    case 'QOAM':
      return outputs[a[0]] ? `OAM:${a[0]},${outputs[a[0]].mute ? 'ON' : 'OFF'};ACK;` : 'ERR:0;';
    case 'MTRLV':
      if (a[0] !== 'PFL' && a[0] !== 'AFL') return 'ERR:0;';
      return `MTRLV:${meterValues(a[0])};ACK;`;
    case 'MTRCH': {
      const i = Number(a[0]);
      return DEFAULT_METER_ORDER[i] ? `MTRCH:${i},${DEFAULT_METER_ORDER[i]};ACK;` : 'ERR:5;';
    }
    default:
      return 'ERR:0;';
  }
}

net
  .createServer((sock) => {
    sock.setEncoding('latin1');
    let authed = !PASSWORD;
    let buf = '';
    console.log('client connected', sock.remoteAddress);
    if (!authed) sock.write('Enter password:');
    sock.on('data', (d) => {
      buf += d;
      if (!authed) {
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        const pw = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (pw === PASSWORD) {
          authed = true;
          sock.write('Welcome to V-160HD.\n');
        } else {
          sock.write('\nEnter password:');
          return;
        }
      }
      let i;
      while ((i = buf.indexOf(';')) >= 0) {
        const cmd = buf.slice(0, i).replace(/[\x00-\x1f]/g, '').trim();
        buf = buf.slice(i + 1);
        if (!cmd) continue;
        const reply = handle(cmd);
        // 実機同様、応答の ';' ごとに LF を付ける
        sock.write(reply.replace(/;/g, ';\n'));
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => console.log('client disconnected'));
  })
  .listen(PORT, () => console.log(`Mock V-160HD listening on :${PORT}${PASSWORD ? ' (password required)' : ''}`));
