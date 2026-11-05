/**
 * Lop giao dien: ve ban co, ghost khi hover, duong len thang, confetti,
 * toast, banner ket noi, dong ho va bieu cam.
 * Khong chua luat choi - chi hien thi.
 */
import { t } from './i18n.js';

let boardEl = null;
let boardWrap = null;
let winSvg = null;
let cells = [];
let catFor = null;
let labelFor = null;
let onCell = null;

let focusIndex = 0;
let boardSize = 3;
let boardBound = false;
let lastInputWasKeyboard = false;
let lastWinLine = null;
let resizeObserver = null;
let confettiRaf = 0;
let toastTimer = null;

function prefersReducedMotion() {
  return document.body.classList.contains('reduce-motion');
}

function enabledCells() {
  return cells.filter((cell) => !cell.disabled);
}

function setTabIndex(index) {
  focusIndex = index;
  cells.forEach((cell, i) => {
    cell.tabIndex = i === index && !cell.disabled ? 0 : -1;
  });
}

function firstEnabledIndex() {
  const empty = cells.find((cell) => !cell.disabled && cell.dataset.raw === '');
  const first = empty || cells.find((cell) => !cell.disabled);
  return first ? Number(first.dataset.index) : 0;
}

export function focusFirstCell() {
  const index = firstEnabledIndex();
  setTabIndex(index);
  requestAnimationFrame(() => {
    if (!cells[index]?.disabled) cells[index].focus({ preventScroll: true });
  });
}

function ensureFocusIndex() {
  if (!cells[focusIndex] || cells[focusIndex].disabled) {
    setTabIndex(firstEnabledIndex());
  } else {
    setTabIndex(focusIndex);
  }
}

function onKeyDown(event) {
  const index = Number(event.currentTarget.dataset.index);
  let dRow = 0;
  let dCol = 0;
  switch (event.key) {
    case 'ArrowUp':
      dRow = -1;
      break;
    case 'ArrowDown':
      dRow = 1;
      break;
    case 'ArrowLeft':
      dCol = -1;
      break;
    case 'ArrowRight':
      dCol = 1;
      break;
    case 'Home': {
      event.preventDefault();
      lastInputWasKeyboard = true;
      const first = enabledCells()[0];
      if (first) {
        setTabIndex(Number(first.dataset.index));
        first.focus({ preventScroll: true });
      }
      return;
    }
    case 'End': {
      event.preventDefault();
      lastInputWasKeyboard = true;
      const all = enabledCells();
      const last = all[all.length - 1];
      if (last) {
        setTabIndex(Number(last.dataset.index));
        last.focus({ preventScroll: true });
      }
      return;
    }
    default:
      return;
  }

  event.preventDefault();
  lastInputWasKeyboard = true;
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;
  for (let step = 1; step <= 2; step += 1) {
    const nr = row + dRow * step;
    const nc = col + dCol * step;
    if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize) break;
    const next = nr * boardSize + nc;
    if (!cells[next].disabled) {
      setTabIndex(next);
      cells[next].focus({ preventScroll: true });
      return;
    }
  }
}

export function initBoard(options) {
  boardEl = document.getElementById('board');
  boardWrap = boardEl?.closest('.board-wrap') || boardEl;
  winSvg = document.getElementById('win-svg');
  catFor = options.catFor;
  labelFor = options.labelFor;
  onCell = options.onCell;

  if (!boardEl) return;

  if (!boardBound) {
    boardBound = true;
    boardEl.addEventListener('pointerdown', () => {
      lastInputWasKeyboard = false;
    });
    boardEl.addEventListener('keydown', () => {
      lastInputWasKeyboard = true;
    });
  }

  setBoardSize(options.size || 3);

  if (!resizeObserver) {
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        if (lastWinLine) drawWinLine(lastWinLine, false);
      });
      resizeObserver.observe(boardEl);
    } else {
      window.addEventListener('resize', () => {
        if (lastWinLine) drawWinLine(lastWinLine, false);
      });
    }
  }
}

