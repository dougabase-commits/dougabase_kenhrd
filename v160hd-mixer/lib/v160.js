'use strict';

// Roland V-160HD LAN 制御クライアント（TCP 8023 / Telnet 形式 ASCII コマンド）
//  - コマンド形式: "CMD:param,param;"（LAN では stx(02H) は省略可）
//  - 応答: 設定系は "ACK;"、取得系は "XXX:a,b;ACK;"、エラーは "ERR:n;"
//  - 実機は応答の ';' の後に LF を付ける
//
// コマンドは 1 本ずつ送り、ACK / ERR を待ってから次を送る（応答の対応付けを確実にするため）。
// 同じ key のコマンドが待ち行列にあれば最新のものだけ残す（フェーダー操作の間引き）。

const net = require('net');
const { EventEmitter } = require('events');

const PRIORITY = { SET: 0, METER: 1, POLL: 2 };
const ERR_TEXT = {
  0: '構文エラー',
  4: '他の設定により無効',
  5: '範囲外の値',
  6: 'stx なし',
};

class V160Client extends EventEmitter {
  constructor() {
    super();
    this.host = '';
    this.port = 8023;
    this.password = '';
    this.socket = null;
    this.status = 'disconnected'; // disconnected | connecting | login | ready
    this.buffer = '';
    this.queue = [];
    this.inflight = null;
    this.reconnectTimer = null;
    this.wantConnected = false;
    this.commandTimeoutMs = 1500;
    this.version = '';
    this._promptSeen = false;
  }

  configure({ host, port, password }) {
    this.host = host || '';
    this.port = Number(port) || 8023;
    this.password = password == null ? '' : String(password);
  }

  start() {
    this.wantConnected = true;
    this._connect();
  }

  stop() {
    this.wantConnected = false;
    clearTimeout(this.reconnectTimer);
    this._teardown('切断しました');
  }

  restart() {
    this.stop();
    this.start();
  }

  _setStatus(status, message = '') {
    this.status = status;
    this.emit('status', { status, message, version: this.version });
  }

  _connect() {
    clearTimeout(this.reconnectTimer);
    if (!this.host) {
      this._setStatus('disconnected', 'V-160HD の IP アドレスを設定してください');
      return;
    }
    this._setStatus('connecting', `${this.host}:${this.port} に接続中…`);
    const sock = net.createConnection({ host: this.host, port: this.port });
    this.socket = sock;
    this.buffer = '';
    this._promptSeen = false;
    sock.setNoDelay(true);
    sock.setEncoding('latin1');
    sock.setTimeout(5000, () => {
      if (this.status === 'connecting') sock.destroy(new Error('接続タイムアウト'));
    });

    sock.on('connect', () => {
      sock.setTimeout(0);
      this._login().catch((e) => {
        this._teardown(`ログイン失敗: ${e.message}`);
        this._scheduleReconnect();
      });
    });
    sock.on('data', (chunk) => this._onData(chunk));
    sock.on('error', (err) => {
      this.emit('log', `socket error: ${err.message}`);
    });
    sock.on('close', () => {
      if (this.socket !== sock) return;
      this._teardown(this.status === 'ready' ? '接続が切れました' : `${this.host}:${this.port} に接続できません`);
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (!this.wantConnected) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._connect(), 3000);
  }

  _teardown(message) {
    const sock = this.socket;
    this.socket = null;
    if (sock) {
      sock.removeAllListeners('close');
      sock.destroy();
    }
    const pending = this.inflight ? [this.inflight, ...this.queue] : this.queue;
    this.inflight = null;
    this.queue = [];
    for (const job of pending) {
      clearTimeout(job.timer);
      job.reject(new Error('disconnected'));
    }
    this._setStatus('disconnected', message);
  }

  async _login() {
    this._setStatus('login', 'ログイン中…');
    // 接続直後にパスワード入力を求められる場合がある（NETWORK PASSWORD 設定時）
    await this._waitForPrompt(1200);
    if (this._promptSeen) this._writeRaw(`${this.password}\n`);

    let ver;
    try {
      ver = await this.send('VER;', { priority: PRIORITY.SET, raw: true, until: 'VER:' });
    } catch (e) {
      // プロンプトが来ないままパスワードが必要なケースへのフォールバック
      if (!this._promptSeen && this.password) {
        this._writeRaw(`${this.password}\n`);
        ver = await this.send('VER;', { priority: PRIORITY.SET, raw: true, until: 'VER:' });
      } else if (this._promptSeen) {
        throw new Error('応答がありません。ネットワークパスワードを確認してください');
      } else {
        throw e;
      }
    }
    const v = (ver.find((t) => t.startsWith('VER:')) || '').slice(4).split(',');
    this.version = v.length >= 2 ? `${v[0]} ${v[1]}` : v[0] || '';
    this._setStatus('ready', '接続済み');
    this.emit('ready');
  }

  _waitForPrompt(ms) {
    return new Promise((resolve) => {
      if (this._promptSeen) return resolve();
      const t = setTimeout(done, ms);
      const onPrompt = () => done();
      this.once('prompt', onPrompt);
      function done() {
        clearTimeout(t);
        resolve();
      }
      // once リスナーの後始末
      setTimeout(() => this.removeListener('prompt', onPrompt), ms + 10);
    });
  }

  _writeRaw(text) {
    if (this.socket && !this.socket.destroyed) this.socket.write(text, 'latin1');
  }

  _onData(chunk) {
    this.buffer += chunk;

    if (this.status === 'login' && /pass(word)?/i.test(this.buffer) && !this.buffer.includes(';')) {
      this._promptSeen = true;
      this.buffer = '';
      this.emit('prompt');
      return;
    }

    let idx;
    while ((idx = this.buffer.indexOf(';')) >= 0) {
      // 制御コード(stx/ack/xon/xoff)と改行を除去
      // バナー等の残骸が前に付いていても行末側だけを使う
      const lines = this.buffer.slice(0, idx).split(/[\r\n]+/);
      const token = lines[lines.length - 1].replace(/[\x00-\x1f]/g, '').trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!token) continue;
      // パスワード入力促しが ';' 付きで来た場合
      if (this.status === 'login' && /pass(word)?/i.test(token) && !/^[A-Z]+:/.test(token)) {
        this._promptSeen = true;
        this.emit('prompt');
        continue;
      }
      this._onToken(token);
    }
    // ';' の来ない残骸（バナー等）が溜まり続けないように
    if (this.buffer.length > 4096) this.buffer = '';
  }

