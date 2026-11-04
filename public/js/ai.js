/**
 * AI ba muc do cho Meo Meo Caro.
 * - easy:   70% ngau nhien, 30% danh "hop ly" (thang neu co, chan neu co).
 * - medium: thang -> chan -> giua -> goc -> canh, kem 20% ngau nhien.
 * - hard:   minimax + cat tia alpha-beta, khong bao gio thua.
 */
import { WIN_LINES, emptyCells, findWinner, getResult } from './game-core.js';

function pick(list, rng) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** Neu dat quan vao index thi co thang ngay khong? */
function wouldWin(board, index, player) {
  for (const line of WIN_LINES) {
    if (!line.includes(index)) continue;
    let ok = true;
    for (const cell of line) {
      if (cell !== index && board[cell] !== player) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Nuoc thang ngay, neu khong thi nuoc chan doi thu. */
function tacticalMove(board, me, opponent) {
  const empties = emptyCells(board);
  const win = empties.find((index) => wouldWin(board, index, me));
  if (win !== undefined) return win;
  const block = empties.find((index) => wouldWin(board, index, opponent));
  if (block !== undefined) return block;
  return null;
}

function minimax(board, current, me, depth, alpha, beta) {
  const result = getResult(board);
  if (result.finished) {
    if (result.draw) return 0;
    return result.winner === me ? 10 - depth : depth - 10;
  }

  const opponent = current === 'A' ? 'B' : 'A';
  const empties = emptyCells(board);
  let best = current === me ? -Infinity : Infinity;

  for (const index of empties) {
    board[index] = current;
    const score = minimax(board, opponent, me, depth + 1, alpha, beta);
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
function bestMove(board, me, rng) {
  const empties = emptyCells(board);
  let bestScore = -Infinity;
  let bestMoves = [];

  for (const index of empties) {
    board[index] = me;
    const { winner } = findWinner(board);
    let score;
    if (winner === me) score = 10;
    else if (getResult(board).draw) score = 0;
    else score = minimax(board, me === 'A' ? 'B' : 'A', me, 1, -Infinity, Infinity);
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

/**
 * @param {Array} board  mang 9 phan tu (null | 'A' | 'B')
 * @param {'A'|'B'} me   quan cua AI
 * @param {'A'|'B'} opponent
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {() => number} rng ham random (co the bom seed de test)
 * @returns {number} index 0-8, hoac -1 neu ban day
 */
export function chooseMove(board, me, opponent, difficulty = 'medium', rng = Math.random) {
  const empties = emptyCells(board);
  if (!empties.length) return -1;

  if (difficulty === 'easy') {
    if (rng() < 0.3) {
      const move = tacticalMove(board, me, opponent);
      if (move !== null) return move;
    }
    return pick(empties, rng);
  }

  if (difficulty === 'medium') {
    if (rng() < 0.2) return pick(empties, rng);
    const move = tacticalMove(board, me, opponent);
    if (move !== null) return move;
    if (board[4] === null) return 4;
    const corners = [0, 2, 6, 8].filter((index) => board[index] === null);
    if (corners.length) return pick(corners, rng);
    return pick(empties, rng);
  }

  // hard: luon mo ban o giua, sau do minimax toan bo
  if (empties.length === 9) return 4;
  return bestMove(board, me, rng);
}
