/**
 * Kiem thu logic ban co 3x3 va ban vo cuc, cung AI.
 * AI Kho 3x3 duoc kiem tra vet can: duyet moi nuoc cua doi thu va moi nuoc
 * toi uu ma AI co the chon (thay doi ngau nhien giua cac nuoc ngang diem).
 */
import assert from 'node:assert/strict';
import {
  applyUndo,
  BOARD_CONFIGS,
  INFINITE,
  INFINITE_SIZE,
  cellKey,
  checkWinFromMove,
  checkWinInfinite,
  computeRegion,
  createBoard,
  createInfiniteState,
  findWinner,
  getEmptyCells,
  getInfiniteEmptyCells,
  getResult,
  infiniteResult,
  infiniteStateFromMoves,
  isInRegion,
  isInfiniteSize,
  isValidBoardSize,
  isValidSize,
  otherPlayer,
  place,
  placeInfinite,
  regionHeight,
  regionWidth,
  undoTargetCount,
  winLengthFor,
} from '../public/js/game-core.js';
import { chooseInfiniteMove, chooseMove } from '../public/js/ai.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const SIZES = [3];

console.log('game-core');

check('cau hinh co ban 3 dung luat thang', () => {
  assert.deepEqual(Object.keys(BOARD_CONFIGS).map(Number), SIZES);
  assert.deepEqual(
    SIZES.map((size) => winLengthFor(size)),
    [3]
  );
  for (const size of SIZES) assert.equal(isValidSize(size), true);
  for (const bad of [2, 4, 5, 6, 7, 8, 9, 3.5, '4', null, undefined]) assert.equal(isValidSize(bad), false);
});

check('tao ban co dung kich thuoc va chi so phang', () => {
  for (const size of SIZES) {
    const board = createBoard(size);
    assert.equal(board.length, size * size);
    assert.equal(board.every((cell) => cell === null), true);
    place(board, size * size - 1, 'A', size);
    assert.equal(board[size * size - 1], 'A');
    assert.equal(place(board, size * size, 'B', size), false);
    assert.equal(getEmptyCells(board).length, size * size - 1);
  }
});

check('thang o goc / canh / giua theo 4 huong tren moi co ban', () => {
  for (const size of SIZES) {
    const need = winLengthFor(size);
    const starts = [
      [0, 0],
      [0, size - need],
      [size - need, 0],
      [size - need, size - need],
      [Math.floor((size - need) / 2), Math.floor((size - need) / 2)],
      [0, Math.floor(size / 2)],
      [size - need, Math.floor(size / 2)],
    ];
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [startRow, startCol] of starts) {
      for (const [dr, dc] of directions) {
        const endRow = startRow + dr * (need - 1);
        const endCol = startCol + dc * (need - 1);
        if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;

        const board = createBoard(size);
        const line = [];
        for (let step = 0; step < need; step += 1) {
          const index = (startRow + dr * step) * size + (startCol + dc * step);
          board[index] = 'A';
          line.push(index);
        }
        const last = line[line.length - 1];
        assert.deepEqual(
          checkWinFromMove(board, size, need, last),
          line,
          `size ${size} start ${startRow},${startCol} dir ${dr},${dc}`
        );
        assert.equal(getResult(board, size, need).winner, 'A');
      }
    }
  }
});

check('chuoi ngan hon luat thang khong thang', () => {
  for (const size of SIZES) {
    const need = winLengthFor(size);
    if (need > size) continue;
    const board = createBoard(size);
    for (let col = 0; col < need - 1; col += 1) board[col] = 'A';
    assert.equal(checkWinFromMove(board, size, need, need - 2), null);
    assert.equal(getResult(board, size, need).finished, false);
  }
});

check('chuoi khong vong tu cuoi hang sang dau hang (3x3)', () => {
  // Hai o cuoi hang 0 va o dau hang 1 nam lien nhau trong mang phang
  // (chi so 1, 2, 3) nhung khong phai mot duong thang.
  const board = createBoard(3);
  board[1] = 'B';
  board[2] = 'B';
  board[3] = 'B';
  assert.equal(checkWinFromMove(board, 3, 3, 2), null);
  assert.equal(checkWinFromMove(board, 3, 3, 3), null);
  assert.equal(getResult(board, 3, 3).finished, false);
});

