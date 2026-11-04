/**
 * Web Worker cho AI ban lon: nhan yeu cau, tra ve chi so o.
 * Khong dung DOM. Moi request co id de client bo qua ket qua cu.
 */
import { chooseMove } from './ai.js';

self.onmessage = (event) => {
  const data = event.data || {};
  const { id } = data;

  try {
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
    self.postMessage({ id, index });
  } catch (error) {
    self.postMessage({
      id,
      index: -1,
      error: String((error && error.message) || error),
    });
  }
};