/** Dung lai luoi NxN voi vi tri grid tuong minh (khong de trinh duyet tu xep). */
export function setBoardSize(size) {
  const safe = Number.isInteger(size) && size === 3 ? size : 3;
  boardSize = safe;
  if (!boardEl) return;

  boardEl.innerHTML = '';
  cells = [];
  focusIndex = 0;
  boardEl.style.setProperty('--board-size', String(safe));
  boardEl.dataset.size = String(safe);
  clearWinLine();

  for (let i = 0; i < safe * safe; i += 1) {
    const row = Math.floor(i / safe);
    const col = i % safe;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = String(i);
    cell.dataset.raw = '';
    cell.style.gridRow = String(row + 1);
    cell.style.gridColumn = String(col + 1);
    cell.innerHTML = '<span class="cell-cat"></span><span class="cell-ghost" aria-hidden="true"></span>';
    cell.tabIndex = i === 0 ? 0 : -1;
    cell.addEventListener('click', () => {
      if (cell.disabled) return;
      const keyboard = lastInputWasKeyboard;
      if (onCell) onCell(i);
      if (keyboard) focusFirstCell();
    });
    cell.addEventListener('keydown', onKeyDown);
    boardEl.appendChild(cell);
    cells.push(cell);
  }
}

/**
 * Ve lai ban co.
 * @param {Array} board
 * @param {{locked?: boolean, preview?: 'A'|'B'|null, expressionFor?: (symbol:string)=>string,
 *          lastMove?: number|null}} options
 */
export function renderBoard(board, options = {}) {
  if (!boardEl) return;
  const inferred = Math.sqrt(board.length);
  if (Number.isInteger(inferred) && inferred === 3 && inferred !== boardSize) {
    setBoardSize(inferred);
  }

  const locked = options.locked === true;
  const preview = options.preview || null;
  const expressionFor = options.expressionFor || null;
  const lastMove = Number.isInteger(options.lastMove) ? options.lastMove : null;

  cells.forEach((cell, i) => {
    const value = board[i];
    const expression = value && expressionFor ? expressionFor(value) : 'normal';
    const raw = value || '';
    const catEl = cell.querySelector('.cell-cat');
    const ghostEl = cell.querySelector('.cell-ghost');

    if (cell.dataset.raw !== raw || cell.dataset.expression !== expression) {
      catEl.innerHTML = value ? catFor(value, expression) : '';
      cell.dataset.raw = raw;
      cell.dataset.expression = expression;
      if (value) {
        cell.classList.remove('pop');
        // reflow de animation co the chay lai
        void cell.offsetWidth;
        cell.classList.add('pop');
      }
    }

    const ghostMarkup = !value && !locked && preview ? catFor(preview, 'normal') : '';
    if (ghostEl.dataset.symbol !== (ghostMarkup ? `${preview}` : '')) {
      ghostEl.innerHTML = ghostMarkup;
      ghostEl.dataset.symbol = ghostMarkup ? `${preview}` : '';
    }

    cell.disabled = locked;
    cell.classList.toggle('filled', Boolean(value));
    cell.classList.toggle('last-move', lastMove === i);
    if (labelFor) cell.setAttribute('aria-label', labelFor(i, value));
  });

  boardEl.classList.toggle('locked', locked);
  ensureFocusIndex();
}

export function setBoardLabel(text) {
  if (boardEl) boardEl.setAttribute('aria-label', text);
}

export function resetBoardFocus() {
  setTabIndex(firstEnabledIndex());
}

export function shakeCell(index) {
  const cell = cells[index];
  if (!cell) return;
  cell.classList.remove('shake');
  void cell.offsetWidth;
  cell.classList.add('shake');
  window.setTimeout(() => cell.classList.remove('shake'), 420);
}

// ---------------------------------------------------------------------------
// Duong len thang (win line)
// ---------------------------------------------------------------------------
function centerOf(index) {
  const wrapRect = boardWrap.getBoundingClientRect();
  const rect = cells[index].getBoundingClientRect();
  return {
    x: rect.left - wrapRect.left + rect.width / 2,
    y: rect.top - wrapRect.top + rect.height / 2,
  };
}