check('chuoi dai hon luat (overline) van thang va tra ve ca chuoi', () => {
  for (const size of SIZES) {
    const need = winLengthFor(size);
    if (need + 1 > size) continue;
    const board = createBoard(size);
    for (let col = 0; col <= need; col += 1) board[col] = 'B';
    const line = checkWinFromMove(board, size, need, need);
    assert.equal(line.length, need + 1);
    assert.deepEqual(line, Array.from({ length: need + 1 }, (_, i) => i));
    assert.equal(findWinner(board, size, need).winner, 'B');
  }
});

check('hoa chi khi day ban va khong ai thang (3x3)', () => {
  const almost = ['A', 'B', 'A', 'A', 'B', 'B', 'B', 'A', null];
  assert.equal(getResult(almost, 3, 3).finished, false);
  const draw = [...almost.slice(0, 8), 'B'];
  assert.equal(getResult(draw, 3, 3).draw, true);
});

check('nuoc cuoi tao thanh thang duoc uu tien hon hoa', () => {
  const board = ['A', 'A', null, 'B', 'B', 'A', 'B', 'A', 'B'];
  board[2] = 'A';
  assert.equal(board.every(Boolean), true);
  const result = getResult(board, 3, 3);
  assert.equal(result.winner, 'A');
  assert.equal(result.draw, false);
});

check('place tu choi o ngoai pham vi / o da co quan', () => {
  const board = createBoard(3);
  assert.equal(place(board, 0, 'A'), true);
  assert.equal(place(board, 0, 'B'), false);
  assert.equal(place(board, -1, 'A'), false);
  assert.equal(place(board, 9, 'A'), false);
  assert.equal(place(board, 1.5, 'A'), false);
  assert.deepEqual(getEmptyCells(board), [1, 2, 3, 4, 5, 6, 7, 8]);
});

// ---------------------------------------------------------------------------
// Di lai (undo) — logic thuan
// ---------------------------------------------------------------------------
function finiteStateFromMoves(moves, size = 3) {
  const board = createBoard(size);
  for (const move of moves) board[move.i] = move.s;
  return { size, board, moves: moves.map((move) => ({ ...move })) };
}

check('undo 3x3: bo nuoc cua nguoi xin, giu nuoc truoc do', () => {
  const moves = [
    { i: 0, s: 'A' },
    { i: 4, s: 'B' },
    { i: 1, s: 'A' },
  ];
  assert.equal(undoTargetCount(moves, 'A'), 2);
  const state = finiteStateFromMoves(moves);
  const next = applyUndo(state, 'A');

  assert.ok(next);
  assert.deepEqual(next.moves, [
    { i: 0, s: 'A' },
    { i: 4, s: 'B' },
  ]);
  assert.equal(next.turn, 'A');
  assert.equal(next.lastMove, 4);
  assert.equal(next.board[0], 'A');
  assert.equal(next.board[4], 'B');
  assert.equal(next.board[1], null);
  assert.equal(next.finished, false);

  // Khong sua state goc.
  assert.equal(state.moves.length, 3);
  assert.equal(state.board[1], 'A');
  assert.equal(state.turn, undefined);
});

check('undo 3x3: doi thu da dap thi bo ca hai nuoc', () => {
  const moves = [
    { i: 0, s: 'A' },
    { i: 4, s: 'B' },
    { i: 1, s: 'A' },
    { i: 2, s: 'B' },
  ];
  assert.equal(undoTargetCount(moves, 'A'), 2);
  const next = applyUndo(finiteStateFromMoves(moves), 'A');
  assert.deepEqual(next.moves, [
    { i: 0, s: 'A' },
    { i: 4, s: 'B' },
  ]);
  assert.equal(next.turn, 'A');
  assert.equal(next.lastMove, 4);
  assert.equal(next.board[2], null);
});

