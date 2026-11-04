/**
 * Ban co vo cuc ve bang canvas.
 *
 * - Chi ve cac o dang nhin thay (virtualization), ho tro devicePixelRatio.
 * - Keo de di chuyen, cuon/chum de thu phong, cham de danh.
 * - Sprite meo duoc tao tu SVG trong assets/cats.js va cache lai.
 * - Moi listener duoc go bo khi thoat van (AbortController).
 */
import {
  INFINITE,
  cellKey,
  computeRegion,
  infiniteStateFromMoves,
  isInRegion,
} from './game-core.js';
import { t } from './i18n.js';

const INK = '#4A3426';
const OUTSIDE_BG = '#e9dcc9';
const REGION_BG = '#fffdf8';
const OUTSIDE_GRID = 'rgba(74, 52, 38, 0.07)';
const REGION_GRID = 'rgba(74, 52, 38, 0.18)';
const ACCENT = '#FFA94D';
const RED = '#FF6B6B';
const MIN_CELL = 24;
const MAX_CELL = 96;
const DEFAULT_CELL = 56;
const PIECE_STYLE = {
  A: { bg: '#ffead4', fur: '#FFA94D', nose: '#FF8FA3' },
  B: { bg: '#e8f0fb', fur: '#8FA9C9', nose: '#F2A6B1' },
};

const refs = {
  root: null,
  stage: null,
  canvas: null,
  ctx: null,
  coords: null,
  count: null,
  hint: null,
  live: null,
  zoomIn: null,
  zoomOut: null,
  center: null,
  last: null,
};

const hooks = {
  catFor: null,
  nameFor: null,
  onCell: null,
};

let active = false;
let visible = false;
let bound = false;
let abortController = null;
let resizeObserver = null;
let frameId = 0;

let boardState = freshState();
let view = { cell: DEFAULT_CELL, panX: 0, panY: 0, w: 0, h: 0, dpr: 1 };
let hover = null;
let cursor = { x: 0, y: 0 };
let arrowRect = null;
let autoFollow = true;
let firstRender = true;
let lastWinSignature = '';
let lastAnnounceKey = '';
let metaCoords = '';
let outsideFlashAt = 0;

let regionAnim = null;
let winAnim = 0;
let placeAnim = null;
let flash = null;
let panAnim = null;

const pointers = new Map();
let gesture = {
  startX: 0,
  startY: 0,
  startPanX: 0,
  startPanY: 0,
  moved: false,
  pinch: null,
  blockTap: false,
  type: 'mouse',
};

const spriteCache = new Map();