function drawWinLine(line, animate) {
  if (!winSvg || !cells.length) return;
  const wrapRect = boardWrap.getBoundingClientRect();
  if (wrapRect.width < 10) return;

  winSvg.setAttribute('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);
  const a = centerOf(line[0]);
  const b = centerOf(line[line.length - 1]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const overhang = Math.min(10, len * 0.08);
  const pad = 4;
  const clampX = (value) => Math.max(pad, Math.min(wrapRect.width - pad, value));
  const clampY = (value) => Math.max(pad, Math.min(wrapRect.height - pad, value));
  const x0 = clampX(a.x - ux * overhang);
  const y0 = clampY(a.y - uy * overhang);
  const x1 = clampX(b.x + ux * overhang);
  const y1 = clampY(b.y + uy * overhang);

  const amp = Math.min(13, len * 0.06);
  const c1x = x0 + (x1 - x0) / 3 + nx * amp;
  const c1y = y0 + (y1 - y0) / 3 + ny * amp;
  const c2x = x0 + (2 * (x1 - x0)) / 3 - nx * amp;
  const c2y = y0 + (2 * (y1 - y0)) / 3 - ny * amp;
  const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;

  winSvg.innerHTML = `
    <path class="yarn-base" d="${d}" pathLength="100"/>
    <path class="yarn-twist" d="${d}"/>
    <circle class="yarn-knot" cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="6"/>
  `;

  const base = winSvg.querySelector('.yarn-base');
  const twist = winSvg.querySelector('.yarn-twist');
  const knot = winSvg.querySelector('.yarn-knot');
  if (!base) return;

  if (!animate || prefersReducedMotion()) {
    base.style.strokeDasharray = 'none';
    base.style.strokeDashoffset = '0';
    base.style.opacity = '1';
  } else {
    base.style.strokeDasharray = '100';
    base.style.strokeDashoffset = '100';
    base.style.opacity = '1';
    base.getBoundingClientRect();
    base.style.transition = 'stroke-dashoffset 700ms ease-out';
    requestAnimationFrame(() => {
      base.style.strokeDashoffset = '0';
    });
    twist.style.opacity = '0';
    knot.style.opacity = '0';
    window.setTimeout(() => {
      twist.style.opacity = '1';
      knot.style.opacity = '1';
    }, 620);
  }
}

export function showWinLine(line) {
  if (!line || line.length < 2 || !cells.length) {
    clearWinLine();
    return;
  }
  lastWinLine = line;
  drawWinLine(line, true);
}

export function clearWinLine() {
  lastWinLine = null;
  if (winSvg) winSvg.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Confetti (ca + dau chan)
// ---------------------------------------------------------------------------
function drawFishShape(context, size) {
  context.beginPath();
  context.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(-size * 0.85, 0);
  context.lineTo(-size * 1.6, -size * 0.6);
  context.lineTo(-size * 1.6, size * 0.6);
  context.closePath();
  context.fill();
}

function drawPawShape(context, size) {
  context.beginPath();
  context.ellipse(0, size * 0.25, size * 0.6, size * 0.48, 0, 0, Math.PI * 2);
  context.fill();
  const toes = [
    [-0.52, -0.4],
    [-0.18, -0.65],
    [0.18, -0.65],
    [0.52, -0.4],
  ];
  for (const [tx, ty] of toes) {
    context.beginPath();
    context.arc(tx * size, ty * size, size * 0.22, 0, Math.PI * 2);
    context.fill();
  }
}

export function burstConfetti() {
  if (prefersReducedMotion()) return;
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  if (confettiRaf) cancelAnimationFrame(confettiRaf);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.display = 'block';
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ['#FFA94D', '#8FA9C9', '#FFD43B', '#8CE0C3', '#FF6B6B', '#FFD6E0'];
  const particles = [];
  const count = 90;
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: width * (0.15 + Math.random() * 0.7),
      y: height * (0.15 + Math.random() * 0.25),
      vx: (Math.random() - 0.5) * 4.8,
      vy: -Math.random() * 6 - 2,
      size: 4 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      color: colors[i % colors.length],
      shape: Math.random() < 0.55 ? 'fish' : Math.random() < 0.7 ? 'paw' : 'dot',
      life: 0,
    });
  }

  const start = performance.now();
  const duration = 3200;

  function frame(now) {
    const elapsed = now - start;
    context.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.life += 1;
      p.vy += 0.09;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      const fade = Math.max(0, 1 - elapsed / duration);
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rot);
      context.globalAlpha = fade;
      context.fillStyle = p.color;
      if (p.shape === 'fish') drawFishShape(context, p.size);
      else if (p.shape === 'paw') drawPawShape(context, p.size * 0.8);
      else {
        context.beginPath();
        context.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    if (elapsed < duration) {
      confettiRaf = requestAnimationFrame(frame);
    } else {
      context.clearRect(0, 0, width, height);
      canvas.style.display = 'none';
      confettiRaf = 0;
    }
  }

  confettiRaf = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Toast / banner / loading
// ---------------------------------------------------------------------------
export function toast(message, type = 'info', duration = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.className = 'toast';
  }, duration);
}