check('undo 3x3: nguoi di sau chi bo mot nuoc khi doi thu chua dap', () => {
  const moves = [
    { i: 0, s: 'A' },
    { i: 4, s: 'B' },
  ];
  assert.equal(undoTargetCount(moves, 'B'), 1);
  const next = applyUndo(finiteStateFromMoves(moves), 'B');
  assert.deepEqual(next.moves, [{ i: 0, s: 'A' }]);
  assert.equal(next.turn, 'B');
  assert.equal(next.lastMove, 0);
});

check('undo 3x3: tu choi khi khong co nuoc cua nguoi xin', () => {
  assert.equal(undoTargetCount([], 'A'), null);
  assert.equal(undoTargetCount([{ i: 0, s: 'A' }], 'B'), null);
  assert.equal(undoTargetCount(null, 'A'), null);
  assert.equal(undoTargetCount([{ i: 0, s: 'A' }], 'C'), null);
  assert.equal(applyUndo(finiteStateFromMoves([{ i: 0, s: 'A' }]), 'B'), null);
  assert.equal(applyUndo(null, 'A'), null);
});

check('undo 3x3: tu choi khi van da ket thuc', () => {
  const moves = [
    { i: 0, s: 'A' },
    { i: 3, s: 'B' },
    { i: 1, s: 'A' },
    { i: 4, s: 'B' },
    { i: 2, s: 'A' },
  ];
  const state = finiteStateFromMoves(moves);
  state.finished = true;
  assert.equal(applyUndo(state, 'A'), null);
  const state2 = finiteStateFromMoves(moves);
  state2.status = 'finished';
  assert.equal(applyUndo(state2, 'A'), null);
});

check('undo 3x3: nhieu lan lien tiep va nguoi di truoc khac nhau', () => {
  const moves = [
    { i: 0, s: 'A' },
    { i: 4, s: 'B' },
    { i: 1, s: 'A' },
    { i: 2, s: 'B' },
    { i: 3, s: 'A' },
  ];
  const once = applyUndo(finiteStateFromMoves(moves), 'A');
  assert.equal(once.moves.length, 4);
  const twice = applyUndo(once, 'A');
  assert.equal(twice.moves.length, 2);
  assert.equal(twice.lastMove, 4);
  assert.deepEqual(twice.moves, [
    { i: 0, s: 'A' },
    { i: 4, s: 'B' },
  ]);

  const bFirst = applyUndo(
    finiteStateFromMoves([
      { i: 4, s: 'B' },
      { i: 0, s: 'A' },
    ]),
    'B'
  );
  assert.deepEqual(bFirst.moves, []);
  assert.equal(bFirst.lastMove, null);
  assert.equal(bFirst.turn, 'B');
  assert.equal(bFirst.board.every((cell) => cell === null), true);
});

check('undo ∞: dung lai cells, region nho lai, lastMove dung', () => {
  const state = infiniteMoves([
    { x: 4, y: 4, s: 'A' },
    { x: 5, y: 5, s: 'B' },
    { x: -4, y: -4, s: 'A' },
  ]);
  const before = { ...state.region };
  assert.equal(state.region.minX, -6);

  const next = applyUndo(state, 'A');
  assert.ok(next);
  assert.deepEqual(next.moves, [
    { x: 4, y: 4, s: 'A' },
    { x: 5, y: 5, s: 'B' },
  ]);
  assert.equal(next.turn, 'A');
  assert.deepEqual(next.lastMove, { x: 5, y: 5 });
  assert.equal(next.cells.has(cellKey(-4, -4)), false);
  assert.equal(next.cells.get(cellKey(5, 5)), 'B');
  assert.equal(next.region.minX, -4);
  assert.equal(next.region.maxX, 7);
  assert.ok(next.region.minX > before.minX, 'vung phai nho lai');
  assert.equal(state.moves.length, 3);
  assert.equal(state.cells.has(cellKey(-4, -4)), true);
});