function freshState() {
  return {
    cells: new Map(),
    moves: [],
    region: computeRegion([]),
    lastMove: null,
    winLine: null,
    locked: true,
    preview: null,
    expressionFor: null,
    maxMoves: INFINITE.maxMoves,
    drawLimit: false,
  };
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function reducedMotion() {
  if (document.body.classList.contains('reduce-motion')) return true;
  return Boolean(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(p) {
  return 1 - Math.pow(1 - p, 3);
}

function schedule() {
  if (frameId || !active || !visible) return;
  frameId = window.requestAnimationFrame(tick);
}

function tick(ts) {
  frameId = 0;
  if (!active || !visible) return;
  const time = typeof ts === 'number' ? ts : now();
  draw(time);
  if (isAnimating(time)) schedule();
}

function isAnimating(time) {
  if (regionAnim && time - regionAnim.start < regionAnim.dur) return true;
  if (winAnim && time - winAnim < 700) return true;
  if (placeAnim && time - placeAnim.start < 320) return true;
  if (flash && time - flash.start < 520) return true;
  if (panAnim && time - panAnim.start < panAnim.dur) return true;
  if (outsideFlashAt && time - outsideFlashAt < 520) return true;
  return false;
}

// ---------------------------------------------------------------------------
// DOM / kich thuoc
// ---------------------------------------------------------------------------
export function initInfiniteBoard(options = {}) {
  hooks.catFor = options.catFor || null;
  hooks.nameFor = options.nameFor || null;
  hooks.onCell = options.onCell || null;

  refs.root = document.getElementById('board-infinite');
  refs.stage = document.getElementById('infinite-stage');
  refs.canvas = document.getElementById('infinite-canvas');
  refs.coords = document.getElementById('inf-coords');
  refs.count = document.getElementById('inf-count');
  refs.hint = document.getElementById('inf-hint');
  refs.live = document.getElementById('inf-move-live');
  refs.zoomIn = document.getElementById('inf-zoom-in');
  refs.zoomOut = document.getElementById('inf-zoom-out');
  refs.center = document.getElementById('inf-center');
  refs.last = document.getElementById('inf-last');

  if (!refs.canvas) return;
  refs.ctx = refs.canvas.getContext('2d');

  if (!bound) {
    bound = true;
    refs.zoomIn?.addEventListener('click', () => zoomFromCenter(1.25));
    refs.zoomOut?.addEventListener('click', () => zoomFromCenter(0.8));
    refs.center?.addEventListener('click', () => {
      focusCell(0, 0);
      refs.canvas.focus({ preventScroll: true });
    });
    refs.last?.addEventListener('click', () => {
      if (boardState.lastMove) focusCell(boardState.lastMove.x, boardState.lastMove.y);
      refs.canvas.focus({ preventScroll: true });
    });
  }

  refreshInfiniteText();
}

function measure() {
  if (!refs.canvas) return false;
  const rect = refs.canvas.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (!width || !height) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (width !== view.w || height !== view.h || dpr !== view.dpr) {
    view.w = width;
    view.h = height;
    view.dpr = dpr;
    refs.canvas.width = Math.round(width * dpr);
    refs.canvas.height = Math.round(height * dpr);
  }
  return true;
}

function onResize() {
  if (!active || !visible) return;
  const hadSize = view.w > 0;
  if (!measure()) return;
  if (!hadSize) resetInfiniteView();
  schedule();
}

function onStageResize() {
  onResize();
}

// ---------------------------------------------------------------------------
// Khung nhin
// ---------------------------------------------------------------------------
export function resetInfiniteView() {
  if (!measure()) {
    window.requestAnimationFrame(() => {
      if (active && visible && measure()) resetInfiniteView();
    });
    return;
  }
  view.cell = clamp(Math.min(view.w, view.h) / 11, MIN_CELL, MAX_CELL);
  view.panX = (view.w - view.cell) / 2;
  view.panY = (view.h - view.cell) / 2;
  cursor = { x: 0, y: 0 };
  hover = null;
  autoFollow = true;
  panAnim = null;
  firstRender = true;
  schedule();
}

export function focusInfiniteBoard() {
  if (!refs.canvas || !visible) return;
  refs.canvas.focus({ preventScroll: true });
}

function focusCell(x, y) {
  if (!measure()) return;
  const targetX = view.w / 2 - (x + 0.5) * view.cell;
  const targetY = view.h / 2 - (y + 0.5) * view.cell;
  autoFollow = true;
  hover = null;
  cursor = { x, y };
  if (reducedMotion()) {
    view.panX = targetX;
    view.panY = targetY;
    panAnim = null;
    schedule();
    return;
  }
  panAnim = {
    fromX: view.panX,
    fromY: view.panY,
    toX: targetX,
    toY: targetY,
    start: now(),
    dur: 300,
  };
  schedule();
}

function zoomFromCenter(factor) {
  if (!measure()) return;
  zoomAt(view.w / 2, view.h / 2, factor);
  refs.canvas.focus({ preventScroll: true });
}

function zoomAt(px, py, factor) {
  const nextCell = clamp(view.cell * factor, MIN_CELL, MAX_CELL);
  if (Math.abs(nextCell - view.cell) < 0.01) return;
  const worldX = (px - view.panX) / view.cell;
  const worldY = (py - view.panY) / view.cell;
  view.cell = nextCell;
  view.panX = px - worldX * nextCell;
  view.panY = py - worldY * nextCell;
  autoFollow = false;
  panAnim = null;
  schedule();
}

function cellRect(x, y) {
  return {
    x: view.panX + x * view.cell,
    y: view.panY + y * view.cell,
    size: view.cell,
  };
}

function cellAt(px, py) {
  return {
    x: Math.floor((px - view.panX) / view.cell),
    y: Math.floor((py - view.panY) / view.cell),
  };
}

function visibleBounds() {
  return {
    x0: Math.floor(-view.panX / view.cell) - 1,
    x1: Math.ceil((view.w - view.panX) / view.cell) + 1,
    y0: Math.floor(-view.panY / view.cell) - 1,
    y1: Math.ceil((view.h - view.panY) / view.cell) + 1,
  };
}

function isCellVisible(x, y, margin = 0) {
  const rect = cellRect(x, y);
  return (
    rect.x + rect.size > -margin &&
    rect.x < view.w + margin &&
    rect.y + rect.size > -margin &&
    rect.y < view.h + margin
  );
}

function ensureCursorVisible() {
  if (!measure()) return;
  const rect = cellRect(cursor.x, cursor.y);
  const margin = Math.min(view.cell * 0.6, 32);
  let dx = 0;
  let dy = 0;
  if (rect.x < margin) dx = margin - rect.x;
  else if (rect.x + rect.size > view.w - margin) dx = view.w - margin - (rect.x + rect.size);
  if (rect.y < margin) dy = margin - rect.y;
  else if (rect.y + rect.size > view.h - margin) dy = view.h - margin - (rect.y + rect.size);
  if (dx || dy) {
    view.panX += dx;
    view.panY += dy;
    autoFollow = false;
    panAnim = null;
    schedule();
  }
}

// ---------------------------------------------------------------------------
// Lop phien choi: listener chi song trong mot van
// ---------------------------------------------------------------------------
export function startInfiniteSession() {
  if (!refs.canvas) return;
  if (active) {
    measure();
    schedule();
    return;
  }

  active = true;
  abortController = new AbortController();
  const { signal } = abortController;

  const canvas = refs.canvas;
  canvas.addEventListener('pointerdown', onPointerDown, { signal });
  canvas.addEventListener('pointermove', onPointerMove, { signal });
  canvas.addEventListener('pointerup', onPointerUp, { signal });
  canvas.addEventListener('pointercancel', onPointerCancel, { signal });
  canvas.addEventListener('pointerleave', onPointerLeave, { signal });
  canvas.addEventListener('wheel', onWheel, { passive: false, signal });
  canvas.addEventListener('keydown', onKeyDown, { signal });
  canvas.addEventListener('focus', onFocusChange, { signal });
  canvas.addEventListener('blur', onFocusChange, { signal });
  window.addEventListener('resize', onResize, { signal });
  window.addEventListener('orientationchange', onResize, { signal });

  if ('ResizeObserver' in window && refs.stage) {
    resizeObserver = new ResizeObserver(onStageResize);
    resizeObserver.observe(refs.stage);
  }

  measure();
  resetInfiniteView();
  firstRender = true;
}

export function stopInfiniteSession() {
  active = false;
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (frameId) {
    window.cancelAnimationFrame(frameId);
    frameId = 0;
  }
  pointers.clear();
  gesture = {
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    moved: false,
    pinch: null,
    blockTap: false,
    type: 'mouse',
  };
  hover = null;
  regionAnim = null;
  winAnim = 0;
  placeAnim = null;
  flash = null;
  panAnim = null;
  outsideFlashAt = 0;
  arrowRect = null;
  contentLost();
}

export function setInfiniteVisible(nextVisible) {
  visible = nextVisible === true;
  if (refs.root) refs.root.hidden = !visible;

  const finiteBoard = document.getElementById('board');
  const winSvg = document.getElementById('win-svg');
  if (finiteBoard) finiteBoard.hidden = visible;
  if (winSvg) winSvg.hidden = visible;

  if (visible) {
    window.requestAnimationFrame(() => {
      if (!active || !visible) return;
      measure();
      if (!view.w) resetInfiniteView();
      schedule();
    });
  } else {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }
}

function contentLost() {
  boardState = freshState();
  lastWinSignature = '';
  lastAnnounceKey = '';
  cursor = { x: 0, y: 0 };
  hover = null;
  metaCoords = '';
}

// ---------------------------------------------------------------------------
// Cap nhat trang thai
// ---------------------------------------------------------------------------
function normalizeMoves(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((move) => move && Number.isInteger(move.x) && Number.isInteger(move.y))
    .map((move) => ({ x: move.x, y: move.y, s: move.s === 'B' ? 'B' : 'A' }));
}

function normalizeRegion(raw, moves) {
  if (
    raw &&
    Number.isInteger(raw.minX) &&
    Number.isInteger(raw.maxX) &&
    Number.isInteger(raw.minY) &&
    Number.isInteger(raw.maxY) &&
    raw.minX <= raw.maxX &&
    raw.minY <= raw.maxY
  ) {
    return {
      minX: raw.minX,
      maxX: raw.maxX,
      minY: raw.minY,
      maxY: raw.maxY,
    };
  }
  return computeRegion(moves);
}

function normalizeWinLine(raw) {
  if (!Array.isArray(raw)) return null;
  const line = raw
    .filter((point) => point && Number.isInteger(point.x) && Number.isInteger(point.y))
    .map((point) => ({ x: point.x, y: point.y }));
  return line.length >= 2 ? line : null;
}

function sameRegion(a, b) {
  return (
    a &&
    b &&
    a.minX === b.minX &&
    a.maxX === b.maxX &&
    a.minY === b.minY &&
    a.maxY === b.maxY
  );
}

function samePoint(a, b) {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y;
}

function normalizeLastMove(raw) {
  if (!raw || !Number.isInteger(raw.x) || !Number.isInteger(raw.y)) return null;
  return { x: raw.x, y: raw.y };
}

export function renderInfinite(next = {}) {
  const rawMoves = normalizeMoves(next.moves);
  let cells = next.cells instanceof Map ? next.cells : null;
  let moves = rawMoves;
  if (!cells) {
    const built = infiniteStateFromMoves(rawMoves);
    cells = built.cells;
    if (!rawMoves.length) moves = built.moves;
  }

  const region = normalizeRegion(next.region, moves);
  const lastMove = normalizeLastMove(next.lastMove);
  const winLine = normalizeWinLine(next.winLine);
  const previous = boardState;
  const previousSig = samePoint(previous.lastMove, lastMove) ? '' : lastMove;

  boardState = {
    cells,
    moves,
    region,
    lastMove,
    winLine,
    locked: next.locked === true,
    preview: next.preview === 'A' || next.preview === 'B' ? next.preview : null,
    expressionFor: typeof next.expressionFor === 'function' ? next.expressionFor : null,
    maxMoves:
      Number.isInteger(next.maxMoves) && next.maxMoves > 0
        ? next.maxMoves
        : INFINITE.maxMoves,
    drawLimit: next.drawLimit === true,
  };

  if (
    previous.region &&
    previous.moves.length > 0 &&
    moves.length > 0 &&
    !sameRegion(previous.region, region)
  ) {
    regionAnim = {
      from: previous.region,
      to: region,
      start: now(),
      dur: reducedMotion() ? 0 : 260,
    };
  } else {
    regionAnim = null;
  }

  if (lastMove && (!previous.lastMove || !samePoint(previous.lastMove, lastMove))) {
    placeAnim = { x: lastMove.x, y: lastMove.y, start: now() };
    if (firstRender) {
      firstRender = false;
      if (!reducedMotion()) {
        const rect = cellRect(lastMove.x, lastMove.y);
        const half = rect.size / 2;
        if (
          rect.x < half ||
          rect.y < half ||
          rect.x + rect.size > view.w - half ||
          rect.y + rect.size > view.h - half
        ) {
          focusCell(lastMove.x, lastMove.y);
        }
      } else {
        focusCell(lastMove.x, lastMove.y);
      }
    } else if (autoFollow && !isCellVisible(lastMove.x, lastMove.y, view.cell * 0.4)) {
      focusCell(lastMove.x, lastMove.y);
    }
    announceMove(lastMove);
  } else if (!lastMove) {
    firstRender = false;
    placeAnim = null;
  }

  const winSignature = winLine
    ? winLine.map((point) => `${point.x},${point.y}`).join('|')
    : '';
  if (winSignature && winSignature !== lastWinSignature) {
    winAnim = now();
  }
  lastWinSignature = winSignature;

  updateMeta();
  schedule();
}

function announceMove(move) {
  const symbol = boardState.cells.get(cellKey(move.x, move.y)) || 'A';
  const key = `${move.x},${move.y},${symbol}`;
  if (key === lastAnnounceKey) return;
  lastAnnounceKey = key;
  if (refs.live) {
    refs.live.textContent = t('infMoveAnnounce', {
      name: nameFor(symbol),
      x: move.x,
      y: move.y,
    });
  }
}

export function shakeInfinite(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  flash = { x, y, start: now() };
  autoFollow = false;
  schedule();
}

export function refreshInfiniteText() {
  if (!refs.hint) return;
  refs.hint.textContent = t('infHint');
  if (refs.canvas) refs.canvas.setAttribute('role', 'application');
  if (refs.center) refs.center.setAttribute('title', t('infCenter'));
  if (refs.last) refs.last.setAttribute('title', t('infLastMove'));
  if (refs.zoomIn) refs.zoomIn.setAttribute('aria-label', t('infZoomIn'));
  if (refs.zoomOut) refs.zoomOut.setAttribute('aria-label', t('infZoomOut'));
  updateMeta();
}

function nameFor(symbol) {
  if (hooks.nameFor) return hooks.nameFor(symbol);
  return symbol === 'B' ? t('grayCat') : t('orangeCat');
}

function updateMeta() {
  if (!refs.count) return;

  refs.count.textContent = t('infMoveCountLimit', {
    n: boardState.moves.length,
    max: boardState.maxMoves,
  });

  const coords = hover || cursor;
  const symbol = boardState.cells.get(cellKey(coords.x, coords.y));
  const inRegion = isInRegion(boardState.region, coords.x, coords.y);
  metaCoords = inRegion
    ? symbol
      ? t('infCellTaken', { x: coords.x, y: coords.y, name: nameFor(symbol) })
      : t('infCellEmpty', { x: coords.x, y: coords.y })
    : t('infOutsideCell', { x: coords.x, y: coords.y });
  refs.coords.textContent = metaCoords;

  if (refs.canvas) {
    refs.canvas.setAttribute(
      'aria-label',
      t('infBoardLabel', { n: boardState.moves.length, max: boardState.maxMoves })
    );
  }
}

// ---------------------------------------------------------------------------
// Ve
// ---------------------------------------------------------------------------
function draw(time) {
  if (!refs.ctx || !measure()) return;
  const ctx = refs.ctx;
  const { dpr, w, h } = view;

  let panX = view.panX;
  let panY = view.panY;
  if (panAnim && panAnim.start) {
    const p = clamp((time - panAnim.start) / panAnim.dur, 0, 1);
    const eased = reducedMotion() ? 1 : easeOutCubic(p);
    panX = panAnim.fromX + (panAnim.toX - panAnim.fromX) * eased;
    panY = panAnim.fromY + (panAnim.toY - panAnim.fromY) * eased;
    if (p >= 1) {
      view.panX = panAnim.toX;
      view.panY = panAnim.toY;
      panAnim = null;
    } else {
      view.panX = panX;
      view.panY = panY;
    }
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = OUTSIDE_BG;
  ctx.fillRect(0, 0, w, h);

  const region = displayedRegion(time);
  const bounds = visibleBounds();

  drawGrid(ctx, bounds, OUTSIDE_GRID, null);

  const regionRect = rectForRegion(region);
  ctx.fillStyle = REGION_BG;
  ctx.fillRect(regionRect.x, regionRect.y, regionRect.w, regionRect.h);

  drawGrid(ctx, bounds, REGION_GRID, region);

  drawOrigin(ctx, region);

  drawPieces(ctx, time, bounds);
  drawHover(ctx);
  drawCursor(ctx, time);
  drawLastMove(ctx, time, region);
  drawRegionBorder(ctx, time, region);
  drawWinLine(ctx, time);
  drawFlash(ctx, time);
  updateArrow(region);
  drawArrow(ctx);
}

function displayedRegion(time) {
  if (!regionAnim) return boardState.region;
  const p = clamp((time - regionAnim.start) / (regionAnim.dur || 1), 0, 1);
  if (p >= 1) {
    regionAnim = null;
    return boardState.region;
  }
  const eased = easeOutCubic(p);
  const from = regionAnim.from;
  const to = regionAnim.to;
  return {
    minX: from.minX + (to.minX - from.minX) * eased,
    maxX: from.maxX + (to.maxX - from.maxX) * eased,
    minY: from.minY + (to.minY - from.minY) * eased,
    maxY: from.maxY + (to.maxY - from.maxY) * eased,
  };
}

function rectForRegion(region) {
  const left = view.panX + region.minX * view.cell;
  const top = view.panY + region.minY * view.cell;
  return {
    x: left,
    y: top,
    w: (region.maxX - region.minX + 1) * view.cell,
    h: (region.maxY - region.minY + 1) * view.cell,
  };
}

function drawGrid(ctx, bounds, color, region) {
  const x0 = region ? Math.max(bounds.x0, Math.ceil(region.minX)) : bounds.x0;
  const x1 = region ? Math.min(bounds.x1, Math.floor(region.maxX) + 1) : bounds.x1;
  const y0 = region ? Math.max(bounds.y0, Math.ceil(region.minY)) : bounds.y0;
  const y1 = region ? Math.min(bounds.y1, Math.floor(region.maxY) + 1) : bounds.y1;
  if (x0 > x1 || y0 > y1) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let x = x0; x <= x1; x += 1) {
    const sx = Math.round(view.panX + x * view.cell) + 0.5;
    ctx.moveTo(sx, view.panY + y0 * view.cell);
    ctx.lineTo(sx, view.panY + (y1 + 1) * view.cell);
  }
  for (let y = y0; y <= y1; y += 1) {
    const sy = Math.round(view.panY + y * view.cell) + 0.5;
    ctx.moveTo(view.panX + x0 * view.cell, sy);
    ctx.lineTo(view.panX + (x1 + 1) * view.cell, sy);
  }
  ctx.stroke();
}

function drawOrigin(ctx, region) {
  if (!isInRegion(region, 0, 0)) return;
  const rect = cellRect(0, 0);
  if (rect.x + rect.size < 0 || rect.y + rect.size < 0) return;
  if (rect.x > view.w || rect.y > view.h) return;
  const cx = rect.x + rect.size / 2;
  const cy = rect.y + rect.size / 2;
  const r = Math.max(3, rect.size * 0.1);
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.4, rect.size * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, rect.size * 0.055), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function spriteKey(symbol, expression) {
  return `${symbol}|${expression}`;
}

function getSprite(symbol, expression) {
  const key = spriteKey(symbol, expression);
  let entry = spriteCache.get(key);
  if (entry) return entry;

  entry = { img: null, ready: false, failed: false };
  spriteCache.set(key, entry);

  if (!hooks.catFor) {
    entry.failed = true;
    return entry;
  }

  try {
    const raw = hooks.catFor(symbol, expression);
    if (!raw) {
      entry.failed = true;
      return entry;
    }
    const withNs = raw.replace(
      '<svg ',
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" '
    );
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      entry.ready = true;
      if (active && visible) schedule();
    };
    img.onerror = () => {
      entry.failed = true;
      if (active && visible) schedule();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
    entry.img = img;
  } catch {
    entry.failed = true;
  }
  return entry;
}

function expressionFor(symbol) {
  if (boardState.expressionFor) {
    try {
      const value = boardState.expressionFor(symbol);
      if (typeof value === 'string' && value) return value;
    } catch {
      /* bo qua */
    }
  }
  return 'normal';
}

function drawPiecePlaceholder(ctx, symbol, cx, cy, size) {
  const style = PIECE_STYLE[symbol] || PIECE_STYLE.A;
  ctx.fillStyle = style.fur;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.04, size * 0.3, size * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - size * 0.28, cy - size * 0.12);
  ctx.lineTo(cx - size * 0.2, cy - size * 0.34);
  ctx.lineTo(cx - size * 0.05, cy - size * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + size * 0.28, cy - size * 0.12);
  ctx.lineTo(cx + size * 0.2, cy - size * 0.34);
  ctx.lineTo(cx + size * 0.05, cy - size * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = INK;
  const eye = Math.max(1, size * 0.026);
  ctx.beginPath();
  ctx.arc(cx - size * 0.1, cy - size * 0.01, eye, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + size * 0.1, cy - size * 0.01, eye, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = style.nose;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.08, Math.max(1, size * 0.02), 0, Math.PI * 2);
  ctx.fill();
}

function drawPiece(ctx, symbol, x, y, time) {
  const rect = cellRect(x, y);
  const inset = rect.size * 0.07;
  let scale = 1;

  if (placeAnim && placeAnim.x === x && placeAnim.y === y) {
    const p = clamp((time - placeAnim.start) / 320, 0, 1);
    if (reducedMotion()) {
      scale = 1;
    } else if (p < 0.62) {
      scale = 0.55 + p;
    } else {
      scale = 1.17 - 0.17 * ((p - 0.62) / 0.38);
    }
    if (p >= 1) placeAnim = null;
  }

  const style = PIECE_STYLE[symbol] || PIECE_STYLE.A;
  const cx = rect.x + rect.size / 2;
  const cy = rect.y + rect.size / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const bx = rect.x + inset;
  const by = rect.y + inset;
  const bs = rect.size - inset * 2;
  roundRectPath(ctx, bx, by, bs, bs, rect.size * 0.22);
  ctx.fillStyle = style.bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(74, 52, 38, 0.12)';
  ctx.lineWidth = Math.max(1, rect.size * 0.025);
  ctx.stroke();

  const expression = expressionFor(symbol);
  const sprite = getSprite(symbol, expression);
  if (sprite.ready && sprite.img) {
    ctx.save();
    roundRectPath(ctx, bx, by, bs, bs, rect.size * 0.22);
    ctx.clip();
    ctx.drawImage(sprite.img, bx, by, bs, bs);
    ctx.restore();
  } else {
    drawPiecePlaceholder(ctx, symbol, cx, cy, rect.size);
  }
  ctx.restore();
}

function drawPieces(ctx, time, bounds) {
  if (!boardState.cells.size) return;
  for (const [key, symbol] of boardState.cells) {
    const comma = key.indexOf(',');
    if (comma < 0) continue;
    const x = Number(key.slice(0, comma));
    const y = Number(key.slice(comma + 1));
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1) continue;
    drawPiece(ctx, symbol, x, y, time);
  }
}

function drawHover(ctx) {
  if (!hover || boardState.locked || !boardState.preview) return;
  if (!isInRegion(boardState.region, hover.x, hover.y)) return;
  if (boardState.cells.has(cellKey(hover.x, hover.y))) return;

  const rect = cellRect(hover.x, hover.y);
  const expression = 'normal';
  const sprite = getSprite(boardState.preview, expression);
  const inset = rect.size * 0.1;

  ctx.save();
  ctx.globalAlpha = 0.34;
  if (sprite.ready && sprite.img) {
    ctx.drawImage(sprite.img, rect.x + inset, rect.y + inset, rect.size - inset * 2, rect.size - inset * 2);
  } else {
    drawPiecePlaceholder(
      ctx,
      boardState.preview,
      rect.x + rect.size / 2,
      rect.y + rect.size / 2,
      rect.size
    );
  }
  ctx.restore();

  roundRectPath(ctx, rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4, rect.size * 0.2);
  ctx.strokeStyle = 'rgba(255, 169, 77, 0.55)';
  ctx.lineWidth = Math.max(1.5, rect.size * 0.035);
  ctx.stroke();
}

function drawCursor(ctx, time) {
  if (!isInRegion(boardState.region, cursor.x, cursor.y)) return;
  const rect = cellRect(cursor.x, cursor.y);
  if (rect.x + rect.size < 0 || rect.y + rect.size < 0) return;
  if (rect.x > view.w || rect.y > view.h) return;

  const focused = document.activeElement === refs.canvas;
  const pulse = reducedMotion() ? 0 : Math.sin(time / 330) * 0.18 + 0.82;
  ctx.save();
  ctx.globalAlpha = focused ? pulse : pulse * 0.55;
  ctx.setLineDash([Math.max(4, rect.size * 0.1), Math.max(3, rect.size * 0.07)]);
  roundRectPath(ctx, rect.x + 2.5, rect.y + 2.5, rect.size - 5, rect.size - 5, rect.size * 0.2);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = Math.max(2, rect.size * 0.05);
  ctx.stroke();
  ctx.restore();
}

function drawLastMove(ctx, time, region) {
  const move = boardState.lastMove;
  if (!move) return;
  if (!isInRegion(region, move.x, move.y)) return;
  const rect = cellRect(move.x, move.y);
  if (rect.x + rect.size < 0 || rect.y + rect.size < 0) return;
  if (rect.x > view.w || rect.y > view.h) return;

  const pulse = reducedMotion() ? 1 : 0.65 + Math.sin(time / 260) * 0.25;
  ctx.save();
  ctx.globalAlpha = clamp(pulse, 0.45, 0.95);
  ctx.setLineDash([Math.max(3, rect.size * 0.09), Math.max(2, rect.size * 0.06)]);
  roundRectPath(ctx, rect.x + 3, rect.y + 3, rect.size - 6, rect.size - 6, rect.size * 0.2);
  ctx.strokeStyle = RED;
  ctx.lineWidth = Math.max(2, rect.size * 0.045);
  ctx.stroke();
  ctx.restore();
}

function drawRegionBorder(ctx, time, region) {
  const rect = rectForRegion(region);
  const changed = regionAnim && time - regionAnim.start < regionAnim.dur;
  let pulse = 0;
  if (changed && !reducedMotion()) {
    pulse = Math.sin(clamp((time - regionAnim.start) / regionAnim.dur, 0, 1) * Math.PI);
  }
  if (outsideFlashAt && !reducedMotion()) {
    const p = clamp((time - outsideFlashAt) / 520, 0, 1);
    pulse = Math.max(pulse, Math.sin(p * Math.PI) * 0.9);
  }

  ctx.save();
  ctx.strokeStyle = pulse > 0.02 ? RED : ACCENT;
  ctx.lineWidth = 3 + pulse * 3;
  ctx.globalAlpha = 0.95;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  ctx.globalAlpha = 0.18 + pulse * 0.25;
  ctx.lineWidth = 9 + pulse * 6;
  ctx.strokeStyle = pulse > 0.02 ? RED : ACCENT;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();
}

function drawWinLine(ctx, time) {
  const line = boardState.winLine;
  if (!line || line.length < 2) {
    return;
  }
  const points = line.map((point) => {
    const rect = cellRect(point.x, point.y);
    return { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 };
  });

  let progress = 1;
  if (winAnim && !reducedMotion()) {
    progress = clamp((time - winAnim) / 650, 0, 1);
  }
  const eased = easeOutCubic(progress);

  const segments = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    segments.push({ a: points[i - 1], b: points[i], len });
    total += len;
  }

  const drawLength = total * eased;
  const path = new Path2D();
  path.moveTo(points[0].x, points[0].y);
  let acc = 0;
  for (const segment of segments) {
    if (acc + segment.len <= drawLength) {
      path.lineTo(segment.b.x, segment.b.y);
      acc += segment.len;
    } else {
      const remain = drawLength - acc;
      const ratio = segment.len > 0 ? remain / segment.len : 0;
      path.lineTo(
        segment.a.x + (segment.b.x - segment.a.x) * ratio,
        segment.a.y + (segment.b.y - segment.a.y) * ratio
      );
      break;
    }
  }

  const scale = clamp(view.cell / 64, 0.6, 1.2);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = RED;
  ctx.lineWidth = 8 * scale;
  ctx.stroke(path);
  ctx.strokeStyle = '#FFD6E0';
  ctx.lineWidth = 3 * scale;
  ctx.setLineDash([5 * scale, 9 * scale]);
  ctx.stroke(path);
  ctx.restore();
}

function drawFlash(ctx, time) {
  if (!flash) return;
  const p = clamp((time - flash.start) / 520, 0, 1);
  if (p >= 1) {
    flash = null;
    return;
  }
  const rect = cellRect(flash.x, flash.y);
  ctx.save();
  ctx.globalAlpha = (1 - p) * 0.55;
  roundRectPath(ctx, rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4, rect.size * 0.18);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.restore();
}

function updateArrow(region) {
  arrowRect = null;
  const move = boardState.lastMove;
  if (!move || !isInRegion(region, move.x, move.y)) return;
  const rect = cellRect(move.x, move.y);
  const margin = view.cell * 0.15;
  const fullyVisible =
    rect.x >= margin &&
    rect.y >= margin &&
    rect.x + rect.size <= view.w - margin &&
    rect.y + rect.size <= view.h - margin;
  if (fullyVisible) return;

  const cx = rect.x + rect.size / 2;
  const cy = rect.y + rect.size / 2;
  const dx = cx - view.w / 2;
  const dy = cy - view.h / 2;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const inset = 30;
  const halfW = view.w / 2 - inset;
  const halfH = view.h / 2 - inset;
  const scale = Math.min(
    halfW / Math.max(Math.abs(ux), 0.0001),
    halfH / Math.max(Math.abs(uy), 0.0001)
  );

  arrowRect = {
    x: view.w / 2 + ux * scale,
    y: view.h / 2 + uy * scale,
    angle: Math.atan2(uy, ux),
    r: Math.max(16, Math.min(24, view.cell * 0.42)),
  };
}

function drawArrow(ctx) {
  if (!arrowRect) return;
  const { x, y, angle, r } = arrowRect;

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(r * 0.42, 0);
  ctx.lineTo(-r * 0.28, -r * 0.38);
  ctx.lineTo(-r * 0.28, r * 0.38);
  ctx.closePath();
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Tuong tac
// ---------------------------------------------------------------------------
function updateHoverFromPoint(px, py) {
  const cell = cellAt(px, py);
  if (hover && hover.x === cell.x && hover.y === cell.y) return;
  hover = cell;
  updateMeta();
  schedule();
}

function onPointerDown(event) {
  if (!active || !visible) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  refs.canvas.focus({ preventScroll: true });
  refs.canvas.setPointerCapture?.(event.pointerId);

  pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
  gesture.type = event.pointerType || 'mouse';
  gesture.blockTap = false;

  if (pointers.size === 1) {
    gesture.startX = event.clientX;
    gesture.startY = event.clientY;
    gesture.startPanX = view.panX;
    gesture.startPanY = view.panY;
    gesture.moved = false;
    gesture.pinch = null;
    panAnim = null;
  } else if (pointers.size === 2) {
    startPinch();
  }

  hover = null;
  updateMeta();
  event.preventDefault();
}

function startPinch() {
  const points = [...pointers.values()];
  if (points.length < 2) return;
  const [a, b] = points;
  gesture.pinch = {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    cell: view.cell,
    panX: view.panX,
    panY: view.panY,
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
  gesture.moved = true;
  autoFollow = false;
}

function onPointerMove(event) {
  if (!active || !visible) return;

  const tracked = pointers.get(event.pointerId);
  if (tracked) {
    tracked.x = event.offsetX;
    tracked.y = event.offsetY;
  }

  if (pointers.size >= 2 && gesture.pinch) {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const factor = dist / gesture.pinch.dist;
      const nextCell = clamp(gesture.pinch.cell * factor, MIN_CELL, MAX_CELL);
      const worldX = (gesture.pinch.midX - gesture.pinch.panX) / gesture.pinch.cell;
      const worldY = (gesture.pinch.midY - gesture.pinch.panY) / gesture.pinch.cell;
      view.cell = nextCell;
      view.panX = midX - worldX * nextCell;
      view.panY = midY - worldY * nextCell;
      panAnim = null;
      schedule();
    }
    event.preventDefault();
    return;
  }

  if (pointers.size === 1 && !gesture.blockTap) {
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) > 6) {
      gesture.moved = true;
      autoFollow = false;
    }
    if (gesture.moved) {
      view.panX = gesture.startPanX + dx;
      view.panY = gesture.startPanY + dy;
      panAnim = null;
      hover = null;
      updateMeta();
      schedule();
      event.preventDefault();
      return;
    }
  }

  if (!pointers.size || gesture.type === 'mouse') {
    updateHoverFromPoint(event.offsetX, event.offsetY);
  }
}

