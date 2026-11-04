/**
 * Web Worker cho AI ban lon va ban vo cuc: nhan yeu cau, tra ve nuoc di.
 * Khong dung DOM. Moi request co id de client bo qua ket qua cu.
 */
import { chooseInfiniteMove, chooseMove } from './ai.js';

self.onmessage = (event) => {
  const data = event.data || {};
  const { id } = data;

  try {
    if (data.kind === 'infinite') {
      const move = chooseInfiniteMove(
        {
          moves: Array.isArray(data.moves) ? data.moves : [],
          region: data.region || null,
        },
        data.me,
        data.opponent,
        data.difficulty,
        Math.random,
        {
          winLength: data.winLength,
          timeLimit: data.timeLimit,
          maxDepth: data.maxDepth,
        }
      );
      self.postMessage({ id, kind: 'infinite', move: move || null });
      return;
    }

    const index = chooseMove(
      Array.isArray(data.board) ? data.board.slice() : [],
      data.me,
      data.opponent,
      data.difficulty,
      Math.random,
      {
        size: data.size,
        winLength: data.winLength,
        timeLimit: data.timeLimit,
        maxDepth: data.maxDepth,
      }
    );
    self.postMessage({ id, kind: 'finite', index });
  } catch (error) {
    self.postMessage({
      id,
      kind: data.kind === 'infinite' ? 'infinite' : 'finite',
      index: -1,
      move: null,
      error: String((error && error.message) || error),
    });
  }
};