check('undo ∞: doi thu da dap thi bo hai nuoc, giu dung luot', () => {
  const state = infiniteMoves([
    { x: 0, y: 0, s: 'A' },
    { x: 1, y: 0, s: 'B' },
    { x: 0, y: 1, s: 'A' },
    { x: 1, y: 1, s: 'B' },
  ]);
  const next = applyUndo(state, 'A');
  assert.deepEqual(next.moves, [
    { x: 0, y: 0, s: 'A' },
    { x: 1, y: 0, s: 'B' },
  ]);
  assert.equal(next.turn, 'A');
  assert.deepEqual(next.lastMove, { x: 1, y: 0 });
  assert.equal(next.cells.has(cellKey(0, 1)), false);
});

check('undo ∞: nguoi di truoc B quay ve ban trong', () => {
  const state = infiniteMoves([
    { x: 0, y: 0, s: 'B' },
    { x: 1, y: 0, s: 'A' },
  ]);
  const next = applyUndo(state, 'B');
  assert.deepEqual(next.moves, []);
  assert.equal(next.turn, 'B');
  assert.equal(next.lastMove, null);
  assert.deepEqual(next.region, computeRegion([]));
  assert.equal(next.cells.size, 0);
  assert.equal(applyUndo(next, 'B'), null);
});

console.log('AI');

check('AI 3x3 Kho luon mo ban o giua', () => {
  const board = createBoard(3);
  assert.equal(chooseMove(board, 'A', 'B', 'hard', () => 0), 4);
  assert.equal(chooseMove(board, 'B', 'A', 'hard', () => 0.9), 4);
});

check('AI 3x3 Vua uu tien thang ngay', () => {
  const board = createBoard(3);
  board[0] = 'A';
  board[1] = 'A';
  board[3] = 'B';
  board[4] = 'B';
  assert.equal(chooseMove(board, 'A', 'B', 'medium', () => 0.5), 2);
});

check('AI 3x3 Vua chan khi doi thu sap thang', () => {
  const board = createBoard(3);
  board[3] = 'B';
  board[4] = 'B';
  board[0] = 'A';
  assert.equal(chooseMove(board, 'A', 'B', 'medium', () => 0.5), 5);
});

check('AI 3x3 Vua chiem giua roi den goc', () => {
  const emptyBoard = createBoard(3);
  assert.equal(chooseMove(emptyBoard, 'A', 'B', 'medium', () => 0.5), 4);

  const board = createBoard(3);
  board[4] = 'B';
  board[0] = 'A';
  const move = chooseMove(board, 'A', 'B', 'medium', () => 0.5);
  assert.ok([2, 6, 8].includes(move), `expected a corner, got ${move}`);
});

check('AI Kho 3x3 khong bao gio thua (duyet vet can)', () => {
  const AI = ['A', 'B'];
  const total = { win: 0, draw: 0, lose: 0 };

  for (const ai of AI) {
    const opponent = otherPlayer(ai);
    const memo = new Set();
    const moveCache = new Map();

    const aiMoves = (board) => {
      const key = `${ai}:${board.map((cell) => cell || '-').join('')}`;
      if (moveCache.has(key)) return moveCache.get(key);
      const moves = new Set();
      for (let i = 0; i < 90; i += 1) {
        moves.add(chooseMove(board, ai, opponent, 'hard', () => (i + 0.5) / 90));
      }
      const result = [...moves].filter((move) => move >= 0);
      assert.ok(result.length > 0, 'AI phai chon duoc nuoc di');
      moveCache.set(key, result);
      return result;
    };

    const search = (board, turn) => {
      const result = getResult(board, 3, 3);
      if (result.finished) {
        const outcome = result.draw ? 'draw' : result.winner === ai ? 'win' : 'lose';
        assert.notEqual(
          outcome,
          'lose',
          `AI ${ai} thua voi ban co ${board.map((cell) => cell || '-').join('')}`
        );
        total[outcome] += 1;
        return;
      }

      const key = `${ai}|${turn}|${board.map((cell) => cell || '-').join('')}`;
      if (memo.has(key)) return;
      memo.add(key);

      const moves = turn === ai ? aiMoves(board) : getEmptyCells(board);
      for (const move of moves) {
        const next = board.slice();
        next[move] = turn;
        search(next, otherPlayer(turn));
      }
    };

    search(createBoard(3), 'A');
  }

  assert.equal(total.lose, 0);
  assert.ok(total.win + total.draw > 100, 'phai duyet duoc nhieu the co');
  console.log(
    `     da kiem tra ${total.win + total.draw} the ket thuc: thang ${total.win}, hoa ${total.draw}`
  );
});

