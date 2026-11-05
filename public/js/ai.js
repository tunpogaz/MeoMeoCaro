/**
 * AI cho ban co 3x3 va ban vo cuc.
 *
 * - Ban 3x3: minimax toan bo (kho = khong bao gio thua).
 * - Ban vo cuc: heuristic + iterative deepening trong Web Worker.
 */
import {
  INFINITE,
  cellKey,
  checkWinFromMove,
  checkWinInfinite,
  computeRegion,
  findWinner,
  getEmptyCells,
  getInfiniteEmptyCells,
  getResult,
  infiniteStateFromMoves,
  isInRegion,
  otherPlayer,
} from './game-core.js';

const WIN_SCORE = 1_000_000;
const TIMEOUT = Symbol('ai-timeout');
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function pick(list, rng) {
  if (!list.length) return -1;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function centerIndex(size) {
  const mid = Math.floor(size / 2);
  return mid * size + mid;
}

/** Neu dat quan vao index thi co tao thanh chuoi thang ngay khong? */
function createsWin(board, index, player, size, winLength) {
  const previous = board[index];
  board[index] = player;
  const line = checkWinFromMove(board, size, winLength, index);
  board[index] = previous;
  return line !== null;
}

/** Nuoc thang ngay, neu khong thi nuoc chan doi thu. */
function tacticalMove(board, me, opponent, size, winLength) {
  const empties = getEmptyCells(board);
  for (const index of empties) {
    if (createsWin(board, index, me, size, winLength)) return index;
  }
  for (const index of empties) {
    if (createsWin(board, index, opponent, size, winLength)) return index;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3x3: giu nguyen hanh vi cu
// ---------------------------------------------------------------------------
function minimax3(board, current, me, depth, alpha, beta) {
  const result = getResult(board, 3, 3);
  if (result.finished) {
    if (result.draw) return 0;
    return result.winner === me ? 10 - depth : depth - 10;
  }

  const opponent = otherPlayer(current);
  const empties = getEmptyCells(board);
  let best = current === me ? -Infinity : Infinity;

  for (const index of empties) {
    board[index] = current;
    const score = minimax3(board, opponent, me, depth + 1, alpha, beta);
    board[index] = null;

    if (current === me) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** Chon ngau nhien trong cac nuoc toi uu ngang nhau de van khong lap lai. */
function bestMove3(board, me, rng) {
  const empties = getEmptyCells(board);
  let bestScore = -Infinity;
  let bestMoves = [];

  for (const index of empties) {
    board[index] = me;
    const { winner } = findWinner(board, 3, 3);
    let score;
    if (winner === me) score = 10;
    else if (getResult(board, 3, 3).draw) score = 0;
    else score = minimax3(board, otherPlayer(me), me, 1, -Infinity, Infinity);
    board[index] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [index];
    } else if (score === bestScore) {
      bestMoves.push(index);
    }
  }

  return bestMoves.length ? pick(bestMoves, rng) : empties[0];
}

function chooseMove3(board, me, opponent, difficulty, rng) {
  const empties = getEmptyCells(board);
  if (!empties.length) return -1;

  if (difficulty === 'easy') {
    if (rng() < 0.3) {
      const move = tacticalMove(board, me, opponent, 3, 3);
      if (move !== null) return move;
    }
    return pick(empties, rng);
  }

  if (difficulty === 'medium') {
    if (rng() < 0.2) return pick(empties, rng);
    const move = tacticalMove(board, me, opponent, 3, 3);
    if (move !== null) return move;
    if (board[4] === null) return 4;
    const corners = [0, 2, 6, 8].filter((index) => board[index] === null);
    if (corners.length) return pick(corners, rng);
    return pick(empties, rng);
  }

  if (empties.length === 9) return 4;
  return bestMove3(board, me, rng);
}

// ---------------------------------------------------------------------------
// Ban vo cuc: lam viec tren Map, o ung vien quanh cac quan da danh
// ---------------------------------------------------------------------------
function pointFromKey(key) {
  const comma = key.indexOf(',');
  const x = Number(key.slice(0, comma));
  const y = Number(key.slice(comma + 1));
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
}

function infiniteCandidates(cells, region, radius = 2) {
  if (!(cells instanceof Map) || !region) return [];
  const near = new Map();

  for (const key of cells.keys()) {
    const point = pointFromKey(key);
    if (!point) continue;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = point.x + dx;
        const y = point.y + dy;
        if (!isInRegion(region, x, y)) continue;
        const candidateKey = cellKey(x, y);
        if (cells.has(candidateKey)) continue;
        if (!near.has(candidateKey)) near.set(candidateKey, { x, y });
      }
    }
  }

  return Array.from(near.values());
}

function infiniteCreatesWin(cells, move, player, need) {
  const key = cellKey(move.x, move.y);
  cells.set(key, player);
  const line = checkWinInfinite(cells, move.x, move.y, player, need);
  cells.delete(key);
  return line;
}

function infiniteTactical(cells, candidates, me, opponent, need) {
  for (const move of candidates) {
    if (infiniteCreatesWin(cells, move, me, need)) return move;
  }
  for (const move of candidates) {
    if (infiniteCreatesWin(cells, move, opponent, need)) return move;
  }
  return null;
}

/** Diem cua mot chuoi tao boi nuoc di thu: 4 mo > 3 mo > 2 mo, chan hai dau = 0. */
function infiniteRunWeight(count, openEnds, need) {
  if (count >= need) return WIN_SCORE;
  if (openEnds <= 0) return 0;
  const table = {
    4: [0, 9000, 60000],
    3: [0, 700, 6000],
    2: [0, 40, 260],
    1: [0, 0, 6],
  };
  const row = table[count];
  if (!row) return 0;
  return row[Math.min(2, openEnds)];
}

function infinitePatternScore(cells, move, player, need) {
  const key = cellKey(move.x, move.y);
  cells.set(key, player);
  let score = 0;

  for (const [dx, dy] of DIRECTIONS) {
    let count = 1;
    let openEnds = 0;
    for (const sign of [-1, 1]) {
      let step = 1;
      while (
        cells.get(cellKey(move.x + dx * step * sign, move.y + dy * step * sign)) === player
      ) {
        count += 1;
        step += 1;
      }
      const endX = move.x + dx * step * sign;
      const endY = move.y + dy * step * sign;
      if (!cells.has(cellKey(endX, endY))) openEnds += 1;
    }
    score += infiniteRunWeight(count, openEnds, need);
  }

  cells.delete(key);
  return score;
}

/** Danh gia toan ban cho minimax: quet moi chuoi bat dau tu mot dau. */
function infiniteEvaluate(cells, me, opponent, need) {
  let score = 0;

  for (const [key, symbol] of cells) {
    if (symbol !== 'A' && symbol !== 'B') continue;
    const point = pointFromKey(key);
    if (!point) continue;

    for (const [dx, dy] of DIRECTIONS) {
      if (cells.get(cellKey(point.x - dx, point.y - dy)) === symbol) continue;

      let count = 0;
      let x = point.x;
      let y = point.y;
      while (cells.get(cellKey(x, y)) === symbol) {
        count += 1;
        x += dx;
        y += dy;
      }

      let openEnds = 0;
      if (!cells.has(cellKey(point.x - dx, point.y - dy))) openEnds += 1;
      if (!cells.has(cellKey(x, y))) openEnds += 1;

      const weight = infiniteRunWeight(count, openEnds, need);
      score += symbol === me ? weight : -weight * 1.08;
    }
  }

  return score;
}

function infiniteCenterBonus(cells, move) {
  if (!cells.size) return 0;
  let sumX = 0;
  let sumY = 0;
  for (const key of cells.keys()) {
    const point = pointFromKey(key);
    if (!point) continue;
    sumX += point.x;
    sumY += point.y;
  }
  const cx = sumX / cells.size;
  const cy = sumY / cells.size;
  return -(Math.abs(move.x - cx) + Math.abs(move.y - cy)) * 0.4;
}

function orderedInfiniteCandidates(cells, region, me, opponent, need, limit) {
  return infiniteCandidates(cells, region, 2)
    .map((move) => ({
      move,
      score:
        infinitePatternScore(cells, move, me, need) * 1.4 +
        infinitePatternScore(cells, move, opponent, need) * 0.9,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.move);
}

function minimaxInfinite(cells, region, current, me, opponent, depth, alpha, beta, need, deadline) {
  if (deadline && Date.now() > deadline) throw TIMEOUT;
  if (depth <= 0) return infiniteEvaluate(cells, me, opponent, need);

  const candidates = orderedInfiniteCandidates(
    cells,
    region,
    current,
    otherPlayer(current),
    need,
    depth >= 3 ? 12 : 9
  );
  if (!candidates.length) return 0;

  const maximizing = current === me;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of candidates) {
    const key = cellKey(move.x, move.y);
    cells.set(key, current);
    let score;
    try {
      if (checkWinInfinite(cells, move.x, move.y, current, need)) {
        score = maximizing ? WIN_SCORE + depth : -WIN_SCORE - depth;
      } else {
        score = minimaxInfinite(
          cells,
          region,
          otherPlayer(current),
          me,
          opponent,
          depth - 1,
          alpha,
          beta,
          need,
          deadline
        );
      }
    } finally {
      cells.delete(key);
    }

    if (maximizing) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
    if (deadline && Date.now() > deadline) throw TIMEOUT;
  }

  return best;
}

function searchInfinite(cells, region, me, opponent, need, timeLimit, maxDepth) {
  const candidates = orderedInfiniteCandidates(cells, region, me, opponent, need, 18);
  if (!candidates.length) return null;

  const depthCap = Number.isInteger(maxDepth) && maxDepth > 0 ? maxDepth : 4;
  const deadline = timeLimit > 0 ? Date.now() + timeLimit : 0;
  let best = candidates[0];

  for (let depth = 1; depth <= depthCap; depth += 1) {
    if (deadline && Date.now() > deadline) break;

    const ordered = [best, ...candidates.filter((move) => move !== best)];
    let alpha = -Infinity;
    let localBest = -Infinity;
    let localMove = ordered[0];
    let completed = true;

    try {
      for (const move of ordered) {
        const key = cellKey(move.x, move.y);
        cells.set(key, me);
        let score;
        try {
          if (checkWinInfinite(cells, move.x, move.y, me, need)) {
            score = WIN_SCORE + depth;
          } else {
            score = minimaxInfinite(
              cells,
              region,
              opponent,
              me,
              opponent,
              depth - 1,
              alpha,
              Infinity,
              need,
              deadline
            );
          }
        } finally {
          cells.delete(key);
        }

        if (score > localBest) {
          localBest = score;
          localMove = move;
        }
        if (localBest > alpha) alpha = localBest;
        if (deadline && Date.now() > deadline) {
          completed = false;
          break;
        }
      }
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      completed = false;
    }

    if (!completed) break;
    best = localMove;
    if (localBest >= WIN_SCORE) break;
  }

  return best;
}

/**
 * Chon nuoc cho ban vo cuc.
 * @param {{cells?:Map<string,string>, moves?:Array<{x:number,y:number,s:string}>,
 *          region?:{minX:number,maxX:number,minY:number,maxY:number}}} state
 * @param {'A'|'B'} me
 * @param {'A'|'B'} opponent
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {() => number} rng
 * @param {{winLength?:number, timeLimit?:number, maxDepth?:number}} options
 * @returns {{x:number,y:number}|null}
 */
export function chooseInfiniteMove(
  state,
  me,
  opponent,
  difficulty = 'medium',
  rng = Math.random,
  options = {}
) {
  const moves = Array.isArray(state?.moves) ? state.moves : [];
  const built = infiniteStateFromMoves(moves);
  const cells = state?.cells instanceof Map ? state.cells : built.cells;
  const region = state?.region || computeRegion(moves);
  const need =
    Number.isInteger(options.winLength) && options.winLength > 0
      ? options.winLength
      : INFINITE.winLength;

  if (!cells.size) return { x: 0, y: 0 };

  let candidates = infiniteCandidates(cells, region, 2);
  if (!candidates.length) {
    const empties = getInfiniteEmptyCells(cells, region);
    if (!empties.length) return null;
    return empties[0];
  }

  const tactical = infiniteTactical(cells, candidates, me, opponent, need);

  if (difficulty === 'easy') {
    if (tactical && rng() < 0.2) return tactical;
    return pick(candidates.slice(0, 48), rng);
  }

  if (tactical) return tactical;

  if (difficulty === 'medium') {
    if (rng() < 0.2) return pick(candidates.slice(0, 48), rng);

    let bestScore = -Infinity;
    let bestMoves = [];
    for (const move of candidates) {
      const attack = infinitePatternScore(cells, move, me, need);
      const defense = infinitePatternScore(cells, move, opponent, need);
      const score = attack * 1.3 + defense + infiniteCenterBonus(cells, move);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }
    return bestMoves.length ? pick(bestMoves, rng) : pick(candidates, rng);
  }

  const timeLimit =
    Number.isFinite(options.timeLimit) && options.timeLimit >= 0 ? options.timeLimit : 800;
  const search = searchInfinite(cells, region, me, opponent, need, timeLimit, options.maxDepth);
  if (search) return search;
  return candidates[0];
}

/**
 * Di nuoc cho ban huu han duy nhat con ho tro (3x3).
 * Ban vo cuc dung chooseInfiniteMove.
 *
 * @param {Array} board mang phang 9 o (null | 'A' | 'B')
 * @param {'A'|'B'} me quan cua AI
 * @param {'A'|'B'} opponent
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {() => number} rng
 * @returns {number} chi so o, hoac -1 neu ban day
 */
export function chooseMove(
  board,
  me,
  opponent,
  difficulty = 'medium',
  rng = Math.random
) {
  if (!Array.isArray(board) || board.length !== 9) return -1;
  return chooseMove3(board, me, opponent, difficulty, rng);
}