export function setBanner(message, type = 'warn') {
  const el = document.getElementById('conn-banner');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.className = `conn-banner show ${type}`;
  el.hidden = false;
}

export function setLoading(show, message = '') {
  const el = document.getElementById('loading');
  if (!el) return;
  if (show) {
    const text = el.querySelector('.loading-text');
    if (text && message) text.textContent = message;
    el.hidden = false;
    el.classList.add('show');
  } else {
    el.classList.remove('show');
    el.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Bieu cam / Zzz
// ---------------------------------------------------------------------------
export function showEmoteBubble(card, emote) {
  if (!card) return;
  const bubble = card.querySelector('.emote-bubble');
  if (!bubble) return;
  bubble.textContent = emote;
  bubble.classList.add('show');
  window.clearTimeout(bubble._hideTimer);
  bubble._hideTimer = window.setTimeout(() => bubble.classList.remove('show'), 2200);
}

export function clearEmoteBubble(card) {
  const bubble = card?.querySelector('.emote-bubble');
  if (!bubble) return;
  bubble.classList.remove('show');
  bubble.textContent = '';
}

export function showSleepZ() {
  if (!boardWrap || prefersReducedMotion()) return;
  const old = boardWrap.querySelectorAll('.zzz');
  old.forEach((node) => node.remove());
  for (let i = 0; i < 4; i += 1) {
    const z = document.createElement('span');
    z.className = 'zzz';
    z.textContent = 'Z';
    z.style.left = `${42 + i * 9}%`;
    z.style.animationDelay = `${i * 0.35}s`;
    z.setAttribute('aria-hidden', 'true');
    boardWrap.appendChild(z);
  }
  window.setTimeout(() => {
    boardWrap.querySelectorAll('.zzz').forEach((node) => node.remove());
  }, 4200);
}

// ---------------------------------------------------------------------------
// Dong ho luot
// ---------------------------------------------------------------------------
export function updateTimer(leftMs, totalMs) {
  const wrap = document.getElementById('turn-timer');
  const fill = document.getElementById('timer-fill');
  const text = document.getElementById('timer-text');
  if (!wrap || !fill || !text) return;

  if (leftMs === null) {
    wrap.classList.add('paused');
    wrap.classList.remove('urgent');
    fill.style.width = '100%';
    text.textContent = t('timerPaused');
    return;
  }

  const ratio = Math.max(0, Math.min(1, leftMs / (totalMs || 30000)));
  wrap.classList.remove('paused');
  wrap.classList.toggle('urgent', leftMs <= 10000);
  fill.style.width = `${(ratio * 100).toFixed(1)}%`;
  text.textContent = t('secondsLeft', { s: Math.max(0, Math.ceil(leftMs / 1000)) });
}