check('AI moi do kho / moi co ban chi tra ve o trong hop le', () => {
  for (const size of SIZES) {
    const empty = createBoard(size);
    const mid = createBoard(size);
    mid[0] = 'A';
    mid[Math.floor((size * size) / 2)] = 'B';
    mid[size * size - 1] = 'A';
    const full = createBoard(size);
    for (let i = 0; i < full.length; i += 1) full[i] = i % 2 ? 'A' : 'B';

    for (const board of [empty, mid, full]) {
      const empties = getEmptyCells(board);
      for (const difficulty of ['easy', 'medium', 'hard']) {
        const move = chooseMove(board, 'B', 'A', difficulty, () => 0.37, {
          size,
          timeLimit: 20,
        });
        if (!empties.length) {
          assert.equal(move, -1, `size ${size} ${difficulty} full board`);
        } else {
          assert.ok(
            empties.includes(move),
            `size ${size} ${difficulty} returned ${move}`
          );
        }
      }
    }
  }
});

check('AI tu choi: hang chuc van moi co ban deu ket thuc hop le', () => {
  const games = [];
  for (const size of SIZES) {
    for (let i = 0; i < 6; i += 1) {
      games.push({ size, easy: 'A', medium: 'B' });
      games.push({ size, easy: 'B', medium: 'A' });
    }
  }

  let movesPlayed = 0;
  let finishedGames = 0;
  for (const game of games) {
    const board = createBoard(game.size);
    const need = winLengthFor(game.size);
    let turn = 'A';
    let result = getResult(board, game.size, need);
    for (let step = 0; step < game.size * game.size && !result.finished; step += 1) {
      const difficulty = turn === game.easy ? 'easy' : 'medium';
      const move = chooseMove(board, turn, otherPlayer(turn), difficulty, Math.random, {
        size: game.size,
      });
      assert.ok(move >= 0 && move < board.length, `bad move ${move}`);
      assert.equal(board[move], null, `occupied move ${move}`);
      board[move] = turn;
      movesPlayed += 1;
      result = getResult(board, game.size, need);
      turn = otherPlayer(turn);
    }
    assert.equal(result.finished, true, `size ${game.size} game did not finish`);
    if (result.winner === null) assert.equal(result.draw, true);
    finishedGames += 1;
  }

  assert.ok(games.length >= 12, 'phai choi nhieu van 3x3');
  console.log(`     da choi ${finishedGames} van, ${movesPlayed} nuoc`);
});

console.log('ban vo cuc');

function infiniteMoves(entries) {
  return infiniteStateFromMoves(entries);
}

check('∞: kich thuoc, vung rong 9x9 va mo rong khong bao gio co lai', () => {
  assert.equal(isInfiniteSize(INFINITE_SIZE), true);
  assert.equal(isValidBoardSize(INFINITE_SIZE), true);
  assert.equal(isValidBoardSize('Infinite'), false);
  assert.equal(winLengthFor(INFINITE_SIZE), 5);

  const emptyRegion = computeRegion([]);
  assert.deepEqual(emptyRegion, { minX: -4, maxX: 4, minY: -4, maxY: 4 });
  assert.equal(regionWidth(emptyRegion), 9);
  assert.equal(regionHeight(emptyRegion), 9);

  const far = computeRegion([{ x: 20, y: -30 }]);
  assert.deepEqual(far, { minX: -4, maxX: 22, minY: -32, maxY: 4 });

  const backToCenter = computeRegion([{ x: 20, y: -30 }, { x: 0, y: 0 }]);
  assert.deepEqual(backToCenter, far);

  const state = createInfiniteState();
  let previous = state.region;
  for (const [x, y] of [[0, 0], [4, 4], [-4, 0], [4, -4], [5, 5], [-6, 3]]) {
    assert.equal(placeInfinite(state, x, y, state.moves.length % 2 ? 'B' : 'A'), true);
    const next = state.region;
    assert.ok(next.minX <= previous.minX, 'minX must not shrink');
    assert.ok(next.maxX >= previous.maxX, 'maxX must not shrink');
    assert.ok(next.minY <= previous.minY, 'minY must not shrink');
    assert.ok(next.maxY >= previous.maxY, 'maxY must not shrink');
    previous = next;
  }
  assert.deepEqual(previous, { minX: -8, maxX: 7, minY: -6, maxY: 7 });
});

