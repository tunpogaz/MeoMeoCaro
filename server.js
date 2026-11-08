/**
 * Meo Meo Caro - server Express + Socket.IO
 * Server la nguon su that cho che do online: tu xac thuc luot, o trong,
 * tu tinh thang/hoa, tu quan ly phong, timer va ket noi lai.
 */
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { Server } from 'socket.io';
import { closeDatabase, databaseKind, migrate, query } from './db.js';
import { installAuth, userFromCookieHeader } from './auth.js';
import { installHistory, saveMatchRecord } from './history.js';
import { installTestMailRoutes, mailEnabled, mailProvider, mailStartupWarning } from './mailer.js';
import {
  DEFAULT_BOARD_SIZE,
  INFINITE,
  cellKey,
  checkWinFromMove,
  checkWinInfinite,
  computeRegion,
  createBoard,
  getInfiniteEmptyCells,
  isBoardFull,
  isInRegion,
  isInfiniteSize,
  normalizeBoardSize,
  undoTargetCount,
  winLengthFor,
} from './public/js/game-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '').trim();
const IS_PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = (process.env.TRUST_PROXY || '').trim();

function positiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const UNDO_TIMEOUT_MS = positiveIntEnv('UNDO_TIMEOUT_MS', 15_000);
const UNDO_COOLDOWN_MS = positiveIntEnv('UNDO_COOLDOWN_MS', 10_000);
const UNDO_MAX_REQUESTS = 3;

if (IS_PROD && !String(process.env.SESSION_SECRET || '').trim()) {
  console.error(
    '[mmc] SESSION_SECRET bat buoc khi NODE_ENV=production. Hay dat chuoi ngau nhien >= 32 ky tu.'
  );
  process.exit(1);
}
if (IS_PROD && String(process.env.SESSION_SECRET || '').trim().length < 32) {
  console.error('[mmc] SESSION_SECRET phai dai it nhat 32 ky tu.');
  process.exit(1);
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: CORS_ORIGIN
    ? {
        origin: CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
        methods: ['GET', 'POST'],
      }
    : undefined,
  maxHttpBufferSize: 10_000,
  pingTimeout: 20_000,
  pingInterval: 25_000,
});

app.disable('x-powered-by');
if (TRUST_PROXY) {
  const hops = Number(TRUST_PROXY);
  app.set('trust proxy', Number.isFinite(hops) && hops > 0 ? hops : TRUST_PROXY === '1');
}

// Helmet: cho phep inline style cua Google Fonts va ket noi WebSocket cung origin.
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

app.use(compression());
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders(res, filePath) {
      // Service worker luon duoc kiem tra ban moi
      if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', express.json({ limit: '10kb' }));
installAuth(app);
installHistory(app);
installTestMailRoutes(app);

// Fallback 404 gon gang (khong lo thong tin he thong)
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ ok: false, code: 'BODY_TOO_LARGE' });
    return;
  }
  if (error instanceof SyntaxError || error?.type === 'entity.parse.failed') {
    res.status(400).json({ ok: false, code: 'INVALID_JSON' });
    return;
  }
  console.error('[mmc] request failed', error?.message || error);
  res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
});

// ---------------------------------------------------------------------------
// Hang so tro choi
// ---------------------------------------------------------------------------
const ROOM_TTL = Number(process.env.ROOM_TTL_MS) || 15 * 60 * 1000; // 15 phut
const RECONNECT_GRACE = Number(process.env.RECONNECT_GRACE_MS) || 60 * 1000; // 60 giay
// Test co the dat TURN_MS de rut ngan moi co ban; khi chay that:
// 3x3 = 30 giay, vo cuc = 45 giay.
const TURN_MS_OVERRIDE = Number(process.env.TURN_MS) > 0 ? Number(process.env.TURN_MS) : null;
// Test co the ha gioi han nay de kiem tra hoa ky thuat ma khong phai danh 2000 nuoc.
const MAX_INFINITE_MOVES =
  Number(process.env.INFINITE_MAX_MOVES) > 0
    ? Math.floor(Number(process.env.INFINITE_MAX_MOVES))
    : INFINITE.maxMoves;
const MAX_ROOMS = 1000;
const RATE_LIMIT = 10; // toi da 10 su kien / giay / socket
const EMOTE_COOLDOWN = 2000;
const MAX_NAME = 12;
const MAX_PLAYERS = 2;

const EMOTES = new Set(['😺', '😹', '😿', '🐟', '🧶', '👏']);
const AVATARS = new Set(['orange', 'gray', 'calico', 'black', 'cream', 'tabby']);
// Bo ky tu de nham: 0 O 1 I L
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** @type {Map<string, object>} */
const rooms = new Map();

function turnMsFor(size) {
  if (TURN_MS_OVERRIDE) return TURN_MS_OVERRIDE;
  if (isInfiniteSize(size)) return 45_000;
  return 30_000;
}

// ---------------------------------------------------------------------------
// Tien ich
// ---------------------------------------------------------------------------
function log(...args) {
  console.log('[mmc]', ...args);
}

/** Cat ten, bo the HTML/ky tu dieu khien, toi da 12 ky tu (theo code point). */
function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, MAX_NAME).join('');
}

function sanitizeAvatar(raw) {
  return AVATARS.has(raw) ? raw : 'orange';
}

