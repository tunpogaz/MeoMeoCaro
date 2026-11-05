/**
 * Logic thuan cho ban co 3x3 va ban vo cuc - khong dung DOM.
 * Dung chung cho AI, giao dien va server (server import truc tiep file nay).
 */

/**
 * Quy tac duy nhat cho moi co ban. Client va server deu doc tu day.
 * size hop le: 3 hoac chuoi 'infinite'.
 */
export const BOARD_CONFIGS = Object.freeze({
  3: Object.freeze({ winLength: 3 }),
});

/**
 * Ban vo cuc: khung khoi dau [-4..4] (9x9), tu noi them 2 o dem quanh hop bao
 * cua moi quan da danh va ket thuc hoa khi cham gioi han ky thuat.
 */
export const INFINITE = Object.freeze({
  winLength: 5,
  initialHalf: 4,
  edgeMargin: 2,
  maxMoves: 2000,
});

export const INFINITE_SIZE = 'infinite';

export const DEFAULT_BOARD_SIZE = 3;
export const MIN_BOARD_SIZE = 3;
export const MAX_BOARD_SIZE = 3;

export function isValidSize(size) {
  return Number.isInteger(size) && BOARD_CONFIGS[size] !== undefined;
}

export function isInfiniteSize(size) {
  return size === INFINITE_SIZE;
}

/** Co ban hop le cho moi che do: 3 hoac 'infinite'. */
export function isValidBoardSize(size) {
  return isValidSize(size) || isInfiniteSize(size);
}

export function normalizeSize(size) {
  return isValidSize(size) ? size : DEFAULT_BOARD_SIZE;
}

export function winLengthFor(size) {
  if (isInfiniteSize(size)) return INFINITE.winLength;
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

// ---------------------------------------------------------------------------
// Ban vo cuc (toa do nguyen, luu thua bang Map)
// ---------------------------------------------------------------------------
export function cellKey(x, y) {
  return `${x},${y}`;
}

export function parseCellKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
}

/**
 * Vung cho phep danh: hop cua khung khoi dau [-initialHalf..initialHalf]
 * va hop bao cua moi quan da danh noi them edgeMargin moi phia.
 * Cang danh ra xa, vung cang mo rong va khong bao gio co lai.
 */
export function computeRegion(moves = []) {
  const half = INFINITE.initialHalf;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hasStone = false;

  if (Array.isArray(moves)) {
    for (const move of moves) {
      if (!move || !Number.isInteger(move.x) || !Number.isInteger(move.y)) continue;
      hasStone = true;
      if (move.x < minX) minX = move.x;
      if (move.x > maxX) maxX = move.x;
      if (move.y < minY) minY = move.y;
      if (move.y > maxY) maxY = move.y;
    }
  }

  if (!hasStone) {
    return { minX: -half, maxX: half, minY: -half, maxY: half };
  }

  return {
    minX: Math.min(-half, minX - INFINITE.edgeMargin),
    maxX: Math.max(half, maxX + INFINITE.edgeMargin),
    minY: Math.min(-half, minY - INFINITE.edgeMargin),
    maxY: Math.max(half, maxY + INFINITE.edgeMargin),
  };
}

export function regionWidth(region) {
  return region.maxX - region.minX + 1;
}

export function regionHeight(region) {
  return region.maxY - region.minY + 1;
}

export function isInRegion(region, x, y) {
  if (!region) return false;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  return x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY;
}

/** Trang thai ∞ rong de bat dau mot van. */
export function createInfiniteState() {
  return {
    mode: INFINITE_SIZE,
    cells: new Map(),
    moves: [],
    region: computeRegion([]),
  };
}

/**
 * Dung lai trang thai tu danh sach nuoc di (rejoin / worker / AI).
 * Bo qua nuoc di sai dinh dang hoac trung o.
 */
export function infiniteStateFromMoves(moves = []) {
  const cells = new Map();
  const clean = [];
  if (Array.isArray(moves)) {
    for (const move of moves) {
      if (!move || !Number.isInteger(move.x) || !Number.isInteger(move.y)) continue;
      const symbol = move.s === 'A' || move.s === 'B' ? move.s : null;
      if (!symbol) continue;
      const key = cellKey(move.x, move.y);
      if (cells.has(key)) continue;
      cells.set(key, symbol);
      clean.push({ x: move.x, y: move.y, s: symbol });
    }
  }
  return {
    mode: INFINITE_SIZE,
    cells,
    moves: clean,
    region: computeRegion(clean),
  };
}

/**
 * Dat quan tai (x, y) neu o trong va nam trong vung hien tai.
 * Cap nhat moves va region. Tra ve true neu dat duoc.
 */
export function placeInfinite(state, x, y, symbol) {
  if (!state || !(state.cells instanceof Map)) return false;
  if (symbol !== 'A' && symbol !== 'B') return false;
  if (!isInRegion(state.region, x, y)) return false;
  const key = cellKey(x, y);
  if (state.cells.has(key)) return false;

  state.cells.set(key, symbol);
  state.moves.push({ x, y, s: symbol });
  state.region = computeRegion(state.moves);
  return true;
}

/**
 * Quet 4 huong quanh (x, y) tren Map. Khong co khai niem mep ban nen chuoi
 * co the dai hon winLength va khong bao gio vong qua mep.
 * Tra ve danh sach {x, y} theo thu tu chuoi, hoac null.
 */
export function checkWinInfinite(cells, x, y, symbol, winLength = INFINITE.winLength) {
  if (!(cells instanceof Map)) return null;
  if (symbol !== 'A' && symbol !== 'B') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (cells.get(cellKey(x, y)) !== symbol) return null;

  const need = Number.isInteger(winLength) && winLength > 0 ? winLength : INFINITE.winLength;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dx, dy] of directions) {
    const line = [{ x, y }];
    for (const sign of [-1, 1]) {
      let step = 1;
      while (cells.get(cellKey(x + dx * step * sign, y + dy * step * sign)) === symbol) {
        const point = { x: x + dx * step * sign, y: y + dy * step * sign };
        if (sign < 0) line.unshift(point);
        else line.push(point);
        step += 1;
      }
    }
    if (line.length >= need) return line;
  }

  return null;
}

/**
 * Ket qua hien tai cua van ∞: xet nuoc cuoi co tao chuoi thang khong,
 * sau do moi xet gioi han maxMoves (hoa ky thuat).
 */
export function infiniteResult(state, maxMoves = INFINITE.maxMoves) {
  const moves = Array.isArray(state?.moves) ? state.moves : [];
  const cells = state?.cells instanceof Map ? state.cells : new Map();

  if (moves.length) {
    const last = moves[moves.length - 1];
    const line = checkWinInfinite(cells, last.x, last.y, last.s);
    if (line) return { winner: last.s, line, draw: false, finished: true, limit: false };
  }

  if (moves.length >= maxMoves) {
    return { winner: null, line: null, draw: true, finished: true, limit: true };
  }

  return { winner: null, line: null, draw: false, finished: false, limit: false };
}

/** Tat ca o trong trong vung hien tai (server dung khi het gio luot). */
export function getInfiniteEmptyCells(cells, region) {
  const empty = [];
  if (!region) return empty;
  const map = cells instanceof Map ? cells : new Map();
  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      if (!map.has(cellKey(x, y))) empty.push({ x, y });
    }
  }
  return empty;
}