check('∞: dat quan tu choi toa do sai, ngoai vung va o da co', () => {
  const state = createInfiniteState();
  assert.equal(placeInfinite(state, 5, 0, 'A'), false);
  assert.equal(placeInfinite(state, 0.5, 0, 'A'), false);
  assert.equal(placeInfinite(state, 0, 0, 'X'), false);
  assert.equal(placeInfinite(state, 0, 0, 'A'), true);
  assert.equal(placeInfinite(state, 0, 0, 'B'), false);
  assert.deepEqual(state.moves, [{ x: 0, y: 0, s: 'A' }]);
  assert.equal(state.cells.get(cellKey(0, 0)), 'A');

  assert.equal(isInRegion(state.region, 0, 0), true);
  assert.equal(isInRegion(state.region, 4, -4), true);
  assert.equal(isInRegion(state.region, 5, 0), false);
  assert.equal(isInRegion(state.region, 0.5, 0), false);
  assert.equal(isInRegion(state.region, null, 0), false);
});

check('∞: thang 5 va overline theo ca 4 huong voi toa do am', () => {
  const cases = [
    { start: { x: -3, y: -2 }, dir: { x: 0, y: 1 } },
    { start: { x: 2, y: -4 }, dir: { x: 1, y: 0 } },
    { start: { x: -5, y: -5 }, dir: { x: 1, y: 1 } },
    { start: { x: -5, y: 5 }, dir: { x: 1, y: -1 } },
  ];

  for (const { start, dir } of cases) {
    const cells = new Map();
    const expected = [];
    for (let step = 0; step < 5; step += 1) {
      const point = { x: start.x + dir.x * step, y: start.y + dir.y * step };
      cells.set(cellKey(point.x, point.y), 'A');
      expected.push(point);
    }
    const last = expected[expected.length - 1];
    assert.deepEqual(checkWinInfinite(cells, last.x, last.y, 'A'), expected);

    const four = new Map(cells);
    four.delete(cellKey(last.x, last.y));
    const before = expected[expected.length - 2];
    assert.equal(checkWinInfinite(four, before.x, before.y, 'A'), null);
  }

  const overlineCells = new Map();
  for (let x = 0; x <= 5; x += 1) overlineCells.set(cellKey(x, 0), 'B');
  const overline = checkWinInfinite(overlineCells, 5, 0, 'B');
  assert.equal(overline.length, 6);
  assert.deepEqual(
    overline,
    Array.from({ length: 6 }, (_, x) => ({ x, y: 0 }))
  );
  assert.equal(checkWinInfinite(overlineCells, 5, 0, 'A'), null);
});

check('∞: ket qua uu tien thang nuoc cuoi roi moi hoa ky thuat', () => {
  const state = infiniteMoves([
    { x: 0, y: 0, s: 'A' },
    { x: 0, y: 1, s: 'B' },
    { x: 0, y: 2, s: 'A' },
  ]);
  const limited = infiniteResult(state, 3);
  assert.equal(limited.finished, true);
  assert.equal(limited.draw, true);
  assert.equal(limited.limit, true);
  assert.equal(infiniteResult(state, 4).finished, false);

  const winning = infiniteMoves([
    { x: -2, y: -1, s: 'A' },
    { x: 2, y: 2, s: 'B' },
    { x: -1, y: -1, s: 'A' },
    { x: 2, y: 3, s: 'B' },
    { x: 0, y: -1, s: 'A' },
    { x: 2, y: 4, s: 'B' },
    { x: 1, y: -1, s: 'A' },
    { x: 2, y: 5, s: 'B' },
    { x: 2, y: -1, s: 'A' },
  ]);
  const result = infiniteResult(winning, 5);
  assert.equal(result.winner, 'A');
  assert.equal(result.draw, false);
  assert.equal(result.limit, false);
  assert.deepEqual(
    result.line,
    [-2, -1, 0, 1, 2].map((x) => ({ x, y: -1 }))
  );
});

