/**
 * Kiem thu logic ban co va AI.
 * AI Kho duoc kiem tra vet can: duyet moi nuoc cua doi thu va moi nuoc
 * toi uu ma AI co the chon (thay doi ngau nhien giua cac nuoc ngang diem).
 */
import assert from 'node:assert/strict';
import {
  WIN_LINES,
  createBoard,
  emptyCells,
  findWinner,
  getResult,
  otherPlayer,
  place,
} from '../public/js/game-core.js';
import { chooseMove } from '../public/js/ai.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

console.log('game-core');

check('nhan dien du 8 duong thang', () => {
  assert.equal(WIN_LINES.length, 8);
  for (const line of WIN_LINES) {
    for (const player of ['A', 'B']) {
      const board = createBoard();
      for (const index of line) board[index] = player;
      const result = findWinner(board);
      assert.equal(result.winner, player);
      assert.deepEqual([...result.line].sort((a, b) => a - b), [...line].sort((a, b) => a - b));
    }
  }
});

check('hoa chi khi day 9 o va khong ai thang', () => {
  const almost = ['A', 'B', 'A', 'A', 'B', 'B', 'B', 'A', null];
  assert.equal(getResult(almost).finished, false);

  const draw = [...almost.slice(0, 8), 'B'];
  const result = getResult(draw);
  assert.equal(result.finished, true);
  assert.equal(result.draw, true);
  assert.equal(result.winner, null);
});

check('nuoc cuoi tao thanh thang duoc uu tien hon hoa', () => {
  const board = ['A', 'A', null, 'B', 'B', 'A', 'B', 'A', 'B'];
  board[2] = 'A';
  assert.equal(board.every(Boolean), true);
  const result = getResult(board);
  assert.equal(result.winner, 'A');
  assert.equal(result.draw, false);
});

check('place tu choi o ngoai pham vi / o da co quan', () => {
  const board = createBoard();
  assert.equal(place(board, 0, 'A'), true);
  assert.equal(place(board, 0, 'B'), false);
  assert.equal(place(board, -1, 'A'), false);
  assert.equal(place(board, 9, 'A'), false);
  assert.equal(place(board, 1.5, 'A'), false);
  assert.deepEqual(emptyCells(board), [1, 2, 3, 4, 5, 6, 7, 8]);
});

console.log('AI');

check('AI Kho luon mo ban o giua', () => {
  assert.equal(chooseMove(createBoard(), 'A', 'B', 'hard', () => 0), 4);
  assert.equal(chooseMove(createBoard(), 'B', 'A', 'hard', () => 0.9), 4);
});

check('AI Vua uu tien thang ngay', () => {
  const board = createBoard();
  board[0] = 'A';
  board[1] = 'A';
  board[3] = 'B';
  board[4] = 'B';
  assert.equal(chooseMove(board, 'A', 'B', 'medium', () => 0.5), 2);
});

check('AI Vua chan khi doi thu sap thang', () => {
  const board = createBoard();
  board[3] = 'B';
  board[4] = 'B';
  board[0] = 'A';
  assert.equal(chooseMove(board, 'A', 'B', 'medium', () => 0.5), 5);
});

check('AI Vua chiem giua roi den goc', () => {
  const emptyBoard = createBoard();
  assert.equal(chooseMove(emptyBoard, 'A', 'B', 'medium', () => 0.5), 4);

  const board = createBoard();
  board[4] = 'B';
  board[0] = 'A';
  const move = chooseMove(board, 'A', 'B', 'medium', () => 0.5);
  assert.ok([2, 6, 8].includes(move), `expected a corner, got ${move}`);
});

check('AI De / Vua luon tra ve o trong hop le', () => {
  const boards = [
    createBoard(),
    ['A', null, null, null, 'B', null, null, null, null],
    ['A', 'B', 'A', 'A', 'B', 'B', 'B', 'A', null],
    ['A', 'B', 'A', 'A', 'B', 'B', 'B', 'A', 'B'],
  ];
  for (const board of boards) {
    const empties = emptyCells(board);
    for (const difficulty of ['easy', 'medium']) {
      for (let i = 0; i < 60; i += 1) {
        const move = chooseMove(board, 'B', 'A', difficulty, () => (i + 0.5) / 60);
        if (!empties.length) assert.equal(move, -1);
        else assert.ok(empties.includes(move), `${difficulty} returned ${move}`);
      }
    }
  }
});

check('AI Kho khong bao gio thua (duyet vet can)', () => {
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
      const result = getResult(board);
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

      const moves = turn === ai ? aiMoves(board) : emptyCells(board);
      for (const move of moves) {
        const next = board.slice();
        next[move] = turn;
        search(next, otherPlayer(turn));
      }
    };

    search(createBoard(), 'A');
  }

  assert.equal(total.lose, 0);
  assert.ok(total.win + total.draw > 100, 'phai duyet duoc nhieu the co');
  console.log(
    `     da kiem tra ${total.win + total.draw} the ket thuc: thang ${total.win}, hoa ${total.draw}`
  );
});

console.log(`\n${passed} tests passed`);
