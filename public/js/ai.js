/**
 * AI cho ban co 3x3 - 8x8.
 *
 * - Ban 3x3: giu nguyen cach danh cu (hard = minimax toan bo, khong bao gio thua).
 * - Ban 4x4 - 8x8:
 *   easy:   gan nhu ngau nhien, thinh thoang thang/chan ngay.
 *   medium: thang -> chan -> cham diem chuoi rieng + uu tien gan giua, 20% ngau nhien.
 *   hard:   thang/chan ngay -> minimax + alpha-beta + danh gia chuoi, sau dan dan
 *           (iterative deepening) trong gioi han thoi gian.
 *
 * Hard tren ban lon rat manh nhung KHONG hoan hao nhu 3x3.
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
  isBoardFull,
  isInRegion,
  isValidSize,
  otherPlayer,
  sizeFromBoard,
  winLengthFor,
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
// Ban lon: cham diem chuoi
// ---------------------------------------------------------------------------
const windowWeights = new Map();

function weightFor(count, need) {
  if (count <= 0) return 0;
  if (count >= need) return WIN_SCORE;
  let table = windowWeights.get(need);
  if (!table) {
    table = [0];
    for (let i = 1; i < need; i += 1) table.push(Math.pow(10, i - 1));
    windowWeights.set(need, table);
  }
  return table[count];
}

/**
 * Quet moi cua so dai `need` theo 4 huong. Cua so chi co quan mot ben
 * cang nhieu quan cang nguy hiem; cua so co ca hai ben bi chan hoan toan.
 */
function evaluateBoard(board, me, opponent, size, need) {
  let score = 0;
  const lastStart = size - need;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      for (const [dr, dc] of DIRECTIONS) {
        const endRow = row + dr * (need - 1);
        const endCol = col + dc * (need - 1);
        if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;

        let mine = 0;
        let theirs = 0;
        for (let step = 0; step < need; step += 1) {
          const value = board[(row + dr * step) * size + col + dc * step];
          if (value === me) mine += 1;
          else if (value === opponent) theirs += 1;
        }

        if (mine && theirs) continue;
        if (mine) score += weightFor(mine, need);
        else if (theirs) score -= weightFor(theirs, need) * 1.08;
      }
    }
  }

  const mid = (size - 1) / 2;
  for (let index = 0; index < board.length; index += 1) {
    const value = board[index];
    if (!value) continue;
    const row = Math.floor(index / size);
    const col = index % size;
    const dist = Math.abs(row - mid) + Math.abs(col - mid);
    const bonus = Math.max(0, size * 2 - dist) * 0.2;
    score += value === me ? bonus : -bonus;
  }

  return score;
}

/** Tinh diem nhanh cho mot o: chuoi cua minh, chan doi thu, gan giua. */
function moveOrderScore(board, index, me, opponent, size, need) {
  const row = Math.floor(index / size);
  const col = index % size;
  let score = 0;

  board[index] = me;
  if (checkWinFromMove(board, size, need, index)) score += WIN_SCORE;
  score += chainScoreAt(board, index, me, size) * 1.4;
  board[index] = opponent;
  if (checkWinFromMove(board, size, need, index)) score += WIN_SCORE * 0.9;
  score += chainScoreAt(board, index, opponent, size);
  board[index] = null;

  const mid = (size - 1) / 2;
  score += (size - Math.abs(row - mid) - Math.abs(col - mid)) * 0.6;
  return score;
}

/** Tong binh phuong do dai cac chuoi lien tiep quanh index (index da co quan). */
function chainScoreAt(board, index, player, size) {
  const row = Math.floor(index / size);
  const col = index % size;
  let total = 0;

  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < size && c >= 0 && c < size) {
        if (board[r * size + c] !== player) break;
        count += 1;
        r += dr * sign;
        c += dc * sign;
      }
    }
    total += count * count;
  }

  return total;
}

function candidateCells(board, size, radius) {
  const empties = getEmptyCells(board);
  if (!empties.length) return [];
  if (empties.length === size * size) return [centerIndex(size)];

  const near = new Set();
  for (let index = 0; index < board.length; index += 1) {
    if (!board[index]) continue;
    const row = Math.floor(index / size);
    const col = index % size;
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const cell = r * size + c;
        if (board[cell] === null) near.add(cell);
      }
    }
  }

  return near.size ? Array.from(near) : empties;
}