check('∞: dung lai trang thai bo qua nuoc sai va nuoc trung o', () => {
  const built = infiniteStateFromMoves([
    { x: 0, y: 0, s: 'A' },
    { x: 0, y: 0, s: 'B' },
    { x: 1.5, y: 2, s: 'A' },
    { x: '1', y: 2, s: 'A' },
    null,
    { x: 2, y: 2, s: 'C' },
    { x: 3, y: 3, s: 'B' },
  ]);
  assert.deepEqual(built.moves, [
    { x: 0, y: 0, s: 'A' },
    { x: 3, y: 3, s: 'B' },
  ]);
  assert.equal(built.cells.size, 2);
  assert.deepEqual(built.region, { minX: -4, maxX: 5, minY: -4, maxY: 5 });
});

check('∞: o trong trong vung dung so luong', () => {
  const state = createInfiniteState();
  const empty = getInfiniteEmptyCells(state.cells, state.region);
  assert.equal(empty.length, 81);
  assert.ok(empty.some((cell) => cell.x === -4 && cell.y === -4));
  assert.ok(empty.some((cell) => cell.x === 4 && cell.y === 4));
  assert.equal(placeInfinite(state, 0, 0, 'A'), true);
  const after = getInfiniteEmptyCells(state.cells, state.region);
  assert.equal(after.length, 80);
  assert.ok(!after.some((cell) => cell.x === 0 && cell.y === 0));
});

console.log('AI vo cuc');

check('∞: AI danh nuoc dau tien o goc toa do (0, 0)', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    assert.deepEqual(
      chooseInfiniteMove(createInfiniteState(), 'A', 'B', difficulty, () => 0.5),
      { x: 0, y: 0 }
    );
  }
});

check('∞: AI thang ngay khi co 4 quan lien tiep', () => {
  const state = infiniteMoves([
    { x: -1, y: 0, s: 'A' },
    { x: 0, y: 0, s: 'A' },
    { x: 1, y: 0, s: 'A' },
    { x: 2, y: 0, s: 'A' },
    { x: 0, y: 1, s: 'B' },
    { x: 1, y: 1, s: 'B' },
    { x: -2, y: -2, s: 'B' },
  ]);
  const move = chooseInfiniteMove(state, 'A', 'B', 'medium', () => 0.5);
  assert.ok(move, 'AI phai tra ve nuoc di');
  assert.equal(move.y, 0);
  assert.ok(move.x === 3 || move.x === -2, `expected a winning end, got ${JSON.stringify(move)}`);
});

check('∞: AI chan ngay khi doi thu co 4 quan lien tiep', () => {
  const state = infiniteMoves([
    { x: -1, y: 0, s: 'B' },
    { x: 0, y: 0, s: 'B' },
    { x: 1, y: 0, s: 'B' },
    { x: 2, y: 0, s: 'B' },
    { x: 0, y: 1, s: 'A' },
    { x: 0, y: -1, s: 'A' },
    { x: 1, y: 1, s: 'A' },
  ]);
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const move = chooseInfiniteMove(state, 'A', 'B', difficulty, () => 0.1, {
      timeLimit: 120,
    });
    assert.ok(move, `AI ${difficulty} phai tra ve nuoc di`);
    assert.equal(move.y, 0);
    assert.ok(
      move.x === 3 || move.x === -2,
      `AI ${difficulty} expected a blocking end, got ${JSON.stringify(move)}`
    );
  }
});