function onPointerUp(event) {
  if (!active) return;
  const wasTracked = pointers.delete(event.pointerId);
  const lastPoint = { x: event.offsetX, y: event.offsetY };

  if (pointers.size === 0) {
    const shouldTap = wasTracked && !gesture.moved && !gesture.blockTap;
    const wasPinch = Boolean(gesture.pinch);
    gesture.pinch = null;

    if (shouldTap) {
      handleTap(lastPoint.x, lastPoint.y);
    }

    if (wasPinch) {
      gesture.blockTap = true;
      window.setTimeout(() => {
        gesture.blockTap = false;
      }, 0);
    }
    gesture.moved = false;
  } else if (pointers.size === 1) {
    gesture.blockTap = true;
  }

  refs.canvas.releasePointerCapture?.(event.pointerId);
}

function onPointerCancel(event) {
  pointers.delete(event.pointerId);
  if (!pointers.size) {
    gesture.pinch = null;
    gesture.moved = false;
    gesture.blockTap = false;
  }
  refs.canvas.releasePointerCapture?.(event.pointerId);
}

function onPointerLeave() {
  if (pointers.size) return;
  hover = null;
  updateMeta();
  schedule();
}

function handleTap(px, py) {
  if (arrowRect) {
    const dist = Math.hypot(px - arrowRect.x, py - arrowRect.y);
    if (dist <= arrowRect.r + 8) {
      if (boardState.lastMove) focusCell(boardState.lastMove.x, boardState.lastMove.y);
      return;
    }
  }

  const cell = cellAt(px, py);
  cursor = cell;

  if (!isInRegion(boardState.region, cell.x, cell.y)) {
    outsideFlashAt = now();
    updateMeta();
    schedule();
    return;
  }

  if (hooks.onCell) hooks.onCell(cell.x, cell.y);
  updateMeta();
  schedule();
}

