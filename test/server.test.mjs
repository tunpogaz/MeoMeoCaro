/**
 * Integration tests for the authoritative Socket.IO server.
 * Each suite spawns a real server process on an ephemeral port.
 */
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io as ioClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

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

// ---------------------------------------------------------------------------
// Server / socket helpers
// ---------------------------------------------------------------------------
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
    if (proc.exitCode !== null) {
      throw new Error(`server exited early (${proc.exitCode})\n${readLogs()}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // Server not listening yet.
    }
    await sleep(80);
  }
  throw new Error(`server did not become healthy\n${readLogs()}`);
}

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', ...extraEnv },
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
    throw err;
  }
  return { port, proc, logs: () => output };
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.proc || server.proc.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => server.proc.kill('SIGKILL'), 3000);
    server.proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    server.proc.kill('SIGTERM');
  });
}

async function connect(port) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 5000,
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

function closeSocket(socket) {
  if (socket && socket.connected) socket.disconnect();
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

function nextEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`event timeout: ${event}`));
    }, timeout);
    function handler(payload) {
      clearTimeout(timer);
      resolve(payload);
    }
    socket.once(event, handler);
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
    async until(predicate, label, timeout = 5000) {
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

async function waitUntil(predicate, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error(`condition timeout (${label})`);
}

async function move(socket, index) {
  const res = await request(socket, 'game:move', { index });
  assert.equal(res.ok, true, `move ${index} rejected: ${JSON.stringify(res)}`);
  await sleep(110);
}

// ---------------------------------------------------------------------------
// Main server suite
// ---------------------------------------------------------------------------
const main = await startServer();
const sockets = [];
let A;
let B;
let roomId;
let keyA;
let keyB;
let starter;

try {
  await test('health endpoint and static shell are served', async () => {
    const health = await fetch(`http://127.0.0.1:${main.port}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const page = await fetch(`http://127.0.0.1:${main.port}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') || '', /text\/html/);
    assert.match(await page.text(), /Meo Meo Caro/);
  });

  await test('create sanitizes profile and join normalizes the room code', async () => {
    A = await connect(main.port);
    sockets.push(A);

    const created = await request(A, 'room:create', {
      name: '  Meo   Cam  ',
      avatar: 'dragon',
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    roomId = created.roomId;
    keyA = created.playerKey;
    assert.match(roomId, CODE_RE);
    assert.equal(typeof keyA, 'string');
    assert.ok(keyA.length > 10);

    assert.equal(created.state.status, 'waiting');
    assert.equal(created.state.players.length, 1);
    assert.equal(created.state.players[0].name, 'Meo Cam');
    assert.equal(created.state.players[0].avatar, 'orange');
    assert.equal(created.state.players[0].isYou, true);
    assert.equal(created.state.players[0].symbol, 'A');
    assert.ok(!('playerKey' in created.state.players[0]));
    assert.ok(!JSON.stringify(created.state).includes(keyA));

    B = await connect(main.port);
    sockets.push(B);
    const stateB = tracker(B);
    const messyCode = `${roomId.toLowerCase().slice(0, 2)} ${roomId.toLowerCase().slice(2)}`;
    const joined = await request(B, 'room:join', {
      roomId: messyCode,
      name: 'Mèo Bạc',
      avatar: 'gray',
    });
    assert.equal(joined.ok, true, JSON.stringify(joined));
    assert.equal(joined.roomId, roomId);
    keyB = joined.playerKey;
    assert.notEqual(keyA, keyB);

    const playing = await stateB.until((s) => s.status === 'playing', 'joined round');
    assert.equal(playing.players.length, 2);
    assert.equal(playing.players.find((p) => p.symbol === 'B').name, 'Mèo Bạc');
    assert.equal(playing.players.find((p) => p.symbol === 'B').avatar, 'gray');
    starter = playing.turn;
    assert.ok(starter === 'A' || starter === 'B');
  });

  await test('server rejects wrong turns and invalid indexes', async () => {
    const S = starter === 'A' ? A : B;
    const O = starter === 'A' ? B : A;

    let res = await request(O, 'game:move', { index: 4 });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'notYourTurn');
    await sleep(120);

    for (const index of [9, -1, 1.5, 'x']) {
      res = await request(S, 'game:move', { index });
      assert.equal(res.ok, false, `index ${index} should be rejected`);
      assert.equal(res.code, 'invalidMove');
      await sleep(120);
    }
  });

  await test('A wins with authoritative state, occupied-cell and double-click guards', async () => {
    const stateA = tracker(A);
    assert.ok(B);

    const overA = nextEvent(A, 'game:over');
    const overB = nextEvent(B, 'game:over');

    if (starter === 'A') {
      await move(A, 0);
      let res = await request(B, 'game:move', { index: 0 });
      assert.equal(res.ok, false);
      assert.equal(res.code, 'cellTaken');
      await move(B, 3);

      res = await request(A, 'game:move', { index: 3 });
      assert.equal(res.ok, false);
      assert.equal(res.code, 'cellTaken');

      const doubleClick = Promise.all([
        request(A, 'game:move', { index: 1 }),
        request(A, 'game:move', { index: 2 }),
      ]);
      const [first, second] = await doubleClick;
      assert.equal(first.ok, true);
      assert.equal(second.ok, false);
      assert.equal(second.code, 'notYourTurn');
      await sleep(120);

      await move(B, 4);
    } else {
      await move(B, 3);
      let res = await request(A, 'game:move', { index: 3 });
      assert.equal(res.ok, false);
      assert.equal(res.code, 'cellTaken');
      await move(A, 0);

      res = await request(B, 'game:move', { index: 0 });
      assert.equal(res.ok, false);
      assert.equal(res.code, 'cellTaken');
      await move(B, 5);

      const doubleClick = Promise.all([
        request(A, 'game:move', { index: 1 }),
        request(A, 'game:move', { index: 2 }),
      ]);
      const [first, second] = await doubleClick;
      assert.equal(first.ok, true);
      assert.equal(second.ok, false);
      assert.equal(second.code, 'notYourTurn');
      await sleep(120);

      await move(B, 7);
    }

    await move(A, 2);

    const [overAck, overOther] = await Promise.all([overA, overB]);
    for (const over of [overAck, overOther]) {
      assert.equal(over.winner, 'A');
      assert.equal(over.reason, 'win');
      assert.deepEqual(over.winLine, [0, 1, 2]);
    }

    const finished = await stateA.until((s) => s.status === 'finished', 'finished state');
    assert.equal(finished.board[0], 'A');
    assert.equal(finished.board[1], 'A');
    assert.equal(finished.board[2], 'A');
    assert.deepEqual(finished.winLine, [0, 1, 2]);
    assert.equal(finished.score.A, 1);
    assert.equal(finished.score.B, 0);
    assert.equal(finished.turnEndsIn, null);
  });

  await test('rematch needs both votes and alternates the starter', async () => {
    await sleep(300);
    const stateB = tracker(B);
    const restartA = nextEvent(A, 'game:restart');
    const restartB = nextEvent(B, 'game:restart');

    let res = await request(B, 'game:rematch', {});
    assert.equal(res.ok, true);
    const oneVote = await stateB.until((s) => s.rematchVotes === 1, 'one rematch vote');
    assert.equal(oneVote.youVotedRematch, true);
    assert.equal(oneVote.status, 'finished');

    res = await request(A, 'game:rematch', {});
    assert.equal(res.ok, true);

    const [restartForA, restartForB] = await Promise.all([restartA, restartB]);
    const expectedStarter = starter === 'A' ? 'B' : 'A';
    assert.equal(restartForA.starter, expectedStarter);
    assert.equal(restartForB.starter, expectedStarter);

    const fresh = await stateB.until(
      (s) => s.status === 'playing' && s.board.every((cell) => cell === null),
      'fresh round'
    );
    assert.equal(fresh.turn, expectedStarter);
    assert.equal(fresh.score.A, 1);
    assert.equal(fresh.rematchVotes, 0);
  });

  await test('emote relay works and enforces the cooldown', async () => {
    await sleep(1100);
    const incoming = nextEvent(B, 'emote:received');

    let res = await request(A, 'emote:send', { emote: '😺' });
    assert.equal(res.ok, true);
    const payload = await incoming;
    assert.equal(payload.emote, '😺');
    assert.equal(payload.symbol, 'A');

    res = await request(A, 'emote:send', { emote: '🐟' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'emoteCooldown');
  });

  await test('join rejects invalid, unknown and full rooms', async () => {
    const C = await connect(main.port);
    sockets.push(C);

    let res = await request(C, 'room:join', { roomId: 'ABC', name: 'Mèo C', avatar: 'gray' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'invalidCode');

    const ghost = `${roomId[0] === 'A' ? 'B' : 'A'}${roomId.slice(1)}`;
    assert.match(ghost, CODE_RE);
    assert.notEqual(ghost, roomId);
    res = await request(C, 'room:join', { roomId: ghost, name: 'Mèo C', avatar: 'gray' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'roomNotFound');

    res = await request(C, 'room:join', { roomId, name: 'Mèo C', avatar: 'gray' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'roomFull');

    closeSocket(C);
  });

  await test('disconnect pauses the game and rejoin restores it', async () => {
    const stateA = tracker(A);
    const offline = nextEvent(A, 'room:opponent-disconnected');
    B.disconnect();
    const offlinePayload = await offline;
    assert.equal(offlinePayload.name, 'Mèo Bạc');

    const paused = await stateA.until(
      (s) => s.players.some((p) => !p.isYou && p.connected === false),
      'paused state'
    );
    assert.equal(paused.status, 'playing');
    assert.equal(paused.turnEndsIn, null);

    const B2 = await connect(main.port);
    sockets.push(B2);
    const stateB2 = tracker(B2);
    const back = nextEvent(A, 'room:opponent-reconnected');
    const rejoin = await request(B2, 'room:rejoin', { roomId, playerKey: keyB });
    assert.equal(rejoin.ok, true, JSON.stringify(rejoin));
    assert.equal(rejoin.roomId, roomId);
    const resumed = await back;
    assert.equal(resumed.name, 'Mèo Bạc');

    const state = await stateB2.until((s) => s.status === 'playing', 'rejoined state');
    assert.equal(state.players.length, 2);
    assert.equal(state.players.every((p) => p.connected), true);
    assert.equal(state.youVotedRematch, false);

    const bad = await request(B2, 'room:rejoin', { roomId, playerKey: 'not-a-key' });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'rejoinFailed');
    B = B2;
  });

  await test('opening a new tab replaces the previous socket', async () => {
    const B3 = await connect(main.port);
    sockets.push(B3);
    const stateB3 = tracker(B3);

    const replaced = nextEvent(B, 'room:replaced');
    const rejoin = await request(B3, 'room:rejoin', { roomId, playerKey: keyB });
    assert.equal(rejoin.ok, true, JSON.stringify(rejoin));
    await replaced;

    const state = await stateB3.until((s) => s.status === 'playing', 'replacement state');
    assert.equal(state.players.length, 2);
    assert.equal(state.players.every((p) => p.connected), true);
    B = B3;
  });

  await test('leaving an active room closes it for the opponent', async () => {
    const closed = nextEvent(B, 'room:closed');
    const res = await request(A, 'room:leave', {});
    assert.equal(res.ok, true);
    const payload = await closed;
    assert.equal(payload.reason, 'left');
  });

  await test('creator leaving a waiting room deletes it', async () => {
    const C = await connect(main.port);
    sockets.push(C);
    const created = await request(C, 'room:create', { name: 'Mèo Chờ', avatar: 'cream' });
    assert.equal(created.ok, true);

    const again = await request(C, 'room:create', { name: 'Mèo Chờ', avatar: 'cream' });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'alreadyInRoom');

    const left = await request(C, 'room:leave', {});
    assert.equal(left.ok, true);

    const D = await connect(main.port);
    sockets.push(D);
    const join = await request(D, 'room:join', {
      roomId: created.roomId,
      name: 'Mèo D',
      avatar: 'tabby',
    });
    assert.equal(join.ok, false);
    assert.equal(join.code, 'roomNotFound');
  });
} finally {
  for (const socket of sockets) closeSocket(socket);
  await stopServer(main);
}

// ---------------------------------------------------------------------------
// Turn-timeout suite (short turn timer)
// ---------------------------------------------------------------------------
const timed = await startServer({ TURN_MS: '700' });
const timerSockets = [];

try {
  await test('turn timeout auto-plays a random valid move', async () => {
    const T1 = await connect(timed.port);
    const T2 = await connect(timed.port);
    timerSockets.push(T1, T2);
    const stateT1 = tracker(T1);

    const created = await request(T1, 'room:create', { name: 'Mèo Giờ', avatar: 'orange' });
    assert.equal(created.ok, true);
    const joined = await request(T2, 'room:join', {
      roomId: created.roomId,
      name: 'Mèo Phút',
      avatar: 'black',
    });
    assert.equal(joined.ok, true);

    const timedOut = await nextEvent(T1, 'game:timeout', 6000);
    assert.ok(timedOut.symbol === 'A' || timedOut.symbol === 'B');

    await waitUntil(
      () => stateT1.states.some((s) => s.board.some((cell) => cell !== null)),
      'auto move state',
      4000
    );
    const auto = stateT1.states.find((s) => s.board.some((cell) => cell !== null));
    assert.equal(auto.board.filter((cell) => cell !== null).length, 1);
    assert.equal(auto.board[auto.board.indexOf(timedOut.symbol)], timedOut.symbol);
    assert.notEqual(auto.turn, timedOut.symbol);
    assert.equal(auto.status, 'playing');
  });
} finally {
  for (const socket of timerSockets) closeSocket(socket);
  await stopServer(timed);
}

// ---------------------------------------------------------------------------
// Rate-limit suite
// ---------------------------------------------------------------------------
const limited = await startServer();
let rateSocket;

try {
  await test('per-socket rate limit returns a rateLimit error code', async () => {
    rateSocket = await connect(limited.port);
    const created = await request(rateSocket, 'room:create', {
      name: 'Mèo Nhanh',
      avatar: 'calico',
    });
    assert.equal(created.ok, true);

    const burst = Array.from({ length: 16 }, () => request(rateSocket, 'game:rematch', {}));
    const results = await Promise.all(burst);
    const rejected = results.filter((res) => res && res.code === 'rateLimit');
    assert.ok(rejected.length >= 1, `expected a rateLimit ack, got ${JSON.stringify(results)}`);
    assert.ok(results.some((res) => res && res.code === 'gameNotPlaying'));
  });
} finally {
  closeSocket(rateSocket);
  await stopServer(limited);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
if (summary.fail > 0) process.exitCode = 1;
