/**
 * Integration tests for the authoritative Socket.IO server.
 * Each suite spawns a real server process on an ephemeral port.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmc-server-test-'));
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
  return { port, proc, logs: () => output, tmpDir };
}

function stopServer(server) {
  return new Promise((resolve) => {
    const cleanup = () => {
      if (server?.tmpDir) fs.rmSync(server.tmpDir, { recursive: true, force: true });
      resolve();
    };
    if (!server || !server.proc || server.proc.exitCode !== null) {
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

async function connect(port, headers = {}) {
  const socket = ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 5000,
    extraHeaders: headers,
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
// Board-size suite (3x3 win, rematch, draw, rejection of other sizes)
// ---------------------------------------------------------------------------
const sized = await startServer();
const sizedSockets = [];
let sized3;

async function createPair(port, size = 3) {
  const host = await connect(port);
  const guest = await connect(port);
  sizedSockets.push(host, guest);
  const trackerHost = tracker(host);
  const created = await request(host, 'room:create', {
    name: 'Mèo Chủ',
    avatar: 'orange',
    size,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const joined = await request(guest, 'room:join', {
    roomId: created.roomId,
    name: 'Mèo Khách',
    avatar: 'gray',
  });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  const playing = await trackerHost.until((s) => s.status === 'playing', 'size round');
  return {
    host,
    guest,
    roomId: created.roomId,
    keyGuest: joined.playerKey,
    state: playing,
    tracker: trackerHost,
    starter: playing.turn,
  };
}

function socketFor(pair, symbol) {
  return symbol === 'A' ? pair.host : pair.guest;
}

function otherSymbol(symbol) {
  return symbol === 'A' ? 'B' : 'A';
}

try {
  await test('room:create validates board size or defaults to 3', async () => {
    const C = await connect(sized.port);
    sizedSockets.push(C);

    for (const size of [9, 2, 4, 5, 6, 7, 8, 3.5, '4', 'Infinite', 0, -3, true, []]) {
      const res = await request(C, 'room:create', { name: 'Mèo Sai', avatar: 'gray', size });
      assert.equal(res.ok, false, `size ${size} should be rejected`);
      assert.equal(res.code, 'UNSUPPORTED_BOARD_SIZE');
      await sleep(120);
    }

    const asString = await request(C, 'room:create', { name: 'Mèo Ba', avatar: 'gray', size: '3' });
    assert.equal(asString.ok, true, JSON.stringify(asString));
    assert.equal(asString.state.size, 3);
    assert.equal(asString.state.board.length, 9);
    const leftString = await request(C, 'room:leave', {});
    assert.equal(leftString.ok, true);

    const created = await request(C, 'room:create', { name: 'Mèo Ba', avatar: 'gray' });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.state.size, 3);
    assert.equal(created.state.winLength, 3);
    assert.equal(created.state.board.length, 9);
    assert.equal(created.state.turnMs, 30000);
    assert.equal(created.state.lastMove, null);

    const left = await request(C, 'room:leave', {});
    assert.equal(left.ok, true);
  });

  await test('3x3 create/join exposes size, win rule and 30s timer', async () => {
    const pair = await createPair(sized.port, 3);
    sized3 = pair;
    assert.equal(pair.state.size, 3);
    assert.equal(pair.state.winLength, 3);
    assert.equal(pair.state.board.length, 9);
    assert.equal(pair.state.turnMs, 30000);
    assert.ok(pair.starter === 'A' || pair.starter === 'B');
  });

  await test('3x3 win uses a 3-cell win line and lastMove', async () => {
    const pair = sized3;
    const winner = pair.starter;
    const loser = otherSymbol(winner);
    const winnerSocket = socketFor(pair, winner);
    const loserSocket = socketFor(pair, loser);
    const over = nextEvent(pair.host, 'game:over');

    for (let col = 0; col < 2; col += 1) {
      await move(winnerSocket, col);
      await move(loserSocket, 6 + col);
    }
    await move(winnerSocket, 2);

    const payload = await over;
    assert.equal(payload.winner, winner);
    assert.equal(payload.reason, 'win');
    assert.deepEqual(payload.winLine, [0, 1, 2]);

    const finished = await pair.tracker.until(
      (s) => s.status === 'finished',
      '3x3 finished'
    );
    assert.equal(finished.size, 3);
    assert.equal(finished.winLength, 3);
    assert.equal(finished.lastMove, 2);
    assert.equal(finished.board.length, 9);
    assert.equal(finished.score[winner], 1);
  });

  await test('rematch keeps the 3x3 board size and alternates starter', async () => {
    const pair = sized3;
    const previousStarter = pair.starter;
    const nextStarter = otherSymbol(previousStarter);
    const restartA = nextEvent(pair.host, 'game:restart');
    const restartB = nextEvent(pair.guest, 'game:restart');

    let res = await request(pair.guest, 'game:rematch', {});
    assert.equal(res.ok, true);

    res = await request(pair.host, 'game:rematch', {});
    assert.equal(res.ok, true);

    const [forHost, forGuest] = await Promise.all([restartA, restartB]);
    assert.equal(forHost.starter, nextStarter);
    assert.equal(forGuest.starter, nextStarter);

    const fresh = await pair.tracker.until(
      (s) => s.status === 'playing' && s.board.every((cell) => cell === null),
      '3x3 fresh round'
    );
    assert.equal(fresh.size, 3);
    assert.equal(fresh.winLength, 3);
    assert.equal(fresh.board.length, 9);
    assert.equal(fresh.turn, nextStarter);
    assert.equal(fresh.lastMove, null);
    pair.starter = nextStarter;
  });

  await test('3x3 draw fills the board without a winner', async () => {
    const starterCells = [0, 1, 6, 5, 8];
    const secondCells = [4, 2, 3, 7];
    const drawPair = await createPair(sized.port, 3);
    const over = nextEvent(drawPair.host, 'game:over');
    const starterSocket = socketFor(drawPair, drawPair.starter);
    const secondSocket = socketFor(drawPair, otherSymbol(drawPair.starter));

    for (let i = 0; i < 4; i += 1) {
      await move(starterSocket, starterCells[i]);
      await move(secondSocket, secondCells[i]);
    }
    await move(starterSocket, starterCells[4]);

    const payload = await over;
    assert.equal(payload.winner, 'draw');
    assert.equal(payload.reason, 'draw');
    assert.equal(payload.winLine, null);

    const finished = await drawPair.tracker.until(
      (s) => s.status === 'finished',
      '3x3 draw'
    );
    assert.equal(finished.size, 3);
    assert.equal(finished.board.every(Boolean), true);
    assert.equal(finished.lastMove, 8);
    assert.equal(finished.score.draw, 1);
  });

  await test('out-of-range moves are rejected on 3x3', async () => {
    const playingMove = await request(
      socketFor(sized3, sized3.starter),
      'game:move',
      { index: 9 }
    );
    assert.equal(playingMove.ok, false);
    assert.equal(playingMove.code, 'invalidMove');
  });
} finally {
  for (const socket of sizedSockets) closeSocket(socket);
  await stopServer(sized);
}

// ---------------------------------------------------------------------------
// Infinite-board suite (sparse coordinates, region, rejoin, rematch)
// ---------------------------------------------------------------------------
const infinite = await startServer();
const infiniteSockets = [];

async function createInfinitePair() {
  const host = await connect(infinite.port);
  const guest = await connect(infinite.port);
  infiniteSockets.push(host, guest);
  const hostTracker = tracker(host);
  const created = await request(host, 'room:create', {
    name: 'Mèo Vô Cực',
    avatar: 'orange',
    size: 'infinite',
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const joined = await request(guest, 'room:join', {
    roomId: created.roomId,
    name: 'Mèo Tinh Tú',
    avatar: 'gray',
  });
  assert.equal(joined.ok, true, JSON.stringify(joined));
  const playing = await hostTracker.until((s) => s.status === 'playing', 'infinite round');
  return {
    host,
    guest,
    roomId: created.roomId,
    keyGuest: joined.playerKey,
    tracker: hostTracker,
    created,
    state: playing,
    starter: playing.turn,
  };
}

async function moveInfinite(socket, x, y) {
  const res = await request(socket, 'game:move', { x, y });
  assert.equal(res.ok, true, `move (${x},${y}) rejected: ${JSON.stringify(res)}`);
  await sleep(120);
}

let infPair;
let winPair;

try {
  await test('infinite create/join exposes sparse region, 5-in-a-row and 45s timer', async () => {
    const C = await connect(infinite.port);
    infiniteSockets.push(C);
    for (const size of ['Infinite', 'INFINITE', '∞']) {
      const res = await request(C, 'room:create', {
        name: 'Mèo Sai',
        avatar: 'gray',
        size,
      });
      assert.equal(res.ok, false, `size ${size} should be rejected`);
      assert.equal(res.code, 'UNSUPPORTED_BOARD_SIZE');
      await sleep(130);
    }

    infPair = await createInfinitePair();
    const waiting = infPair.created.state;
    assert.equal(waiting.size, 'infinite');
    assert.equal(waiting.board, null);
    assert.equal(waiting.winLength, 5);
    assert.deepEqual(waiting.moves, []);
    assert.equal(waiting.moveCount, 0);
    assert.equal(waiting.maxMoves, 2000);
    assert.deepEqual(waiting.region, { minX: -4, maxX: 4, minY: -4, maxY: 4 });
    assert.equal(waiting.lastMove, null);
    assert.equal(waiting.turnMs, 45000);

    const playing = infPair.state;
    assert.equal(playing.size, 'infinite');
    assert.equal(playing.board, null);
    assert.deepEqual(playing.moves, []);
    assert.deepEqual(playing.region, { minX: -4, maxX: 4, minY: -4, maxY: 4 });
    assert.equal(playing.turnMs, 45000);
    assert.ok(playing.turnEndsIn > 0);
    assert.equal(playing.players.length, 2);
  });

  await test('infinite moves are strictly validated and region expands', async () => {
    const W = infPair.starter;
    const O = otherSymbol(W);
    const Ws = socketFor(infPair, W);
    const Os = socketFor(infPair, O);

    let res = await request(Os, 'game:move', { x: 0, y: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'notYourTurn');
    await sleep(130);

    const invalidCoords = [
      { x: '0', y: 0 },
      { x: 0.5, y: 0 },
      { x: null, y: 0 },
      { x: 0 },
      { x: Infinity, y: 0 },
      { x: 0, y: '1' },
    ];
    for (const coords of invalidCoords) {
      res = await request(Ws, 'game:move', coords);
      assert.equal(res.ok, false, `coords ${JSON.stringify(coords)} should be rejected`);
      assert.equal(res.code, 'invalidCoord');
      await sleep(130);
    }

    for (const coords of [{ x: 5, y: 0 }, { x: 0, y: -5 }]) {
      res = await request(Ws, 'game:move', coords);
      assert.equal(res.ok, false);
      assert.equal(res.code, 'coordOutsideRegion');
      await sleep(130);
    }

    await moveInfinite(Ws, 0, 0);
    res = await request(Os, 'game:move', { x: 0, y: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'cellTaken');
    await moveInfinite(Os, 1, 1);

    await moveInfinite(Ws, 4, 4);
    await moveInfinite(Os, 6, 1);

    const expanded = await infPair.tracker.until(
      (s) => s.moveCount === 4,
      'infinite expanded region'
    );
    assert.deepEqual(expanded.region, { minX: -4, maxX: 8, minY: -4, maxY: 6 });
    assert.deepEqual(expanded.moves, [
      { x: 0, y: 0, s: W },
      { x: 1, y: 1, s: O },
      { x: 4, y: 4, s: W },
      { x: 6, y: 1, s: O },
    ]);
    assert.deepEqual(expanded.lastMove, { x: 6, y: 1 });

    const doubleClick = await Promise.all([
      request(Ws, 'game:move', { x: 2, y: 2 }),
      request(Ws, 'game:move', { x: 3, y: 3 }),
    ]);
    assert.equal(doubleClick[0].ok, true);
    assert.equal(doubleClick[1].ok, false);
    assert.equal(doubleClick[1].code, 'notYourTurn');
    await sleep(130);

    await moveInfinite(Os, -4, 0);
    res = await request(Ws, 'game:move', { x: 9, y: 1 });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'coordOutsideRegion');
  });

  await test('infinite win on negative coordinates reports object winLine', async () => {
    winPair = await createInfinitePair();
    const W = winPair.starter;
    const L = otherSymbol(W);
    const Ws = socketFor(winPair, W);
    const Ls = socketFor(winPair, L);
    const overHost = nextEvent(winPair.host, 'game:over');
    const overGuest = nextEvent(winPair.guest, 'game:over');

    const line = [
      { x: -3, y: 0 },
      { x: -2, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const replies = [
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ];
    for (let step = 0; step < 4; step += 1) {
      await moveInfinite(Ws, line[step].x, line[step].y);
      await moveInfinite(Ls, replies[step].x, replies[step].y);
    }
    await moveInfinite(Ws, line[4].x, line[4].y);

    const [forHost, forGuest] = await Promise.all([overHost, overGuest]);
    for (const payload of [forHost, forGuest]) {
      assert.equal(payload.winner, W);
      assert.equal(payload.reason, 'win');
      assert.deepEqual(payload.winLine, line);
    }

    const finished = await winPair.tracker.until(
      (s) => s.status === 'finished',
      'infinite finished'
    );
    assert.equal(finished.size, 'infinite');
    assert.equal(finished.winLength, 5);
    assert.equal(finished.board, null);
    assert.equal(finished.moveCount, 9);
    assert.equal(finished.maxMoves, 2000);
    assert.equal(finished.lastMove.x, 1);
    assert.equal(finished.lastMove.y, 0);
    assert.deepEqual(finished.winLine, line);
    assert.equal(finished.score[W], 1);
    assert.equal(finished.turnEndsIn, null);
  });

  await test('infinite rematch resets the board, keeps the size and alternates starter', async () => {
    const previousStarter = winPair.starter;
    const nextStarter = otherSymbol(previousStarter);
    const restartHost = nextEvent(winPair.host, 'game:restart');
    const restartGuest = nextEvent(winPair.guest, 'game:restart');

    let res = await request(winPair.guest, 'game:rematch', {});
    assert.equal(res.ok, true);
    res = await request(winPair.host, 'game:rematch', {});
    assert.equal(res.ok, true);

    const [forHost, forGuest] = await Promise.all([restartHost, restartGuest]);
    assert.equal(forHost.starter, nextStarter);
    assert.equal(forGuest.starter, nextStarter);

    const fresh = await winPair.tracker.until(
      (s) => s.status === 'playing' && s.moveCount === 0,
      'infinite fresh round'
    );
    assert.equal(fresh.size, 'infinite');
    assert.equal(fresh.board, null);
    assert.equal(fresh.winLength, 5);
    assert.deepEqual(fresh.moves, []);
    assert.deepEqual(fresh.region, { minX: -4, maxX: 4, minY: -4, maxY: 4 });
    assert.equal(fresh.lastMove, null);
    assert.equal(fresh.turn, nextStarter);
    assert.equal(fresh.starter, nextStarter);
    assert.equal(fresh.maxMoves, 2000);
    winPair.starter = nextStarter;
  });

  await test('F5 rejoin restores infinite moves, region, lastMove and turn', async () => {
    const starter = winPair.starter;
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: -4, y: 0 },
      { x: 4, y: -4 },
      { x: 5, y: 5 },
      { x: -6, y: 3 },
    ];
    const expectedMoves = [];
    let turn = starter;
    for (const point of points) {
      expectedMoves.push({ x: point.x, y: point.y, s: turn });
      await moveInfinite(socketFor(winPair, turn), point.x, point.y);
      turn = otherSymbol(turn);
    }

    const beforeDrop = await winPair.tracker.until(
      (s) => s.moveCount === 6,
      'infinite six moves'
    );
    assert.deepEqual(beforeDrop.moves, expectedMoves);
    assert.deepEqual(beforeDrop.region, { minX: -8, maxX: 7, minY: -6, maxY: 7 });
    assert.deepEqual(beforeDrop.lastMove, { x: -6, y: 3 });
    assert.equal(beforeDrop.turn, starter);

    winPair.guest.disconnect();
    await sleep(150);

    const guest2 = await connect(infinite.port);
    infiniteSockets.push(guest2);
    const tracker2 = tracker(guest2);
    const rejoin = await request(guest2, 'room:rejoin', {
      roomId: winPair.roomId,
      playerKey: winPair.keyGuest,
    });
    assert.equal(rejoin.ok, true, JSON.stringify(rejoin));
    assert.equal(rejoin.state.size, 'infinite');
    assert.equal(rejoin.state.board, null);
    assert.equal(rejoin.state.moveCount, 6);
    assert.equal(rejoin.state.maxMoves, 2000);
    assert.deepEqual(rejoin.state.moves, expectedMoves);
    assert.deepEqual(rejoin.state.region, { minX: -8, maxX: 7, minY: -6, maxY: 7 });
    assert.deepEqual(rejoin.state.lastMove, { x: -6, y: 3 });
    assert.equal(rejoin.state.turn, starter);

    const resumed = await tracker2.until((s) => s.status === 'playing', 'infinite resumed');
    assert.deepEqual(resumed.moves, expectedMoves);
    winPair.guest = guest2;
    winPair.tracker = tracker2;

    await moveInfinite(socketFor(winPair, starter), 2, 2);
    const continued = await tracker2.until(
      (s) => s.moveCount === 7,
      'infinite resumed play'
    );
    assert.deepEqual(continued.moves[6], { x: 2, y: 2, s: starter });
    assert.equal(continued.turn, otherSymbol(starter));
  });
} finally {
  for (const socket of infiniteSockets) closeSocket(socket);
  await stopServer(infinite);
}

// ---------------------------------------------------------------------------
// Infinite move-limit suite (small technical limit to force a draw)
// ---------------------------------------------------------------------------
const infLimit = await startServer({ INFINITE_MAX_MOVES: '6' });
const limitSockets = [];

try {
  await test('infinite technical draw at the move limit locks the board', async () => {
    const host = await connect(infLimit.port);
    const guest = await connect(infLimit.port);
    limitSockets.push(host, guest);
    const hostTracker = tracker(host);

    const created = await request(host, 'room:create', {
      name: 'Mèo Giới Hạn',
      avatar: 'calico',
      size: 'infinite',
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.state.maxMoves, 6);

    const joined = await request(guest, 'room:join', {
      roomId: created.roomId,
      name: 'Mèo Đếm',
      avatar: 'cream',
    });
    assert.equal(joined.ok, true, JSON.stringify(joined));

    const playing = await hostTracker.until((s) => s.status === 'playing', 'limit round');
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
      { x: -2, y: 0 },
      { x: -2, y: 2 },
    ];
    let turn = playing.turn;
    for (let step = 0; step < 5; step += 1) {
      await moveInfinite(turn === 'A' ? host : guest, points[step].x, points[step].y);
      turn = otherSymbol(turn);
    }

    const beforeLimit = await hostTracker.until(
      (s) => s.moveCount === 5,
      'five infinite moves'
    );
    assert.equal(beforeLimit.status, 'playing');
    assert.equal(beforeLimit.maxMoves, 6);

    const over = nextEvent(host, 'game:over');
    await moveInfinite(turn === 'A' ? host : guest, points[5].x, points[5].y);
    const payload = await over;
    assert.equal(payload.winner, 'draw');
    assert.equal(payload.reason, 'maxMoves');
    assert.equal(payload.winLine, null);

    const finished = await hostTracker.until(
      (s) => s.status === 'finished',
      'infinite maxMoves draw'
    );
    assert.equal(finished.moveCount, 6);
    assert.equal(finished.maxMoves, 6);
    assert.equal(finished.score.draw, 1);
    assert.deepEqual(finished.lastMove, points[5]);

    const afterLimit = await request(turn === 'A' ? host : guest, 'game:move', {
      x: 3,
      y: 3,
    });
    assert.equal(afterLimit.ok, false);
    assert.equal(afterLimit.code, 'gameNotPlaying');
  });
} finally {
  for (const socket of limitSockets) closeSocket(socket);
  await stopServer(infLimit);
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

  await test('infinite timeout also auto-plays instead of forfeiting', async () => {
    const T3 = await connect(timed.port);
    const T4 = await connect(timed.port);
    timerSockets.push(T3, T4);
    const stateT3 = tracker(T3);

    const created = await request(T3, 'room:create', {
      name: 'Mèo Vô Cực',
      avatar: 'cream',
      size: 'infinite',
    });
    assert.equal(created.ok, true);
    assert.equal(created.state.size, 'infinite');
    assert.equal(created.state.turnMs, 700);

    const joined = await request(T4, 'room:join', {
      roomId: created.roomId,
      name: 'Mèo Khách Vô Cực',
      avatar: 'tabby',
    });
    assert.equal(joined.ok, true);

    const timedOut = await nextEvent(T3, 'game:timeout', 6000);
    assert.ok(timedOut.symbol === 'A' || timedOut.symbol === 'B');

    const auto = await stateT3.until(
      (s) => Array.isArray(s.moves) && s.moves.length > 0,
      'infinite auto move',
      4000
    );
    assert.equal(auto.size, 'infinite');
    assert.equal(auto.moves.length, 1);
    assert.equal(auto.moves[0].s, timedOut.symbol);
    assert.equal(auto.status, 'playing');
    assert.equal(auto.winner, null);
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
// Account identity on the socket
// ---------------------------------------------------------------------------
const accountServer = await startServer();
let accountHost;
let accountRival;
let accountGuest;
let hostCookie;

async function registerAccount(port, username, displayName = 'Tên Tài Khoản') {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({
      username,
      password: 'MeowPass123!',
      displayName,
      avatar: 'calico',
    }),
  });
  assert.equal(res.status, 201);
  const cookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')];
  const cookie = String(cookies.filter(Boolean).join(';')).split(';')[0];
  assert.match(cookie, /^mmc_sid=/);
  return cookie;
}

try {
  await test('socket identity comes from the session cookie, not the client name', async () => {
    hostCookie = await registerAccount(accountServer.port, 'Meo_Socket', 'Mèo Tài Kho');
    accountHost = await connect(accountServer.port, { Cookie: hostCookie });
    const created = await request(accountHost, 'room:create', {
      name: 'Tên Giả',
      avatar: 'black',
      size: 3,
    });
    assert.equal(created.ok, true);
    assert.equal(created.state.players[0].name, 'Mèo Tài Kho');
    assert.equal(created.state.players[0].avatar, 'calico');
    assert.equal(created.state.players[0].userId, undefined);
  });

  await test('the same account cannot take both seats', async () => {
    const cookie = await registerAccount(accountServer.port, 'Meo_Second', 'Mèo Hai');
    const rivalHost = await connect(accountServer.port, { Cookie: cookie });
    const created = await request(rivalHost, 'room:create', { name: 'Mèo Hai', size: 3 });
    assert.equal(created.ok, true);
    // Reuse the token by opening a second socket for the same account.
    accountRival = await connect(accountServer.port, { Cookie: cookie });
    const join = await request(accountRival, 'room:join', {
      roomId: created.roomId,
      name: 'Mèo Hai',
    });
    assert.equal(join.ok, false);
    assert.equal(join.code, 'accountInRoom');
    closeSocket(rivalHost);
  });

  await test('guests can still join an account room with their own name', async () => {
    closeSocket(accountHost);
    accountHost = await connect(accountServer.port, { Cookie: hostCookie });
    const created = await request(accountHost, 'room:create', {
      name: 'Tên Giả',
      size: 3,
    });
    assert.equal(created.ok, true);
    accountGuest = await connect(accountServer.port);
    const join = await request(accountGuest, 'room:join', {
      roomId: created.roomId,
      name: 'Mèo Khách',
      avatar: 'gray',
    });
    assert.equal(join.ok, true);
    const guest = join.state.players.find((player) => player.symbol === 'B');
    assert.equal(guest.name, 'Mèo Khách');
    assert.equal(guest.avatar, 'gray');
  });
} finally {
  closeSocket(accountHost);
  closeSocket(accountRival);
  closeSocket(accountGuest);
  await stopServer(accountServer);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
if (summary.fail > 0) process.exitCode = 1;
