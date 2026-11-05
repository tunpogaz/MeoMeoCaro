/**
 * Match persistence, history, replay payload, stats and access control.
 * Uses the real Socket.IO server and an isolated SQLite file per run.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io as ioClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const summary = { pass: 0, fail: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function test(name, fn) {
  try {
    await fn();
    summary.pass += 1;
    console.log(`ok ${summary.pass} - ${name}`);
  } catch (err) {
    summary.fail += 1;
    console.error(`not ok - ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, proc, readLogs) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early\n${readLogs()}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(80);
  }
  throw new Error(`server did not become healthy\n${readLogs()}`);
}

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-history-test-'));
  const dbFile = path.join(tmpDir, 'test.db');
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_FILE: dbFile,
      DISABLE_RATE_LIMIT: '1',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  try {
    await waitForHealth(port, proc, () => output);
  } catch (err) {
    proc.kill('SIGKILL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
  return { port, proc, dbFile, tmpDir, logs: () => output };
}

function stopServer(server) {
  return new Promise((resolve) => {
    const cleanup = () => {
      if (server?.tmpDir) fs.rmSync(server.tmpDir, { recursive: true, force: true });
      resolve();
    };
    if (!server?.proc || server.proc.exitCode !== null) {
      cleanup();
      return;
    }
    const timer = setTimeout(() => server.proc.kill('SIGKILL'), 3000);
    server.proc.once('exit', () => {
      clearTimeout(timer);
      cleanup();
    });
    server.proc.kill('SIGTERM');
  });
}

function cookieHeader(res) {
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')];
  return list
    .filter(Boolean)
    .map((item) => item.split(';')[0])
    .join('; ');
}

async function api(server, method, apiPath, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.origin !== false) headers.Origin = `http://127.0.0.1:${server.port}`;
  if (options.cookie) headers.Cookie = options.cookie;
  const res = await fetch(`http://127.0.0.1:${server.port}${apiPath}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, cookie: cookieHeader(res) };
}

const PASSWORD = 'MeowStrong123!';

async function register(server, username, displayName) {
  return api(server, 'POST', '/api/auth/register', {
    body: { username, password: PASSWORD, displayName, avatar: 'calico' },
  });
}

async function connect(port, cookie) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 5000,
    extraHeaders: cookie ? { Cookie: cookie } : {},
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return socket;
}

function request(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), timeout);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function tracker(socket) {
  const states = [];
  socket.on('room:state', (state) => states.push(state));
  return {
    states,
    last() {
      return states.length ? states[states.length - 1] : null;
    },
    async until(predicate, label, timeout = 6000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const current = this.last();
        if (current && predicate(current)) return current;
        await sleep(20);
      }
      throw new Error(`state timeout (${label}); last=${JSON.stringify(this.last())}`);
    },
  };
}

function closeSocket(socket) {
  if (socket && socket.connected) socket.disconnect();
}

/** Plays a fixed win for A (0,1,2) or returns the finished state. */
async function playAWin(hostSocket, guestSocket, stateTracker) {
  // B's filler keeps A's row clear when B happens to start.
  const plans = { A: [0, 1, 2], B: [3, 4, 6] };
  let state = stateTracker.last();
  let filled = (state?.board || []).filter(Boolean).length;
  while (state && state.status === 'playing') {
    const turn = state.turn;
    const choose = plans[turn];
    const index = choose.shift();
    const socket = turn === 'A' ? hostSocket : guestSocket;
    const ack = await request(socket, 'game:move', { index });
    assert.equal(ack.ok, true, JSON.stringify(ack));
    state = await stateTracker.until((next) => {
      const count = (next.board || []).filter(Boolean).length;
      return count > filled;
    }, `move ${turn} at ${index}`);
    filled = (state.board || []).filter(Boolean).length;
  }
  return state;
}

async function playMatch(host) {
  return playAWin(host.socket, host.guestSocket, host.track);
}

async function pollHistory(server, cookie, params, predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    const res = await api(
      server,
      'GET',
      `/api/history?${new URLSearchParams({ limit: '50', ...params }).toString()}`,
      { cookie }
    );
    last = res.data;
    if (res.status === 200 && predicate(res.data)) return res.data;
    await sleep(60);
  }
  throw new Error(`history timeout; last=${JSON.stringify(last)}`);
}

const server = await startServer();
const sockets = [];
let accountA;
let accountB;
let accountC;
let cookieA;
let cookieB;
let cookieC;

