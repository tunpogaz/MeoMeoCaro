/**
 * Kiem thu logic ban co 3x3 - 8x8 va AI.
 * AI Kho 3x3 duoc kiem tra vet can: duyet moi nuoc cua doi thu va moi nuoc
 * toi uu ma AI co the chon (thay doi ngau nhien giua cac nuoc ngang diem).
 */
import assert from 'node:assert/strict';
import {
  BOARD_CONFIGS,
  checkWinFromMove,
  createBoard,
  findWinner,
  getEmptyCells,
  getResult,
  isDraw,
  isValidSize,
  otherPlayer,
  place,
  winLengthFor,
} from '../public/js/game-core.js';
import { chooseMove } from '../public/js/ai.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const SIZES = [3, 4, 5, 6, 7, 8];

console.log('game-core');

check('cau hinh co ban 3..8 dung luat thang', () => {
  assert.deepEqual(Object.keys(BOARD_CONFIGS).map(Number), SIZES);
  assert.deepEqual(
    SIZES.map((size) => winLengthFor(size)),
    [3, 4, 5, 5, 5, 5]
  );
  for (const size of SIZES) assert.equal(isValidSize(size), true);
  for (const bad of [2, 9, 3.5, '4', null, undefined]) assert.equal(isValidSize(bad), false);
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

check('chuoi khong vong tu cuoi hang sang dau hang', () => {
  for (const size of SIZES) {
    const need = winLengthFor(size);
    if (size < 4) continue;
    const board = createBoard(size);
    const lastOfRow = size - 1;
    board[lastOfRow - 1] = 'B';
    board[lastOfRow] = 'B';
    board[size] = 'B';
    board[size + 1] = 'B';
    if (need <= 4) {
      assert.equal(checkWinFromMove(board, size, need, lastOfRow), null);
      assert.equal(checkWinFromMove(board, size, need, size + 1), null);
    }
  }
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

check('hoa chi khi day ban va khong ai thang (3x3 / 4x4)', () => {
  const almost = ['A', 'B', 'A', 'A', 'B', 'B', 'B', 'A', null];
  assert.equal(getResult(almost, 3, 3).finished, false);
  const draw = [...almost.slice(0, 8), 'B'];
  assert.equal(getResult(draw, 3, 3).draw, true);

  const board4 = [
    'A', 'A', 'B', 'B',
    'B', 'B', 'A', 'A',
    'A', 'A', 'B', 'B',
    'B', 'B', 'A', 'A',
  ];
  assert.equal(isDraw(board4, 4, 4), true);
  const result = getResult(board4, 4, 4);
  assert.equal(result.draw, true);
  assert.equal(result.winner, null);
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

  assert.ok(games.length >= 72, 'phai choi vai chuc van moi co ban');
  console.log(`     da choi ${finishedGames} van, ${movesPlayed} nuoc`);
});

check('AI Kho ban lon luon tra ve nuoc hop le trong thoi gian gioi han', () => {
  for (const size of [4, 5, 6, 7, 8]) {
    const board = createBoard(size);
    const center = Math.floor(size / 2) * size + Math.floor(size / 2);
    board[center] = 'A';
    board[center + 1 < board.length ? center + 1 : center - 1] = 'B';
    const start = Date.now();
    const move = chooseMove(board, 'A', 'B', 'hard', Math.random, {
      size,
      timeLimit: 120,
    });
    const elapsed = Date.now() - start;
    assert.ok(getEmptyCells(board).includes(move), `size ${size} returned ${move}`);
    assert.ok(elapsed < 1500, `size ${size} took ${elapsed}ms`);
  }
});

check('AI ban lon thang ngay khi co co hoi', () => {
  const medium = createBoard(4);
  medium[0] = 'A';
  medium[1] = 'A';
  medium[2] = 'A';
  medium[6] = 'B';
  assert.equal(chooseMove(medium, 'A', 'B', 'medium', () => 0.5), 3);

  const easy = createBoard(4);
  easy[0] = 'A';
  easy[1] = 'A';
  easy[2] = 'A';
  easy[6] = 'B';
  assert.equal(chooseMove(easy, 'A', 'B', 'easy', () => 0.1), 3);

  const hard = createBoard(8);
  hard[0] = 'A';
  hard[1] = 'A';
  hard[2] = 'A';
  hard[3] = 'A';
  hard[40] = 'B';
  assert.equal(chooseMove(hard, 'A', 'B', 'hard', () => 0.5, { size: 8, timeLimit: 120 }), 4);
});

check('AI ban lon chan nuoc thang cua doi thu', () => {
  const medium = createBoard(4);
  medium[8] = 'B';
  medium[9] = 'B';
  medium[10] = 'B';
  medium[0] = 'A';
  assert.equal(chooseMove(medium, 'A', 'B', 'medium', () => 0.5), 11);

  const hard = createBoard(8);
  for (const col of [2, 3, 4, 5]) hard[4 * 8 + col] = 'B';
  hard[0] = 'A';
  const move = chooseMove(hard, 'A', 'B', 'hard', () => 0.5, { size: 8, timeLimit: 200 });
  assert.ok([4 * 8 + 1, 4 * 8 + 6].includes(move), `expected a block, got ${move}`);
});

check('AI ban lon khong danh vao o da co quan', () => {
  for (const size of [4, 5, 6, 7, 8]) {
    const board = createBoard(size);
    for (let i = 0; i < board.length; i += 3) board[i] = i % 2 ? 'A' : 'B';
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const move = chooseMove(board, 'A', 'B', difficulty, () => 0.42, {
        size,
        timeLimit: 60,
      });
      assert.equal(board[move], null, `size ${size} ${difficulty} picked occupied ${move}`);
    }
  }
});

console.log(`\n${passed} tests passed`);
