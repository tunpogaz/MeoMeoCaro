/**
 * Logic thuan cho ban co 3x3 - 8x8 - khong dung DOM.
 * Dung chung cho AI, giao dien va server (server import truc tiep file nay).
 */

/**
 * Quy tac duy nhat cho moi co ban. Client va server deu doc tu day.
 * size hop le: so nguyen 3..8.
 */
export const BOARD_CONFIGS = Object.freeze({
  3: Object.freeze({ winLength: 3 }),
  4: Object.freeze({ winLength: 4 }),
  5: Object.freeze({ winLength: 5 }),
  6: Object.freeze({ winLength: 5 }),
  7: Object.freeze({ winLength: 5 }),
  8: Object.freeze({ winLength: 5 }),
});

export const DEFAULT_BOARD_SIZE = 3;
export const MIN_BOARD_SIZE = 3;
export const MAX_BOARD_SIZE = 8;

export function isValidSize(size) {
  return Number.isInteger(size) && BOARD_CONFIGS[size] !== undefined;
}

export function normalizeSize(size) {
  return isValidSize(size) ? size : DEFAULT_BOARD_SIZE;
}

export function winLengthFor(size) {
  return BOARD_CONFIGS[normalizeSize(size)].winLength;
}

export function sizeFromBoard(board) {
  if (!Array.isArray(board)) return DEFAULT_BOARD_SIZE;
  const size = Math.sqrt(board.length);
  return isValidSize(size) ? size : DEFAULT_BOARD_SIZE;
}

/** Ban co phang: o (hang r, cot c) co chi so r * size + c. */
export function createBoard(size = DEFAULT_BOARD_SIZE) {
  const safeSize = normalizeSize(size);
  return Array(safeSize * safeSize).fill(null);
}

export function cloneBoard(board) {
  return board.slice();
}

export function otherPlayer(player) {
  return player === 'A' ? 'B' : 'A';
}

export function getEmptyCells(board) {
  const cells = [];
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === null) cells.push(i);
  }
  return cells;
}

export function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}

/**
 * Quet 4 huong quanh nuoc vua danh (ngang, doc, cheo \, cheo /).
 * Tra ve danh sach o cua chuoi thang (co the dai hon winLength) hoac null.
 *
 * Kiem tra bien hang/cot truc tiep tren toa do (r, c), khong cong chi so
 * phang, nen chuoi khong bao gio vong tu cuoi hang sang dau hang ke.
 */
export function checkWinFromMove(board, size, winLength, index) {
  const safeSize = normalizeSize(size);
  const need = Number.isInteger(winLength) && winLength > 0 ? winLength : winLengthFor(safeSize);
  if (!Number.isInteger(index) || index < 0 || index >= safeSize * safeSize) return null;

  const player = board[index];
  if (!player) return null;

  const startRow = Math.floor(index / safeSize);
  const startCol = index % safeSize;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    const line = [index];

    for (const sign of [-1, 1]) {
      let row = startRow + dr * sign;
      let col = startCol + dc * sign;
      while (row >= 0 && row < safeSize && col >= 0 && col < safeSize) {
        const cellIndex = row * safeSize + col;
        if (board[cellIndex] !== player) break;
        if (sign < 0) line.unshift(cellIndex);
        else line.push(cellIndex);
        row += dr * sign;
        col += dc * sign;
      }
    }

    if (line.length >= need) return line;
  }

  return null;
}

/** Tim nguoi thang dau tien tren ban co da co quan. */
export function findWinner(board, size = sizeFromBoard(board), winLength = winLengthFor(size)) {
  for (let i = 0; i < board.length; i += 1) {
    if (!board[i]) continue;
    const line = checkWinFromMove(board, size, winLength, i);
    if (line) return { winner: board[i], line };
  }
  return { winner: null, line: null };
}

export function isDraw(board, size = sizeFromBoard(board), winLength = winLengthFor(size)) {
  return isBoardFull(board) && findWinner(board, size, winLength).winner === null;
}

/** Thang duoc uu tien truoc hoa, ke ca nuoc cuoi lam day ban. */
export function getResult(board, size = sizeFromBoard(board), winLength = winLengthFor(size)) {
  const { winner, line } = findWinner(board, size, winLength);
  if (winner) return { winner, line, draw: false, finished: true };
  if (isBoardFull(board)) return { winner: null, line: null, draw: true, finished: true };
  return { winner: null, line: null, draw: false, finished: false };
}

/** Dat quan neu o con trong. Tra ve true neu dat duoc. */
export function place(board, index, player, size = sizeFromBoard(board)) {
  const safeSize = normalizeSize(size);
  if (!Number.isInteger(index) || index < 0 || index >= safeSize * safeSize) return false;
  if (board[index] !== null) return false;
  board[index] = player;
  return true;
}

/** Ket qua theo goc nhin cua mot nguoi choi: 'win' | 'lose' | 'draw' | null */
export function resultFor(board, player, size = sizeFromBoard(board), winLength = winLengthFor(size)) {
  const result = getResult(board, size, winLength);
  if (!result.finished) return null;
  if (result.draw) return 'draw';
  return result.winner === player ? 'win' : 'lose';
}