function normalizeRoomId(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function generateRoomId() {
  let id = '';
  for (let i = 0; i < 5; i += 1) {
    id += ROOM_ALPHABET[crypto.randomInt(0, ROOM_ALPHABET.length)];
  }
  return id;
}

function uniqueRoomId() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = generateRoomId();
    if (!rooms.has(id)) return id;
  }
  // Xac suat trung gan nhu bang 0, nhung van dam bao khong treo
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const id = generateRoomId();
    if (!rooms.has(id)) return id;
  }
  return `${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function createRoom(id, size = DEFAULT_BOARD_SIZE) {
  const safeSize = normalizeBoardSize(size) ?? DEFAULT_BOARD_SIZE;
  const infinite = isInfiniteSize(safeSize);
  return {
    id,
    size: safeSize,
    infinite,
    winLength: winLengthFor(safeSize),
    players: [],
    board: infinite ? null : createBoard(safeSize),
    cells: infinite ? new Map() : null,
    moves: infinite ? [] : null,
    region: infinite ? computeRegion([]) : null,
    lastMove: null,
    turn: 'A',
    status: 'waiting', // waiting | playing | finished
    winner: null,
    winLine: null,
    score: { A: 0, B: 0, draw: 0 },
    rematchVotes: new Set(),
    turnDeadline: null,
    starter: null,
    moveLog: [],
    matchStartedAt: null,
    matchSaved: false,
    undo: {
      pending: null,
      counts: { A: 0, B: 0 },
      cooldownUntil: { A: 0, B: 0 },
      declinedCounts: { A: new Set(), B: new Set() },
    },
    lastActivity: Date.now(),
    timers: { grace: null, close: null },
  };
}

function createPlayer(socket, name, avatar, symbol) {
  return {
    socketId: socket.id,
    playerKey: crypto.randomUUID(),
    userId: socket.data?.user?.id || null,
    name,
    avatar,
    symbol,
    connected: true,
    lastEmote: 0,
  };
}

/** Ten/avatar cua nguoi da dang nhap luon lay tu DB, khong tin client. */
function identityFor(socket, payload) {
  const user = socket.data?.user;
  if (user) {
    return { name: sanitizeName(user.displayName) || user.username, avatar: sanitizeAvatar(user.avatar) };
  }
  return {
    name: sanitizeName(payload?.name) || 'Mèo Bí Ẩn',
    avatar: sanitizeAvatar(payload?.avatar),
  };
}

function getRoomContext(socket) {
  const roomId = socket.data?.roomId;
  if (!roomId) return null;
  const room = rooms.get(roomId);
  if (!room) {
    delete socket.data.roomId;
    delete socket.data.playerKey;
    return null;
  }
  const player = room.players.find((p) => p.socketId === socket.id);
  if (!player) return null;
  return { room, player };
}

function bothConnected(room) {
  return room.players.length === 2 && room.players.every((p) => p.connected);
}

function describeRoom(room) {
  return room.players.map((p) => `${p.symbol}:${p.name}`).join(' vs ') || '(empty)';
}

// ---------------------------------------------------------------------------
// Gui trang thai
// ---------------------------------------------------------------------------
function cloneWinLine(line) {
  if (!Array.isArray(line)) return null;
  return line.map((point) =>
    typeof point === 'number' ? point : { x: point.x, y: point.y }
  );
}

function publicState(room, youKey) {
  const now = Date.now();
  const canRunTimer =
    room.status === 'playing' && room.turnDeadline !== null && bothConnected(room);
  const viewer = room.players.find((p) => p.playerKey === youKey) || null;
  const viewerSymbol = viewer?.symbol || null;
  const pendingUndo = room.undo?.pending || null;
  const moveCount = room.moveLog.length;
  const state = {
    id: room.id,
    size: room.size,
    winLength: room.winLength,
    board: room.infinite ? null : room.board.slice(),
    lastMove:
      room.lastMove && typeof room.lastMove === 'object'
        ? { x: room.lastMove.x, y: room.lastMove.y }
        : room.lastMove,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    winLine: cloneWinLine(room.winLine),
    score: { ...room.score },
    starter: room.starter,
    moveCount,
    players: room.players.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      isYou: p.playerKey === youKey,
    })),
    turnMs: turnMsFor(room.size),
    turnEndsIn: canRunTimer ? Math.max(0, room.turnDeadline - now) : null,
    rematchVotes: room.rematchVotes.size,
    youVotedRematch: room.rematchVotes.has(youKey),
    youHaveMove: viewerSymbol
      ? room.moveLog.some((move) => move.s === viewerSymbol)
      : false,
    undoLeft: viewerSymbol
      ? Math.max(0, UNDO_MAX_REQUESTS - (room.undo?.counts[viewerSymbol] || 0))
      : 0,
    undoCooldownUntil: viewerSymbol ? room.undo?.cooldownUntil[viewerSymbol] || 0 : 0,
    undoDeclinedHere: viewerSymbol
      ? Boolean(room.undo?.declinedCounts[viewerSymbol]?.has(moveCount))
      : false,
    undo: pendingUndo
      ? {
          fromSymbol: pendingUndo.requesterSymbol,
          fromName: pendingUndo.fromName,
          fromAvatar: pendingUndo.fromAvatar,
          moveCount: pendingUndo.moveCount,
          expiresAt: pendingUndo.expiresAt,
          expiresIn: Math.max(0, pendingUndo.expiresAt - now),
          byYou: pendingUndo.requesterSymbol === viewerSymbol,
        }
      : null,
  };

  if (room.infinite) {
    state.moves = room.moves.map((move) => ({ x: move.x, y: move.y, s: move.s }));
    state.region = { ...room.region };
    state.moveCount = room.moves.length;
    state.maxMoves = MAX_INFINITE_MOVES;
  }

  return state;
}

function sendState(room) {
  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket) socket.emit('room:state', publicState(room, player.playerKey));
  }
}

function sendError(socket, code, fallbackMessage) {
  socket.emit('error:message', { code, message: fallbackMessage });
}

function replyError(ack, code, fallbackMessage) {
  if (typeof ack === 'function') ack({ ok: false, code, error: fallbackMessage });
}

/** Gioi han so su kien moi giay tren moi socket. */
function allowEvent(socket) {
  const now = Date.now();
  let bucket = socket.data.bucket;
  if (!bucket || now - bucket.start >= 1000) {
    bucket = { start: now, count: 0 };
    socket.data.bucket = bucket;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}

/** Gioi han rieng cho undo:request (chong spam xin di lai lien tuc). */
const UNDO_REQUEST_WINDOW_MS = 10_000;
const UNDO_REQUEST_MAX = 8;
function allowUndoRequest(socket) {
  const now = Date.now();
  let bucket = socket.data.undoBucket;
  if (!bucket || now - bucket.start >= UNDO_REQUEST_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    socket.data.undoBucket = bucket;
  }
  bucket.count += 1;
  return bucket.count <= UNDO_REQUEST_MAX;
}

function touch(room) {
  room.lastActivity = Date.now();
}

// ---------------------------------------------------------------------------
// Di lai (undo) — chi server quyet dinh, client chi hien thi
// ---------------------------------------------------------------------------
function clearUndoTimer(room) {
  const pending = room.undo?.pending;
  if (pending?.timer) {
    clearTimeout(pending.timer);
    pending.timer = null;
  }
}

function cancelUndo(room) {
  clearUndoTimer(room);
  if (room.undo) room.undo.pending = null;
}

function resetUndoState(room) {
  clearUndoTimer(room);
  room.undo = {
    pending: null,
    counts: { A: 0, B: 0 },
    cooldownUntil: { A: 0, B: 0 },
    declinedCounts: { A: new Set(), B: new Set() },
  };
}

function restoreTurnClock(room) {
  room.turnDeadline =
    room.status === 'playing' && bothConnected(room)
      ? Date.now() + turnMsFor(room.size)
      : null;
}

function emitUndoResolved(room, result, extra = {}) {
  if (!rooms.has(room.id)) return;
  io.to(room.id).emit('undo:resolved', { result, ...extra });
}

function completePending(room, result, extra = {}) {
  cancelUndo(room);
  restoreTurnClock(room);
  touch(room);
  // Gui ket qua truoc de client con nho ai la nguoi xin (hien bong bong tu choi).
  emitUndoResolved(room, result, extra);
  sendState(room);
}

/**
 * Huy yeu cau dang cho ma khong doi van. Dung khi mat ket noi / ket thuc /
 * dong phong. notify=false khi van sap ket thuc (client nhan game:over).
 */
function abortUndo(room, { notify = true, result = 'aborted' } = {}) {
  if (!room.undo?.pending) return false;
  cancelUndo(room);
  restoreTurnClock(room);
  touch(room);
  if (notify) {
    emitUndoResolved(room, result);
    sendState(room);
  }
  return true;
}

/** Cat danh sach nuoc di va dung lai ban co theo dung thao tac undo. */
function truncateRoomMoves(room, requesterSymbol) {
  const keep = undoTargetCount(room.moveLog, requesterSymbol);
  if (keep === null) return false;

  room.moveLog = room.moveLog.slice(0, keep);
  if (room.infinite) {
    room.moves = room.moves.slice(0, keep);
    room.cells = new Map();
    for (const move of room.moves) {
      room.cells.set(cellKey(move.x, move.y), move.s);
    }
    room.region = computeRegion(room.moves);
    const last = room.moves[room.moves.length - 1] || null;
    room.lastMove = last ? { x: last.x, y: last.y } : null;
  } else {
    room.board = createBoard(room.size);
    for (const move of room.moveLog) room.board[move.i] = move.s;
    const last = room.moveLog[room.moveLog.length - 1] || null;
    room.lastMove = last ? last.i : null;
  }
  room.turn = requesterSymbol;
  room.winner = null;
  room.winLine = null;
  room.status = 'playing';
  touch(room);
  return true;
}

function payloadRoomMatches(room, payload) {
  return (
    payload &&
    typeof payload.roomId === 'string' &&
    normalizeRoomId(payload.roomId) === room.id
  );
}

// ---------------------------------------------------------------------------
// Vong doi phong / van
// ---------------------------------------------------------------------------
function startRound(room, firstSymbol) {
  resetUndoState(room);
  if (room.infinite) {
    room.board = null;
    room.cells = new Map();
    room.moves = [];
    room.region = computeRegion([]);
  } else {
    room.board = createBoard(room.size);
  }
  room.lastMove = null;
  room.turn = firstSymbol;
  room.starter = firstSymbol;
  room.status = 'playing';
  room.winner = null;
  room.winLine = null;
  room.rematchVotes.clear();
  room.moveLog = [];
  room.matchSaved = false;
  room.matchStartedAt = Date.now();
  room.turnDeadline = bothConnected(room) ? Date.now() + turnMsFor(room.size) : null;
  touch(room);
}

function finishRound(room, winner, line, reason) {
  if (room.status === 'finished') return;
  cancelUndo(room);
  room.status = 'finished';
  room.winner = winner;
  room.winLine = line;
  room.turnDeadline = null;
  room.rematchVotes.clear();
  if (winner === 'A' || winner === 'B') room.score[winner] += 1;
  else if (winner === 'draw') room.score.draw += 1;
  touch(room);

  const endReason =
    reason === 'maxMoves'
      ? 'move_limit'
      : reason === 'abandon'
        ? 'disconnect'
        : reason === 'leave'
          ? 'leave'
          : reason === 'draw'
            ? 'draw'
            : 'win';
  void saveMatchRecord(room, {
    result: winner === 'A' || winner === 'B' || winner === 'draw' ? winner : 'draw',
    endReason,
  });

  sendState(room);
  io.to(room.id).emit('game:over', {
    winner,
    winLine: line ? line.slice() : null,
    reason,
  });
}

function applyMove(room, index, symbol) {
  room.board[index] = symbol;
  room.lastMove = index;
  room.moveLog.push({ i: index, s: symbol });
  touch(room);

  const line = checkWinFromMove(room.board, room.size, room.winLength, index);
  if (line) {
    finishRound(room, symbol, line, 'win');
    return { winner: symbol, line, draw: false };
  }
  if (isBoardFull(room.board)) {
    finishRound(room, 'draw', null, 'draw');
    return { winner: null, line: null, draw: true };
  }

  room.turn = symbol === 'A' ? 'B' : 'A';
  room.turnDeadline = bothConnected(room) ? Date.now() + turnMsFor(room.size) : null;
  sendState(room);
  return { winner: null, line: null, draw: false };
}

function applyInfiniteMove(room, x, y, symbol) {
  room.cells.set(cellKey(x, y), symbol);
  room.moves.push({ x, y, s: symbol });
  room.moveLog.push({ x, y, s: symbol });
  room.lastMove = { x, y };
  room.region = computeRegion(room.moves);
  touch(room);

  const line = checkWinInfinite(room.cells, x, y, symbol, room.winLength);
  if (line) {
    finishRound(room, symbol, line, 'win');
    return { winner: symbol, line, draw: false };
  }
  if (room.moves.length >= MAX_INFINITE_MOVES) {
    finishRound(room, 'draw', null, 'maxMoves');
    return { winner: null, line: null, draw: true };
  }

  room.turn = symbol === 'A' ? 'B' : 'A';
  room.turnDeadline = bothConnected(room) ? Date.now() + turnMsFor(room.size) : null;
  sendState(room);
  return { winner: null, line: null, draw: false };
}

function destroyRoom(room, reason) {
  if (!rooms.has(room.id)) return;
  cancelUndo(room);
  rooms.delete(room.id);
  clearTimeout(room.timers.grace);
  clearTimeout(room.timers.close);
  room.timers.grace = null;
  room.timers.close = null;

  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;
    socket.emit('room:closed', { reason });
    socket.leave(room.id);
    delete socket.data.roomId;
    delete socket.data.playerKey;
  }
  log('closed room', room.id, `(${reason})`, describeRoom(room));
}

/** Danh dau mot nguoi choi mat ket noi va bat dau dem gio giu cho. */
function markDisconnected(room, player) {
  player.connected = false;
  abortUndo(room, { result: 'aborted' });
  room.turnDeadline = null; // tam dung dong ho luot
  touch(room);

  if (room.status === 'waiting') {
    // Nguoi tao phong roi khi con dang cho -> xoa phong ngay
    destroyRoom(room, 'closed');
    return;
  }

  sendState(room);
  io.to(room.id).emit('room:opponent-disconnected', { name: player.name });
  log('disconnected', room.id, player.symbol, player.name);

  clearTimeout(room.timers.grace);
  room.timers.grace = setTimeout(() => {
    if (!rooms.has(room.id)) return;
    const current = room.players.find((p) => p.playerKey === player.playerKey);
    if (!current || current.connected) return;

    if (room.status === 'playing') {
      const opponent = room.players.find((p) => p.symbol !== current.symbol);
      if (opponent) {
        log('grace expired, opponent wins', room.id, opponent.symbol);
        finishRound(room, opponent.symbol, null, 'abandon');
        room.timers.close = setTimeout(() => {
          if (rooms.has(room.id)) destroyRoom(room, 'abandon');
        }, 4000);
      }
    } else {
      destroyRoom(room, 'abandon');
    }
  }, RECONNECT_GRACE);
  room.timers.grace.unref?.();
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------
io.use(async (socket, next) => {
  try {
    socket.data.user = await userFromCookieHeader(socket.handshake.headers.cookie);
  } catch (error) {
    console.error('[mmc] socket session lookup failed', error.message);
    socket.data.user = null;
  }
  next();
});

io.on('connection', (socket) => {
  socket.data.bucket = { start: 0, count: 0 };

  // --- Tao phong ---------------------------------------------------------
  socket.on('room:create', (payload, ack) => {
    if (!allowEvent(socket)) return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    if (socket.data.roomId && rooms.has(socket.data.roomId)) {
      return replyError(ack, 'alreadyInRoom', 'Ban dang o trong mot phong khac.');
    }
    if (rooms.size >= MAX_ROOMS) {
      return replyError(ack, 'roomLimit', 'Server dang ban, thu lai sau nhe!');
    }

    const rawSize = payload?.size;
    const size =
      rawSize === undefined || rawSize === null ? DEFAULT_BOARD_SIZE : normalizeBoardSize(rawSize);
    if (size === null) {
      return replyError(ack, 'UNSUPPORTED_BOARD_SIZE', 'Co ban chi ho tro 3x3 hoac vo cuc.');
    }

    const { name, avatar } = identityFor(socket, payload);
    const room = createRoom(uniqueRoomId(), size);
    const player = createPlayer(socket, name, avatar, 'A');
    room.players.push(player);
    rooms.set(room.id, room);

    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.playerKey = player.playerKey;

    log('created room', room.id, `by ${name}`);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        roomId: room.id,
        playerKey: player.playerKey,
        state: publicState(room, player.playerKey),
      });
    }
  });

  // --- Xem thong tin phong truoc khi vao (link moi) ----------------------
  socket.on('room:info', (payload, ack) => {
    if (!allowEvent(socket)) return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    const roomId = normalizeRoomId(payload?.roomId);
    const room = rooms.get(roomId);
    if (!ROOM_CODE_RE.test(roomId) || !room) {
      return replyError(ack, 'roomNotFound', 'Phong khong ton tai. Kiem tra lai ma nhe!');
    }
    const host = room.players.find((player) => player.symbol === 'A');
    if (typeof ack === 'function') {
      ack({
        ok: true,
        room: {
          roomId: room.id,
          size: room.size,
          winLength: room.winLength,
          hostName: host?.name || '',
          hostAvatar: host?.avatar || 'orange',
          status: room.status,
          playerCount: room.players.length,
          full: room.players.length >= MAX_PLAYERS || room.status !== 'waiting',
        },
      });
    }
  });

  // --- Vao phong ---------------------------------------------------------
  socket.on('room:join', (payload, ack) => {
    if (!allowEvent(socket)) return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    if (socket.data.roomId && rooms.has(socket.data.roomId)) {
      return replyError(ack, 'alreadyInRoom', 'Ban dang o trong mot phong khac.');
    }

    const roomId = normalizeRoomId(payload?.roomId);
    if (!ROOM_CODE_RE.test(roomId)) {
      return replyError(ack, 'invalidCode', 'Ma phong phai gom 5 ky tu chu va so.');
    }
    const room = rooms.get(roomId);
    if (!room) {
      return replyError(ack, 'roomNotFound', 'Phong khong ton tai. Kiem tra lai ma nhe!');
    }
    if (room.players.length >= MAX_PLAYERS || room.status !== 'waiting') {
      return replyError(ack, 'roomFull', 'Phong da du 2 nguoi roi!');
    }
    if (
      socket.data.user &&
      room.players.some((existing) => existing.userId === socket.data.user.id)
    ) {
      return replyError(ack, 'accountInRoom', 'Tai khoan nay da ngoi trong phong.');
    }

    const { name, avatar } = identityFor(socket, payload);
    const player = createPlayer(socket, name, avatar, 'B');
    room.players.push(player);

    // Nguoi di truoc van ngau nhien cho van dau
    const first = crypto.randomInt(0, 2) === 0 ? 'A' : 'B';
    startRound(room, first);

    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.playerKey = player.playerKey;

    log('joined room', room.id, `by ${name}`);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        roomId: room.id,
        playerKey: player.playerKey,
        state: publicState(room, player.playerKey),
      });
    }
    sendState(room);
    io.to(room.id).emit('game:restart', { starter: first });
  });

  // --- Ket noi lai (F5 / rot mang / tab moi thay tab cu) -----------------
  socket.on('room:rejoin', (payload, ack) => {
    const roomId = normalizeRoomId(payload?.roomId);
    const playerKey = typeof payload?.playerKey === 'string' ? payload.playerKey : '';
    const room = rooms.get(roomId);
    if (!room || !playerKey) {
      return replyError(ack, 'rejoinFailed', 'Khong tim thay phong cu.');
    }
    const player = room.players.find((p) => p.playerKey === playerKey);
    if (!player) {
      return replyError(ack, 'rejoinFailed', 'Khong tim thay nguoi choi trong phong.');
    }
    if (player.userId && socket.data.user && socket.data.user.id !== player.userId) {
      return replyError(ack, 'rejoinFailed', 'Phien nay thuoc ve tai khoan khac.');
    }

    // Tab moi thay tab cu: ngat tab cu khoi phong, khong de no tu rejoin vong lap
    if (player.socketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(player.socketId);
      if (oldSocket) {
        oldSocket.emit('room:replaced', {});
        oldSocket.leave(room.id);
        delete oldSocket.data.roomId;
        delete oldSocket.data.playerKey;
      }
      player.socketId = socket.id;
    }

    player.connected = true;
    clearTimeout(room.timers.grace);
    room.timers.grace = null;
    touch(room);

    socket.join(room.id);
    socket.data.roomId = room.id;
    socket.data.playerKey = player.playerKey;

    // Neu ca hai da ket noi lai va van dang choi -> chay tiep dong ho.
    // Dang cho tra loi di lai thi giu dong ho dung yen.
    if (
      room.status === 'playing' &&
      bothConnected(room) &&
      room.turnDeadline === null &&
      !room.undo?.pending
    ) {
      room.turnDeadline = Date.now() + turnMsFor(room.size);
    }

    log('rejoined room', room.id, player.symbol, player.name);
    if (typeof ack === 'function') {
      ack({ ok: true, roomId: room.id, state: publicState(room, player.playerKey) });
    }
    sendState(room);
    socket.to(room.id).emit('room:opponent-reconnected', { name: player.name });
  });

  // --- Danh co -----------------------------------------------------------
  socket.on('game:move', (payload, ack) => {
    if (!allowEvent(socket)) {
      return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    }
    const ctx = getRoomContext(socket);
    if (!ctx) return replyError(ack, 'notInRoom', 'Ban khong o trong phong nay.');
    const { room, player } = ctx;

    if (room.status !== 'playing') {
      sendError(socket, 'gameNotPlaying', 'Van dau chua bat dau hoac da ket thuc.');
      return replyError(ack, 'gameNotPlaying', 'Van dau chua bat dau hoac da ket thuc.');
    }
    if (room.undo?.pending) {
      sendError(socket, 'UNDO_PENDING', 'Dang cho tra loi xin di lai, tam dung danh.');
      return replyError(ack, 'UNDO_PENDING', 'Dang cho tra loi xin di lai, tam dung danh.');
    }
    if (room.turn !== player.symbol) {
      sendError(socket, 'notYourTurn', 'Chua den luot ban dau!');
      return replyError(ack, 'notYourTurn', 'Chua den luot ban dau!');
    }
    if (room.infinite) {
      const x = payload?.x;
      const y = payload?.y;
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        sendError(socket, 'invalidCoord', 'Toa do nuoc di khong hop le.');
        return replyError(ack, 'invalidCoord', 'Toa do nuoc di khong hop le.');
      }
      if (!isInRegion(room.region, x, y)) {
        sendError(socket, 'coordOutsideRegion', 'O nam ngoai vung choi.');
        return replyError(ack, 'coordOutsideRegion', 'O nam ngoai vung choi.');
      }
      if (room.moves.length >= MAX_INFINITE_MOVES) {
        sendError(socket, 'moveLimit', 'Da dat gioi han so nuoc.');
        return replyError(ack, 'moveLimit', 'Da dat gioi han so nuoc.');
      }
      if (room.cells.has(cellKey(x, y))) {
        sendError(socket, 'cellTaken', 'O nay co meo roi!');
        return replyError(ack, 'cellTaken', 'O nay co meo roi!');
      }

      applyInfiniteMove(room, x, y, player.symbol);
      if (typeof ack === 'function') ack({ ok: true });
      return;
    }

    const index = payload?.index;
    if (!Number.isInteger(index) || index < 0 || index >= room.board.length) {
      sendError(socket, 'invalidMove', 'Nuoc di khong hop le.');
      return replyError(ack, 'invalidMove', 'Nuoc di khong hop le.');
    }
    if (room.board[index] !== null) {
      sendError(socket, 'cellTaken', 'O nay co meo roi!');
      return replyError(ack, 'cellTaken', 'O nay co meo roi!');
    }

    applyMove(room, index, player.symbol);
    if (typeof ack === 'function') ack({ ok: true });
  });

  // --- Xin di lai --------------------------------------------------------
  socket.on('undo:request', (payload, ack) => {
    if (!allowEvent(socket) || !allowUndoRequest(socket)) {
      return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    }
    const ctx = getRoomContext(socket);
    if (!ctx) return replyError(ack, 'notInRoom', 'Ban khong o trong phong nay.');
    const { room, player } = ctx;
    if (!payloadRoomMatches(room, payload)) {
      return replyError(ack, 'STALE_STATE', 'Ban co da thay doi, thu lai nhe.');
    }
    if (room.status !== 'playing') {
      return replyError(ack, 'UNDO_NOT_AVAILABLE', 'Bay gio chua the di lai.');
    }
    if (!bothConnected(room)) {
      return replyError(ack, 'OPPONENT_OFFLINE', 'Doi thu chua ket noi lai.');
    }
    if (room.undo?.pending) {
      return replyError(ack, 'UNDO_PENDING', 'Dang cho tra loi xin di lai.');
    }
    const moveCount = payload?.moveCount;
    if (!Number.isInteger(moveCount) || moveCount !== room.moveLog.length) {
      return replyError(ack, 'STALE_STATE', 'Ban co da thay doi, thu lai nhe.');
    }
    if ((room.undo?.counts[player.symbol] || 0) >= UNDO_MAX_REQUESTS) {
      return replyError(ack, 'UNDO_LIMIT_REACHED', 'Da het luot xin di lai.');
    }
    if ((room.undo?.cooldownUntil[player.symbol] || 0) > Date.now()) {
      return replyError(ack, 'UNDO_COOLDOWN', 'Cho mot chut roi xin lai nhe.');
    }
    if (room.undo?.declinedCounts[player.symbol]?.has(moveCount)) {
      return replyError(
        ack,
        'UNDO_ALREADY_DECLINED_HERE',
        'The co nay da bi tu choi roi.'
      );
    }
    if (undoTargetCount(room.moveLog, player.symbol) === null) {
      return replyError(ack, 'UNDO_NO_MOVES', 'Ban chua co nuoc di nao.');
    }

    const expiresAt = Date.now() + UNDO_TIMEOUT_MS;
    const pending = {
      requesterKey: player.playerKey,
      requesterSymbol: player.symbol,
      fromName: player.name,
      fromAvatar: player.avatar,
      moveCount,
      expiresAt,
      timer: null,
    };
    room.undo.pending = pending;
    room.undo.counts[player.symbol] += 1;
    room.turnDeadline = null;
    touch(room);

    pending.timer = setTimeout(() => {
      if (!rooms.has(room.id)) return;
      if (room.undo?.pending !== pending) return;
      room.undo.declinedCounts[pending.requesterSymbol].add(pending.moveCount);
      room.undo.cooldownUntil[pending.requesterSymbol] = Date.now() + UNDO_COOLDOWN_MS;
      completePending(room, 'timeout', { fromSymbol: pending.requesterSymbol });
    }, UNDO_TIMEOUT_MS);
    pending.timer.unref?.();

    io.to(room.id).emit('undo:requested', {
      fromName: player.name,
      fromAvatar: player.avatar,
      fromSymbol: player.symbol,
      moveCount,
      expiresAt,
    });
    sendState(room);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        expiresAt,
        undoLeft: Math.max(0, UNDO_MAX_REQUESTS - room.undo.counts[player.symbol]),
      });
    }
  });

  // --- Tra loi xin di lai -----------------------------------------------
  socket.on('undo:respond', (payload, ack) => {
    if (!allowEvent(socket)) {
      return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    }
    const ctx = getRoomContext(socket);
    if (!ctx) return replyError(ack, 'notInRoom', 'Ban khong o trong phong nay.');
    const { room, player } = ctx;
    if (!payloadRoomMatches(room, payload)) {
      return replyError(ack, 'STALE_STATE', 'Ban co da thay doi, thu lai nhe.');
    }
    if (typeof payload?.accept !== 'boolean') {
      return replyError(ack, 'STALE_STATE', 'Phan hoi khong hop le.');
    }

    const pending = room.undo?.pending;
    if (!pending) {
      if (typeof ack === 'function') ack({ ok: true, ignored: true });
      return;
    }
    if (pending.requesterKey === player.playerKey) {
      return replyError(ack, 'UNDO_NOT_AVAILABLE', 'Ban khong the tu tra loi minh.');
    }
    if (room.status !== 'playing') {
      return replyError(ack, 'UNDO_NOT_AVAILABLE', 'Van da ket thuc.');
    }

    if (payload.accept) {
      const applied = truncateRoomMoves(room, pending.requesterSymbol);
      if (!applied) {
        completePending(room, 'aborted');
        return replyError(ack, 'UNDO_NO_MOVES', 'Khong con nuoc de di lai.');
      }
      completePending(room, 'accepted', { bySymbol: player.symbol });
      if (typeof ack === 'function') ack({ ok: true });
      return;
    }

    room.undo.declinedCounts[pending.requesterSymbol].add(pending.moveCount);
    room.undo.cooldownUntil[pending.requesterSymbol] = Date.now() + UNDO_COOLDOWN_MS;
    completePending(room, 'declined', { bySymbol: player.symbol });
    if (typeof ack === 'function') ack({ ok: true });
  });

  // --- Huy yeu cau di lai -----------------------------------------------
  socket.on('undo:cancel', (payload, ack) => {
    if (!allowEvent(socket)) {
      return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    }
    const ctx = getRoomContext(socket);
    if (!ctx) return replyError(ack, 'notInRoom', 'Ban khong o trong phong nay.');
    const { room, player } = ctx;
    if (!payloadRoomMatches(room, payload)) {
      return replyError(ack, 'STALE_STATE', 'Ban co da thay doi, thu lai nhe.');
    }
    const pending = room.undo?.pending;
    if (!pending || pending.requesterKey !== player.playerKey) {
      if (typeof ack === 'function') ack({ ok: true, ignored: true });
      return;
    }
    completePending(room, 'cancelled', { fromSymbol: player.symbol });
    if (typeof ack === 'function') ack({ ok: true });
  });

  // --- Choi lai (ca hai cung dong y) ------------------------------------
  socket.on('game:rematch', (payload, ack) => {
    if (!allowEvent(socket)) return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    const ctx = getRoomContext(socket);
    if (!ctx) return replyError(ack, 'notInRoom', 'Ban khong o trong phong nay.');
    const { room, player } = ctx;

    if (room.status !== 'finished') {
      return replyError(ack, 'gameNotPlaying', 'Van dau chua ket thuc.');
    }
    if (!bothConnected(room)) {
      return replyError(ack, 'opponentOffline', 'Doi thu chua ket noi lai.');
    }

    room.rematchVotes.add(player.playerKey);
    touch(room);

    if (room.rematchVotes.size >= 2) {
      const previousStarter = room.starter || room.turn;
      const nextStarter = previousStarter === 'A' ? 'B' : 'A';
      startRound(room, nextStarter);
      sendState(room);
      io.to(room.id).emit('game:restart', { starter: nextStarter });
    } else {
      sendState(room);
    }
    if (typeof ack === 'function') ack({ ok: true });
  });

  // --- Bieu cam nhanh ----------------------------------------------------
  socket.on('emote:send', (payload, ack) => {
    if (!allowEvent(socket)) return replyError(ack, 'rateLimit', 'Cham thoi meo oi!');
    const ctx = getRoomContext(socket);
    if (!ctx) return replyError(ack, 'notInRoom', 'Ban khong o trong phong nay.');
    const { room, player } = ctx;

    const emote = payload?.emote;
    if (!EMOTES.has(emote)) {
      return replyError(ack, 'invalidEmote', 'Bieu cam khong hop le.');
    }
    const now = Date.now();
    if (now - player.lastEmote < EMOTE_COOLDOWN) {
      sendError(socket, 'emoteCooldown', 'Tu tu thoi meo oi!');
      return replyError(ack, 'emoteCooldown', 'Tu tu thoi meo oi!');
    }
    player.lastEmote = now;
    touch(room);
    socket.to(room.id).emit('emote:received', { emote, symbol: player.symbol });
    if (typeof ack === 'function') ack({ ok: true });
  });

  // --- Roi phong ---------------------------------------------------------
  socket.on('room:leave', (_payload, ack) => {
    const ctx = getRoomContext(socket);
    if (!ctx) {
      if (typeof ack === 'function') ack({ ok: true });
      return;
    }
    const { room, player } = ctx;
    log('left room', room.id, player.symbol, player.name);
    if (room.status === 'playing' && room.moveLog.length > 0) {
      const opponent = room.players.find((item) => item.symbol !== player.symbol);
      if (opponent) finishRound(room, opponent.symbol, null, 'leave');
    }
    destroyRoom(room, room.status === 'waiting' ? 'closed' : 'left');
    if (typeof ack === 'function') ack({ ok: true });
  });

  // --- Ngat ket noi ------------------------------------------------------
  socket.on('disconnect', (reason) => {
    const roomId = socket.data?.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    log('socket disconnect', room.id, player.symbol, reason);
    markDisconnected(room, player);
  });
});

// ---------------------------------------------------------------------------
// Dong ho luot: het gio tu danh mot nuoc ngau nhien hop le (khong xu thua)
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status !== 'playing' || !room.turnDeadline) continue;
    if (!bothConnected(room)) continue;
    if (now < room.turnDeadline) continue;

    const symbol = room.turn;

    if (room.infinite) {
      const empties = getInfiniteEmptyCells(room.cells, room.region);
      if (!empties.length) continue;
      const move = empties[crypto.randomInt(0, empties.length)];
      log('turn timeout', room.id, symbol, `-> auto move (${move.x},${move.y})`);
      io.to(room.id).emit('game:timeout', { symbol });
      applyInfiniteMove(room, move.x, move.y, symbol);
      continue;
    }

    const empties = [];
    for (let i = 0; i < room.board.length; i += 1) {
      if (room.board[i] === null) empties.push(i);
    }
    if (!empties.length) continue;

    const index = empties[crypto.randomInt(0, empties.length)];
    log('turn timeout', room.id, symbol, '-> auto move', index);
    io.to(room.id).emit('game:timeout', { symbol });
    applyMove(room, index, symbol);
  }
}, 1000).unref?.();

// ---------------------------------------------------------------------------
// Don dep phong (15 phut khong hoat dong hoac trong qua lau)
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const idle = now - room.lastActivity;
    const empty = room.players.every((p) => !p.connected);
    if (idle > ROOM_TTL || (empty && idle > 2 * 60 * 1000)) {
      log('cleanup room', id, { idle, empty });
      destroyRoom(room, 'expired');
    }
  }
}, 60 * 1000).unref?.();

// ---------------------------------------------------------------------------
// Khoi dong
// ---------------------------------------------------------------------------
await migrate();
log(`database: ${databaseKind()}`);
log(`mail: ${mailEnabled ? mailProvider : 'disabled'}`);
const mailWarning = mailStartupWarning();
if (mailWarning) log(`mail warning: ${mailWarning}`);

setInterval(async () => {
  try {
    const now = Date.now();
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    await query('DELETE FROM sessions WHERE expires_at < ?', [now]);
    await query(
      'DELETE FROM password_resets WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)',
      [now, cutoff]
    );
    await query(
      'DELETE FROM email_verifications WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)',
      [now, cutoff]
    );
  } catch (error) {
    console.error('[mmc] session/token cleanup failed', error.message);
  }
}, 60 * 60 * 1000).unref?.();

httpServer.listen(PORT, () => {
  log(`Meo Meo Caro chay tai http://localhost:${PORT}`);
});

function shutdown(signal) {
  log('nhan tin hieu', signal, '- dang dong server...');
  for (const room of rooms.values()) {
    destroyRoom(room, 'closed');
  }
  io.close();
  httpServer.close(async () => {
    await closeDatabase().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app, httpServer, io, rooms };
