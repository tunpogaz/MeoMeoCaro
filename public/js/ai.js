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
  checkWinFromMove,
  findWinner,
  getEmptyCells,
  getResult,
  isBoardFull,
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
