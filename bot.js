const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const https = require('https');
const http = require('http');
const os = require('os');
const { Worker } = require('worker_threads');
const readline = require('readline');
const { showBanner } = require('./utils/banner');

const GREEN = '\x1b[1;32m';
const YELLOW = '\x1b[1;33m';
const RED = '\x1b[1;31m';
const RESET = '\x1b[0m';

const MY_PROJECT = 'Zxoxo Miner';
const BASE = 'https://zxoxo.xyz';

function log_green(msg) { console.log(`${GREEN}${msg}${RESET}`); }
function log_yellow(msg) { console.log(`${YELLOW}${msg}${RESET}`); }
function log_red(msg) { console.log(`${RED}${msg}${RESET}`); }

function load_config() {
  const file = path.join(__dirname, 'config.json');
  const fallback = { settings: { sleep_seconds: 3600 } };
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const seconds = Number(parsed?.settings?.sleep_seconds);
    if (!Number.isFinite(seconds)) return fallback;
    parsed.settings.sleep_seconds = Math.min(86400, Math.max(120, seconds));
    return parsed;
  } catch {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function load_lines(file) {
  if (!fs.existsSync(path.join(__dirname, file))) return [];
  return fs.readFileSync(path.join(__dirname, file), 'utf8').split(/\r?\n/).map(v => v.trim()).filter(v => v && !v.startsWith('#'));
}

function mask_proxy(proxy_url) {
  try {
    const value = proxy_url.split('://').pop();
    const after_at = value.split('@').pop();
    const host_part = after_at.split('@')[0];
    const with_port = host_part.split(':');
    const port = with_port.length > 1 ? `:${with_port.pop()}` : '';
    const host = with_port.join(':');
    const octets = host.split('.');
    let masked_host;
    if (octets.length === 4) masked_host = `${octets[0]}*****${octets[3]}`;
    else if (host.length > 4) masked_host = `${host.slice(0, 2)}*****${host.slice(-2)}`;
    else masked_host = '***';
    return `http://user:pass@${masked_host}${port}`;
  } catch {
    return 'http://user:pass@***';
  }
}

function parse_proxy(proxy_url) {
  let m = proxy_url.match(/^(https?|socks5h?|socks):\/\/(?:([^:@/]+):([^@/]+)@)?([^:/@]+):(\d+)$/i);
  if (m) return { scheme: m[1].toLowerCase(), user: m[2], pass: m[3], host: m[4], port: +m[5] };
  m = proxy_url.match(/^([^:/@]+):(\d+)(?::([^:]+):([^:]+))?$/);
  if (m) return { scheme: 'http', user: m[3], pass: m[4], host: m[1], port: +m[2] };
  return null;
}

function tunnel(proxy, targetHost, targetPort, secure) {
  return new Promise((resolve, reject) => {
    if (!proxy || proxy.scheme.startsWith('socks')) return reject(new Error('unsupported'));
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    socket.setTimeout(20000);
    const fail = (err) => { socket.destroy(); reject(err); };
    socket.once('error', fail);
    socket.once('timeout', () => fail(new Error('the proxy did not answer in time')));
    socket.once('connect', () => {
      const auth = proxy.user ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.user}:${proxy.pass}`).toString('base64')}\r\n` : '';
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}\r\n`);
      let head = '';
      const onData = (chunk) => {
        head += chunk.toString('latin1');
        if (!head.includes('\r\n\r\n')) return;
        socket.off('data', onData);
        socket.setTimeout(0);
        if (!/^HTTP\/1\.[01] 200/.test(head)) return fail(new Error('the proxy refused the tunnel'));
        socket.removeListener('error', fail);
        socket.setTimeout(0);
        resolve(secure ? tls.connect({ socket, servername: targetHost }) : socket);
      };
      socket.on('data', onData);
    });
  });
}

function request(account, method, apiPath, body) {
  return new Promise((resolve) => {
    const url = new URL(BASE + apiPath);
    const secure = url.protocol === 'https:';
    const payload = body ? JSON.stringify(body) : null;
    const send = (socket) => {
      const req = (secure ? https : http).request(
        {
          host: url.hostname,
          port: url.port || (secure ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers: {
            accept: 'application/json',
            'user-agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
            origin: BASE,
            referer: `${BASE}/mine`,
            cookie: account.cookie,
            ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          },
          timeout: 30000,
          createConnection: socket ? (() => socket) : undefined,
          agent: socket ? undefined : (secure ? https.globalAgent : http.globalAgent),
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json = {};
            try { json = JSON.parse(text); } catch {}
            resolve({ status: res.statusCode, json });
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('the server did not answer in time')));
      req.on('error', (e) => resolve({ status: 0, json: {}, error: e.message }));
      if (payload) req.write(payload);
      req.end();
    };
    if (!account.proxy) {
      send(null);
      return;
    }
    tunnel(account.proxy, url.hostname, +url.port || (secure ? 443 : 80), secure)
      .then(send)
      .catch((e) => resolve({ status: 0, json: {}, error: e.message }));
  });
}

const WORKER_SRC = `
const { parentPort } = require('worker_threads');
const crypto = require('crypto');
parentPort.on('message', (job) => {
  const { id, work, bits, budgetMs } = job;
  const prefix = Buffer.from(work + ':', 'utf8');
  const MSG = Buffer.alloc(96);
  prefix.copy(MSG, 0);
  const need = bits;
  const start = Date.now();
  let nonce = 0;
  let hashes = 0;
  for (;;) {
    hashes++;
    const text = String(nonce);
    for (let i = 0; i < text.length; i++) MSG[prefix.length + i] = text.charCodeAt(i);
    const digest = crypto.hash('sha256', MSG.subarray(0, prefix.length + text.length), 'buffer');
    let zeros = 0;
    for (let i = 0; i < digest.length; i++) {
      if (digest[i] === 0) { zeros += 8; continue; }
      zeros += Math.clz32(digest[i] << 24);
      break;
    }
    if (zeros >= need) {
      parentPort.postMessage({ id, type: 'found', nonce: String(nonce), hashes, ms: Date.now() - start });
      break;
    }
    nonce++;
    if (nonce % 20000 === 0 && Date.now() - start > budgetMs) {
      parentPort.postMessage({ id, type: 'idle', hashes, ms: Date.now() - start });
      break;
    }
  }
});
`;

function spawn_miners(count) {
  const workers = [];
  for (let i = 0; i < Math.max(1, count); i++) workers.push(new Worker(WORKER_SRC, { eval: true }));
  return workers;
}

function solve_proof(worker, work, bits, budgetMs = 240000) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = (msg) => {
      if (msg.id !== id) return;
      worker.off('message', onMsg);
      resolve(msg);
    };
    worker.on('message', onMsg);
    worker.postMessage({ id, work, bits, budgetMs });
  });
}

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(`${YELLOW}${prompt}${RESET} `, (a) => { rl.close(); res(a.trim().toUpperCase()); }));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function Account(cookie, proxy, line, worker) {
  this.cookie = cookie;
  this.proxy = proxy ? parse_proxy(proxy) : null;
  this.rawProxy = proxy;
  this.line = line;
  this.worker = worker;
  this.review = false;
}

async function handle_captcha(account) {
  const res = await request(account, 'GET', '/api/mine/check');
  if (!res.json || !res.json.ok) return false;
  const file = path.join(__dirname, `captcha-${account.line}.png`);
  try {
    fs.writeFileSync(file, Buffer.from(String(res.json.image).replace(/^data:[^,]+,/, ''), 'base64'));
  } catch {
    return false;
  }
  log_yellow(`The server asks account on line ${account.line} for a human check, the picture is in ${path.basename(file)}`);
  const answer = await ask(`Type the characters in the picture for line ${account.line} >`);
  const sub = await request(account, 'POST', '/api/mine/check', { token: res.json.token, answer });
  if (sub.json && sub.json.ok) {
    log_green(`The human check for line ${account.line} passed`);
    return true;
  }
  log_red(`The human check for line ${account.line} was rejected`);
  return false;
}

async function mine_once(account) {
  const get = await request(account, 'GET', '/api/mine/proof');
  if (get.status === 401) return { stop: 'signIn' };
  if (!get.json || !get.json.ok) return { error: 'the mining job could not be read' };
  const job = get.json;
  const found = await solve_proof(account.worker, job.work, job.bits);
  if (found.type !== 'found') return { error: 'no nonce was found in the time allowed' };
  const hps = Math.round(found.hashes / Math.max(0.001, found.ms / 1000));
  const post = await request(account, 'POST', '/api/mine/proof', {
    token: job.token,
    nonce: Number(found.nonce),
    device: { cores: os.cpus().length, mem: 8, hps, mobile: false, wd: false },
  });
  if (post.status === 401) return { stop: 'signIn' };
  const body = post.json || {};
  if (body.error === 'account_review') {
    account.review = true;
    return { error: 'the account is under review' };
  }
  if (body.error === 'verify' || body.error === 'paused') {
    const passed = await handle_captcha(account);
    return passed ? { retry: true } : { error: 'the human check did not pass' };
  }
  if (body.ok) {
    log_green(`Account on line ${account.line} found a nonce with ${hps} hashes a second`);
    return { next: Boolean(body.next && body.next.work) };
  }
  return { error: `the proof was not accepted (${body.error || 'the server gave no reason'})` };
}


async function claim_mined(account) {
  const res = await request(account, 'POST', '/api/mine/act', { type: 'claim' });
  if (res.status === 401) return { stop: 'signIn' };
  const body = res.json || {};
  if (body.error === 'nothing_to_claim') {
    log_yellow(`Nothing was available to claim yet for line ${account.line}, give the rigs a minute`);
    return {};
  }
  if (body.error === 'link_wallet_first' || body.error === 'wallet_mismatch') {
    log_red(`Claim for line ${account.line} needs a linked wallet first, the claim was skipped`);
    return {};
  }
  if (!body.ok) {
    log_red(`The claim for line ${account.line} was refused by the server`);
    return {};
  }
  const credited = body.credited ?? body.amount ?? body.balance;
  if (credited != null) log_green(`Claim credited ${credited} to the balance of line ${account.line}`);
  else log_green(`The claim for line ${account.line} went through`);
  return {};
}

async function run_account(account) {
  if (account.rawProxy) log_yellow(`Using proxy ${mask_proxy(account.rawProxy)}`);
  if (account.review) {
    log_yellow(`Account on line ${account.line} is still under review and was skipped`);
    return;
  }
  const state = await request(account, 'GET', '/api/mine/state');
  if (state.status === 401) {
    log_red(`Account on line ${account.line} holds an invalid session cookie and was skipped`);
    account.dead = true;
    return;
  }
  if (!state.json || !state.json.ok) {
    log_red('The account state could not be read from the server');
    return;
  }
  const me = state.json.me || {};
  const rigs = Array.isArray(me.rigs) ? me.rigs.length : 0;
  if (me.balance != null) log_green(`Account on line ${account.line} holds ${me.balance} mZXO on ${rigs} rigs`);
  else log_green(`Account on line ${account.line} has ${rigs} rigs on the network`);
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const result = await mine_once(account);
    if (result.stop === 'signIn') {
      log_red(`Account on line ${account.line} holds an invalid session cookie and was skipped`);
      account.dead = true;
      return;
    }
    if (result.error) {
      log_red(`Account on line ${account.line} stopped early: ${result.error}`);
      return;
    }
    await sleep(result.next ? 1000 : 5000);
  }
  const claim = await claim_mined(account);
  if (claim.stop === 'signIn') {
    log_red(`Account on line ${account.line} holds an invalid session cookie and was skipped`);
    account.dead = true;
  }
}

async function countdown(seconds, label) {
  for (let remaining = seconds; remaining > 0; remaining--) {
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    process.stdout.write(`\r${YELLOW}${label} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${RESET}`);
    await sleep(1000);
  }
  console.log();
}

async function main() {
  showBanner(MY_PROJECT);
  const sleep_seconds = load_config().settings.sleep_seconds;
  const lines = load_lines('data.txt');
  const proxies = load_lines('proxy.txt');
  if (!lines.length) {
    log_red('File data.txt is empty and holds no session cookie');
    return;
  }
  const workers = spawn_miners(Math.min(lines.length, Math.max(1, os.cpus().length - 1)));
  const accounts = lines.map((raw, i) => new Account(raw, proxies[i % Math.max(1, proxies.length)] || null, i + 1, workers[i % workers.length]));
  let cycle = 0;
  for (;;) {
    cycle += 1;
    log_yellow(`Starting automation cycle number ${cycle}`);
    for (let i = 0; i < accounts.length; i++) {
      if (i) console.log();
      if (accounts[i].dead) continue;
      await run_account(accounts[i]);
    }
    await countdown(sleep_seconds, 'Next cycle starts in');
    showBanner(MY_PROJECT);
  }
}

process.on('SIGINT', () => {
  console.log(`\n${RED}Script stopped by user${RESET}`);
  process.exit(0);
});

main().catch((error) => {
  log_red(`The program stopped: ${error.message}`);
  process.exit(1);
});