async function createRoomAs(cookie, name, size = 3) {
  const socket = await connect(server.port, cookie);
  sockets.push(socket);
  const track = tracker(socket);
  const created = await request(socket, 'room:create', { name, avatar: 'calico', size });
  assert.equal(created.ok, true);
  return { socket, track, roomId: created.roomId, state: created.state };
}

async function joinRoomAs(cookie, name, host) {
  const socket = await connect(server.port, cookie);
  sockets.push(socket);
  const track = tracker(socket);
  const joined = await request(socket, 'room:join', {
    roomId: host.roomId,
    name,
    avatar: 'gray',
  });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  const state = await host.track.until((next) => next.status === 'playing', 'game started');
  host.guestSocket = socket;
  renderPlayable(host, state);
  return { socket, track, joined, state };
}

function renderPlayable(host, state) {
  // State trackers only receive future events; seed the host tracker with the
  // authoritative state returned by the join broadcast when needed.
  if (!host.track.last()) host.track.states.push(state);
}

try {
  await test('guest vs guest matches are not stored', async () => {
    const host = await createRoomAs(null, 'Mèo Khách A');
    const guest = await joinRoomAs(null, 'Mèo Khách B', host);
    await playMatch(host);
    await sleep(400);
    const reg = await register(server, 'Meo_A', 'Mèo A');
    assert.equal(reg.status, 201);
    cookieA = reg.cookie;
    const history = await api(server, 'GET', '/api/history', { cookie: cookieA });
    assert.equal(history.status, 200);
    assert.equal(history.data.items.length, 0);
  });

  await test('a match with one account is saved for that account with a guest snapshot', async () => {
    accountA = await api(server, 'GET', '/api/auth/me', { cookie: cookieA });
    const host = await createRoomAs(cookieA, 'Tên Giả', 3);
    await joinRoomAs(null, 'Mèo Khách', host);
    const finish = await playMatch(host);
    assert.equal(finish.status, 'finished');
    assert.equal(finish.winner, 'A');
    const youSymbol = host.track.last().players.find((player) => player.isYou).symbol;
    assert.equal(youSymbol, 'A');

    const history = await pollHistory(server, cookieA, {}, (data) => data.items.length === 1);
    const item = history.items[0];
    assert.equal(item.size, 3);
    assert.equal(item.winLength, 3);
    assert.equal(item.opponent.name, 'Mèo Khách');
    assert.equal(item.opponent.deleted, false);
    assert.equal(item.result, 'A');
    assert.equal(item.outcome, youSymbol === 'A' ? 'win' : 'loss');
    assert.equal(item.totalMoves, item.firstPlayer === 'A' ? 5 : 6);
    assert.equal(item.endReason, 'win');
    assert.ok(item.firstPlayer === 'A' || item.firstPlayer === 'B');
  });

  await test('replay detail exposes moves and the winning line only to participants', async () => {
    const list = await api(server, 'GET', '/api/history?limit=10', { cookie: cookieA });
    const id = list.data.items[0].id;
    const detail = await api(server, 'GET', `/api/history/${id}`, { cookie: cookieA });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.match.moves.length, detail.data.match.firstPlayer === 'A' ? 5 : 6);
    const expectedMoves =
      detail.data.match.firstPlayer === 'A' ? [0, 3, 1, 4, 2] : [3, 0, 4, 1, 6, 2];
    assert.deepEqual(
      detail.data.match.moves.map((move) => move.i),
      expectedMoves
    );
    assert.ok(Array.isArray(detail.data.match.winLine));
    assert.equal(detail.data.match.winLine.length, 3);
    assert.equal(detail.data.match.players.A.name, 'Mèo A');
    assert.equal(detail.data.match.players.B.name, 'Mèo Khách');

    const outsider = await register(server, 'Meo_C', 'Mèo C');
    assert.equal(outsider.status, 201);
    cookieC = outsider.cookie;
    const forbidden = await api(server, 'GET', `/api/history/${id}`, { cookie: cookieC });
    assert.equal(forbidden.status, 404);
    assert.equal(forbidden.data.code, 'MATCH_NOT_FOUND');
    const anonymous = await api(server, 'GET', `/api/history/${id}`);
    assert.equal(anonymous.status, 401);
    const invalid = await api(server, 'GET', '/api/history?result=nope', { cookie: cookieA });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.code, 'INVALID_RESULT_FILTER');
  });

  await test('history filters, pagination and stats work', async () => {
    const host = await createRoomAs(cookieA, 'Mèo A', 3);
    const joined = await joinRoomAs(null, 'Mèo Khách 2', host);
    await playMatch(host);

    const page1 = await pollHistory(server, cookieA, { limit: '1' }, (data) => data.total === 2);
    assert.equal(page1.page, 1);
    assert.equal(page1.items.length, 1);
    assert.equal(page1.hasMore, true);
    const page2 = await api(server, 'GET', '/api/history?limit=1&page=2', { cookie: cookieA });
    assert.equal(page2.data.items.length, 1);
    assert.equal(page2.data.hasMore, false);

    const winsOnly = await api(server, 'GET', '/api/history?result=win', { cookie: cookieA });
    for (const item of winsOnly.data.items) assert.equal(item.outcome, 'win');
    const draws = await api(server, 'GET', '/api/history?result=draw', { cookie: cookieA });
    assert.equal(draws.data.items.length, 0);
    const size3 = await api(server, 'GET', '/api/history?size=3', { cookie: cookieA });
    assert.equal(size3.data.total, 2);
    const badSize = await api(server, 'GET', '/api/history?size=99', { cookie: cookieA });
    assert.equal(badSize.status, 400);
    assert.equal(badSize.data.code, 'INVALID_SIZE');

    const stats = await api(server, 'GET', '/api/stats', { cookie: cookieA });
    assert.equal(stats.status, 200);
    assert.equal(stats.data.stats.total, 2);
    assert.equal(stats.data.stats.wins + stats.data.stats.losses, 2);
    assert.equal(stats.data.stats.bySize['3'].wins + stats.data.stats.bySize['3'].losses, 2);
  });

  await test('rematch starts a new round and creates a separate record', async () => {
    const list = await api(server, 'GET', '/api/history?limit=50', { cookie: cookieA });
    const host = await createRoomAs(cookieA, 'Mèo A', 3);
    const joined = await joinRoomAs(null, 'Mèo Rematch', host);
    await playMatch(host);
    await pollHistory(server, cookieA, {}, (data) => data.items.length === list.data.items.length + 1);

    const first = await request(host.socket, 'game:rematch', {});
    assert.equal(first.ok, true);
    const second = await request(joined.socket, 'game:rematch', {});
    assert.equal(second.ok, true);
    const restarted = await host.track.until(
      (state) => state.status === 'playing' && state.board.every((cell) => cell === null),
      'rematch restarted'
    );
    assert.equal(restarted.status, 'playing');
    await playMatch(host);
    await pollHistory(
      server,
      cookieA,
      {},
      (data) => data.items.length === list.data.items.length + 2
    );
  });

  await test('finish followed by a disconnect is saved exactly once', async () => {
    const list = await api(server, 'GET', '/api/history?limit=50', { cookie: cookieA });
    const host = await createRoomAs(cookieA, 'Mèo A', 3);
    const joined = await joinRoomAs(null, 'Mèo Rời', host);
    const finish = await playMatch(host);
    assert.equal(finish.status, 'finished');
    closeSocket(joined.socket);
    await sleep(900);
    const after = await api(server, 'GET', '/api/history?limit=50', { cookie: cookieA });
    assert.equal(after.data.items.length, list.data.items.length + 1);
  });

  await test('deleted opponents are shown as anonymized players', async () => {
    const registered = await register(server, 'Meo_B', 'Mèo B');
    assert.equal(registered.status, 201);
    cookieB = registered.cookie;
    const host = await createRoomAs(cookieB, 'Mèo B', 3);
    const joined = await joinRoomAs(cookieA, 'Mèo A', host);
    await playMatch(host);
    const before = await pollHistory(server, cookieA, {}, (data) => data.items[0]?.opponent.name === 'Mèo B');
    assert.equal(before.items[0].opponent.deleted, false);

    const removed = await api(server, 'DELETE', '/api/me', {
      cookie: cookieB,
      body: { password: PASSWORD },
    });
    assert.equal(removed.status, 200);
    const after = await pollHistory(
      server,
      cookieA,
      {},
      (data) => data.items[0]?.opponent.deleted === true
    );
    assert.equal(after.items[0].opponent.name, 'Người chơi đã xóa');
    const statsA = await api(server, 'GET', '/api/stats', { cookie: cookieA });
    assert.ok(statsA.data.stats.total >= 4);
    const statsB = await api(server, 'GET', '/api/stats', { cookie: cookieB });
    assert.equal(statsB.status, 401);
  });
} finally {
  for (const socket of sockets) closeSocket(socket);
  await stopServer(server);
}

console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
if (summary.fail > 0) process.exitCode = 1;