check('∞: AI Kho tra nuoc hop le trong thoi gian gioi han', () => {
  const state = infiniteMoves([
    { x: 0, y: 0, s: 'A' },
    { x: 1, y: 0, s: 'B' },
    { x: 0, y: 1, s: 'A' },
    { x: -1, y: 2, s: 'B' },
    { x: 2, y: 2, s: 'A' },
    { x: -2, y: -1, s: 'B' },
    { x: 3, y: 3, s: 'A' },
    { x: -3, y: 1, s: 'B' },
  ]);
  const start = Date.now();
  const move = chooseInfiniteMove(state, 'A', 'B', 'hard', Math.random, {
    timeLimit: 150,
  });
  const elapsed = Date.now() - start;
  assert.ok(move, 'AI phai tra ve nuoc di');
  assert.equal(isInRegion(state.region, move.x, move.y), true);
  assert.equal(state.cells.has(cellKey(move.x, move.y)), false);
  assert.ok(elapsed < 1500, `hard AI took ${elapsed}ms`);
});

check('∞: AI tu danh nhau moi nuoc deu hop le va vung chi mo rong', () => {
  const state = createInfiniteState();
  const seen = new Set();
  let previous = state.region;
  let finished = false;

  for (let step = 0; step < 30 && !finished; step += 1) {
    const me = step % 2 === 0 ? 'A' : 'B';
    const difficulty = step % 3 === 0 ? 'medium' : 'easy';
    const move = chooseInfiniteMove(state, me, otherPlayer(me), difficulty, () => {
      return ((step * 37 + 11) % 100) / 100;
    });
    assert.ok(move, `nuoc ${step} khong duoc null`);
    assert.equal(isInRegion(state.region, move.x, move.y), true, `nuoc ${step} ngoai vung`);
    assert.equal(state.cells.has(cellKey(move.x, move.y)), false, `nuoc ${step} trung o`);
    assert.equal(placeInfinite(state, move.x, move.y, me), true);
    seen.add(cellKey(move.x, move.y));

    const next = state.region;
    assert.ok(next.minX <= previous.minX && next.maxX >= previous.maxX);
    assert.ok(next.minY <= previous.minY && next.maxY >= previous.maxY);
    previous = next;
    finished = infiniteResult(state).finished;
  }

  assert.ok(state.moves.length >= 10, `only ${state.moves.length} moves played`);
  assert.ok(finished || state.moves.length === 30, 'van phai ket thuc hoac du 30 nuoc');
  if (finished) assert.equal(infiniteResult(state).finished, true);
  assert.equal(seen.size, state.moves.length);
});

check('AI Kho 3x3 van khong thua sau nhieu lan di lai (mo phong)', () => {
  let undoCount = 0;
  for (const human of ['A', 'B']) {
    const ai = otherPlayer(human);
    for (let game = 0; game < 6; game += 1) {
      let board = createBoard(3);
      let moves = [];
      let turn = human;

      for (let step = 0; step < 9; step += 1) {
        if (getResult(board, 3, 3).finished) break;
        if (turn === human) {
          const empty = getEmptyCells(board);
          if (!empty.length) break;
          const index = empty[(game * 5 + step * 3 + 1) % empty.length];
          board[index] = human;
          moves.push({ i: index, s: human });
          turn = ai;
        } else {
          const index = chooseMove(board, ai, human, 'hard', Math.random);
          assert.ok(index >= 0 && board[index] === null, 'AI phai chon o trong');
          board[index] = ai;
          moves.push({ i: index, s: ai });
          turn = human;
        }

        if (step === 1 || step === 3) {
          const next = applyUndo(
            { size: 3, board: board.slice(), moves: moves.map((move) => ({ ...move })) },
            human
          );
          assert.ok(next, 'phai di lai duoc');
          assert.ok(next.moves.length < moves.length, 'phai bo it nhat mot nuoc');
          moves = next.moves;
          board = next.board;
          turn = human;
          undoCount += 1;
        }
      }

      const result = getResult(board, 3, 3);
      assert.notEqual(result.winner, human, `AI ${ai} thua o van ${game}`);
    }
  }
  assert.ok(undoCount >= 12, `chi di lai ${undoCount} lan`);
});

console.log(`\n${passed} tests passed`);
