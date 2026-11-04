/**
 * Cau noi giua giao dien va AI.
 *
 * - Ban 3x3 chay truc tiep (rat nhanh, giu nguyen hanh vi cu).
 * - Ban 4x4 - 8x8 chay trong Web Worker de khong treo giao dien.
 *   Neu trinh duyet khong ho tro Worker, tu dong chay tren luong chinh.
 * - cancel() huy ket qua dang cho (roi man hinh / doi che do).
 */
import { chooseMove } from './ai.js';

function runLocal(params) {
  try {
    return chooseMove(params.board.slice(), params.me, params.opponent, params.difficulty, Math.random, {
      size: params.size,
      winLength: params.winLength,
      timeLimit: params.timeLimit,
      maxDepth: params.maxDepth,
    });
  } catch {
    return -1;
  }
}

export function createAIClient() {
  let worker = null;
  let broken = typeof Worker === 'undefined';
  let seq = 0;
  let job = null;

  function settle(index) {
    const current = job;
    job = null;
    if (current) current.resolve(index);
  }

  function dropWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  function getWorker() {
    if (broken) return null;
    if (worker) return worker;
    try {
      worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (!job || data.id !== job.id) return;
        settle(Number.isInteger(data.index) ? data.index : -1);
      };
      worker.onerror = () => {
        broken = true;
        dropWorker();
        if (job) {
          const current = job;
          job = null;
          setTimeout(() => current.resolve(runLocal(current.params)), 0);
        }
      };
      return worker;
    } catch {
      broken = true;
      dropWorker();
      return null;
    }
  }

  function cancel() {
    seq += 1;
    dropWorker();
    settle(-1);
  }

  /**
   * @param {{board:Array, me:string, opponent:string, difficulty:string,
   *          size:number, winLength:number, timeLimit?:number, maxDepth?:number}} params
   * @returns {Promise<number>} chi so o, -1 neu khong tim duoc
   */
  function choose(params) {
    const request = {
      board: Array.isArray(params.board) ? params.board.slice() : [],
      me: params.me === 'B' ? 'B' : 'A',
      opponent: params.opponent === 'B' ? 'B' : 'A',
      difficulty: params.difficulty || 'medium',
      size: params.size,
      winLength: params.winLength,
      timeLimit: Number.isFinite(params.timeLimit) ? params.timeLimit : 800,
      maxDepth: params.maxDepth,
    };
    const id = ++seq;

    return new Promise((resolve) => {
      if (job) {
        const previous = job;
        job = null;
        previous.resolve(-1);
      }

      if (request.size <= 3) {
        resolve(runLocal(request));
        return;
      }

      const active = getWorker();
      if (!active) {
        setTimeout(() => resolve(runLocal(request)), 0);
        return;
      }

      job = { id, params: request, resolve };
      try {
        active.postMessage({
          id,
          board: request.board,
          me: request.me,
          opponent: request.opponent,
          difficulty: request.difficulty,
          size: request.size,
          winLength: request.winLength,
          timeLimit: request.timeLimit,
          maxDepth: request.maxDepth,
        });
      } catch {
        job = null;
        setTimeout(() => resolve(runLocal(request)), 0);
      }
    });
  }

  return { choose, cancel };
}