function onWheel(event) {
  if (!active || !visible) return;
  event.preventDefault();
  const unit =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.h : 1;
  const delta = event.deltaY * unit;
  const factor = Math.exp(-delta * 0.0016);
  zoomAt(event.offsetX, event.offsetY, factor);
}

function onKeyDown(event) {
  if (!active || !visible) return;

  const region = boardState.region;
  let handled = true;

  switch (event.key) {
    case 'ArrowLeft':
      cursor.x = Math.max(region.minX, cursor.x - 1);
      break;
    case 'ArrowRight':
      cursor.x = Math.min(region.maxX, cursor.x + 1);
      break;
    case 'ArrowUp':
      cursor.y = Math.max(region.minY, cursor.y - 1);
      break;
    case 'ArrowDown':
      cursor.y = Math.min(region.maxY, cursor.y + 1);
      break;
    case 'Home':
      focusCell(0, 0);
      updateMeta();
      return;
    case '+':
    case '=':
      zoomFromCenter(1.25);
      return;
    case '-':
    case '_':
      zoomFromCenter(0.8);
      return;
    case 'Enter':
    case ' ':
    case 'Spacebar':
      if (isInRegion(region, cursor.x, cursor.y) && hooks.onCell) {
        hooks.onCell(cursor.x, cursor.y);
      }
      updateMeta();
      schedule();
      event.preventDefault();
      return;
    default:
      handled = false;
  }

  if (!handled) return;

  event.preventDefault();
  ensureCursorVisible();
  updateMeta();
  schedule();
}

function onFocusChange() {
  schedule();
}

// ---------------------------------------------------------------------------
// Tien ich cho test / chan doan
// ---------------------------------------------------------------------------
export function infiniteBoardSnapshot() {
  return {
    active,
    visible,
    cell: view.cell,
    panX: view.panX,
    panY: view.panY,
    hover: hover ? { x: hover.x, y: hover.y } : null,
    cursor: { x: cursor.x, y: cursor.y },
    moves: boardState.moves.length,
    region: { ...boardState.region },
  };
}