function orderedCandidates(board, me, opponent, size, need, limit) {
  return candidateCells(board, size, 2)
    .map((index) => ({ index, score: moveOrderScore(board, index, me, opponent, size, need) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.index);
}

function minimaxLarge(board, current, me, opponent, depth, alpha, beta, size, need, deadline) {
  if (deadline && Date.now() > deadline) throw TIMEOUT;
  if (isBoardFull(board)) return 0;
  if (depth <= 0) return evaluateBoard(board, me, opponent, size, need);

  const limit = depth >= 3 ? 14 : 10;
  const candidates = orderedCandidates(board, current, otherPlayer(current), size, need, limit);
  if (!candidates.length) return 0;

  const maximizing = current === me;
  let best = maximizing ? -Infinity : Infinity;

  for (const index of candidates) {
    board[index] = current;
    let score;
    if (checkWinFromMove(board, size, need, index)) {
      score = maximizing ? WIN_SCORE + depth : -WIN_SCORE - depth;
    } else {
      score = minimaxLarge(
        board,
        otherPlayer(current),
        me,
        opponent,
        depth - 1,
        alpha,
        beta,
        size,
        need,
        deadline
      );
    }
    board[index] = null;

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

function depthFor(size) {
  if (size <= 4) return 6;
  if (size === 5) return 5;
  if (size === 6) return 4;
  if (size === 7) return 4;
  return 3;
}

/**
 * Iterative deepening. Neu het gio giua mot do sau thi bo do sau dang do
 * va dung ket qua tot nhat cua do sau da hoan thanh truoc do.
 */
function searchLarge(board, me, opponent, size, need, timeLimit, maxDepth) {
  let candidates = candidateCells(board, size, 2);
  if (!candidates.length) return -1;

  candidates.sort(
    (a, b) =>
      moveOrderScore(board, b, me, opponent, size, need) -
      moveOrderScore(board, a, me, opponent, size, need)
  );

  let best = candidates[0];
  const depthCap = Number.isInteger(maxDepth) && maxDepth > 0 ? maxDepth : depthFor(size);
  const deadline = timeLimit > 0 ? Date.now() + timeLimit : 0;

  for (let depth = 1; depth <= depthCap; depth += 1) {
    const ordered = [best, ...candidates.filter((index) => index !== best)];
    let alpha = -Infinity;
    let localBest = -Infinity;
    let localIndex = ordered[0];
    let completed = true;

    try {
      for (const index of ordered) {
        board[index] = me;
        let score;
        if (checkWinFromMove(board, size, need, index)) {
          score = WIN_SCORE + depth;
        } else {
          score = minimaxLarge(
            board,
            opponent,
            me,
            opponent,
            depth - 1,
            alpha,
            Infinity,
            size,
            need,
            deadline
          );
        }
        board[index] = null;

        if (score > localBest) {
          localBest = score;
          localIndex = index;
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

    best = localIndex;
    candidates = [best, ...candidates.filter((index) => index !== best)];
    if (localBest >= WIN_SCORE) break;
    if (deadline && Date.now() > deadline) break;
  }

  if (best >= 0 && board[best] === null) return best;
  const empties = getEmptyCells(board);
  return empties.length ? empties[0] : -1;
}

// ---------------------------------------------------------------------------
// Ban lon: cac muc do
// ---------------------------------------------------------------------------
function chooseEasyLarge(board, me, opponent, size, need, empties, rng) {
  if (rng() < 0.25) {
    const move = tacticalMove(board, me, opponent, size, need);
    if (move !== null) return move;
  }
  return pick(empties, rng);
}

function chooseMediumLarge(board, me, opponent, size, need, empties, rng) {
  if (rng() < 0.2) return pick(empties, rng);

  const tactical = tacticalMove(board, me, opponent, size, need);
  if (tactical !== null) return tactical;

  const mid = (size - 1) / 2;
  let bestScore = -Infinity;
  let bestMoves = [];

  for (const index of empties) {
    const row = Math.floor(index / size);
    const col = index % size;

    board[index] = me;
    const attack = chainScoreAt(board, index, me, size);
    board[index] = opponent;
    const defense = chainScoreAt(board, index, opponent, size);
    board[index] = null;

    const centerBonus = (size - Math.abs(row - mid) - Math.abs(col - mid)) * 0.8;
    const score = attack + defense * 0.9 + centerBonus;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [index];
    } else if (score === bestScore) {
      bestMoves.push(index);
    }
  }

  return bestMoves.length ? pick(bestMoves, rng) : pick(empties, rng);
}

function chooseHardLarge(board, me, opponent, size, need, empties, timeLimit, maxDepth) {
  if (empties.length === size * size) return centerIndex(size);

  const tactical = tacticalMove(board, me, opponent, size, need);
  if (tactical !== null) return tactical;

  return searchLarge(board, me, opponent, size, need, timeLimit, maxDepth);
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
 * @param {Array} board mang phang size*size (null | 'A' | 'B')
 * @param {'A'|'B'} me quan cua AI
 * @param {'A'|'B'} opponent
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {() => number} rng
 * @param {{size?:number, winLength?:number, timeLimit?:number, maxDepth?:number}} options
 * @returns {number} chi so o, hoac -1 neu ban day
 */
export function chooseMove(
  board,
  me,
  opponent,
  difficulty = 'medium',
  rng = Math.random,
  options = {}
) {
  const size = isValidSize(options.size) ? options.size : sizeFromBoard(board);
  const need =
    Number.isInteger(options.winLength) && options.winLength > 0
      ? options.winLength
      : winLengthFor(size);
  const empties = getEmptyCells(board);
  if (!empties.length) return -1;

  if (size === 3) return chooseMove3(board, me, opponent, difficulty, rng);

  if (difficulty === 'easy') return chooseEasyLarge(board, me, opponent, size, need, empties, rng);
  if (difficulty === 'medium') {
    return chooseMediumLarge(board, me, opponent, size, need, empties, rng);
  }

  const timeLimit =
    Number.isFinite(options.timeLimit) && options.timeLimit >= 0 ? options.timeLimit : 800;
  return chooseHardLarge(board, me, opponent, size, need, empties, timeLimit, options.maxDepth);
}