  _onToken(token) {
    const job = this.inflight;
    if (!job) {
      this.emit('unsolicited', token);
      return;
    }
    if (token === 'ACK') {
      this._finish(job, null, job.tokens);
    } else if (token.startsWith('ERR:')) {
      const code = token.slice(4);
      const err = new Error(`${job.cmd.trim()} → ERR:${code} ${ERR_TEXT[code] || ''}`.trim());
      err.code = code;
      this._finish(job, err);
    } else {
      job.tokens.push(token);
      // VER や RQH のように ACK を返さないコマンドは応答トークンで完了
      if (job.until && token.startsWith(job.until)) this._finish(job, null, job.tokens);
    }
  }

  _finish(job, err, result) {
    if (this.inflight !== job) return;
    clearTimeout(job.timer);
    this.inflight = null;
    if (err) job.reject(err);
    else job.resolve(result);
    this._pump();
  }

  /**
   * コマンド送信。戻り値は ACK までに受け取ったトークンの配列。
   * @param {string} cmd 例 "IAL:XLR1,-60;"
   * @param {{priority?:number, key?:string, raw?:boolean, until?:string}} opts
   */
  send(cmd, opts = {}) {
    const priority = opts.priority ?? PRIORITY.POLL;
    const key = opts.key || null;
    if (this.status !== 'ready' && !(opts.raw && this.status === 'login')) {
      return Promise.reject(new Error('not connected'));
    }
    if (!cmd.endsWith(';')) cmd += ';';

    if (key) {
      const existing = this.queue.find((j) => j.key === key);
      if (existing) {
        // 未送信の同種コマンドを最新値で置き換え
        existing.cmd = cmd;
        return existing.promise;
      }
    }

    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job = { cmd, priority, key, until: opts.until || null, resolve, reject, promise, tokens: [], timer: null };
    // 優先度順に挿入（同じ優先度内は FIFO）
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].priority > priority) i--;
    this.queue.splice(i, 0, job);
    this._pump();
    return promise;
  }

  _pump() {
    if (this.inflight || !this.queue.length || !this.socket) return;
    const job = this.queue.shift();
    this.inflight = job;
    job.timer = setTimeout(() => {
      this._finish(job, new Error(`${job.cmd} → タイムアウト`));
    }, this.commandTimeoutMs);
    this.emit('tx', job.cmd);
    this._writeRaw(job.cmd);
  }

  pendingCount(priority) {
    return this.queue.filter((j) => j.priority === priority).length + (this.inflight && this.inflight.priority === priority ? 1 : 0);
  }
}

module.exports = { V160Client, PRIORITY };
