/**
 * Logic thuan cho ban co 3x3 - khong dung DOM.
 * Dung chung cho AI va cac bai kiem thu.
 */

export const BOARD_SIZE = 9;

export const WIN_LINES = Object.freeze([
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]);

export function createBoard() {
  return Array(BOARD_SIZE).fill(null);
}

export function cloneBoard(board) {
  return board.slice();
}

export function otherPlayer(player) {
  return player === 'A' ? 'B' : 'A';
}

export function emptyCells(board) {
  const cells = [];
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (board[i] === null) cells.push(i);
  }
  return cells;
}

export function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}

export function findWinner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const value = board[a];
    if (value !== null && value === board[b] && value === board[c]) {
      return { winner: value, line: [a, b, c] };
    }
  }
  return { winner: null, line: null };
}

export function getResult(board) {
  const { winner, line } = findWinner(board);
  if (winner) return { winner, line, draw: false, finished: true };
  if (isBoardFull(board)) return { winner: null, line: null, draw: true, finished: true };
  return { winner: null, line: null, draw: false, finished: false };
}

/** Dat quan neu o con trong. Tra ve true neu dat duoc. */
export function place(board, index, player) {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return false;
  if (board[index] !== null) return false;
  board[index] = player;
  return true;
}

/** Ket qua theo goc nhin cua mot nguoi choi: 'win' | 'lose' | 'draw' | null */
export function resultFor(board, player) {
  const result = getResult(board);
  if (!result.finished) return null;
  if (result.draw) return 'draw';
  return result.winner === player ? 'win' : 'lose';
}
