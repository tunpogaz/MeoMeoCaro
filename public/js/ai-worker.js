/**
 * Web Worker cho AI ban vo cuc: nhan yeu cau, tra ve nuoc di.
 * Ban 3x3 chay truc tiep tren luong chinh vi rat nhanh.
 * Khong dung DOM. Moi request co id de client bo qua ket qua cu.
 */
import { chooseInfiniteMove } from './ai.js';

self.onmessage = (event) => {
  const data = event.data || {};
  const { id } = data;

  try {
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
  } catch (error) {
    self.postMessage({
      id,
      kind: 'infinite',
      move: null,
      error: String((error && error.message) || error),
    });
  }
};
