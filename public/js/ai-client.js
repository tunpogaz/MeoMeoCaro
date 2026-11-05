/**
 * Cau noi giua giao dien va AI.
 *
 * - Ban 3x3 chay truc tiep (rat nhanh, giu nguyen hanh vi cu).
 * - Ban vo cuc chay trong Web Worker de khong treo giao dien.
 *   Neu trinh duyet khong ho tro Worker, tu dong chay tren luong chinh.
 * - cancel() huy ket qua dang cho (roi man hinh / doi che do).
 */
import { chooseInfiniteMove, chooseMove } from './ai.js';

function cancelledValue(request) {
  return request?.kind === 'infinite' ? null : -1;
}

function runLocal(request) {
  try {
    if (request.kind === 'infinite') {
      const move = chooseInfiniteMove(
        { moves: request.moves, region: request.region },
        request.me,
        request.opponent,
        request.difficulty,
        Math.random,
        {
          winLength: request.winLength,
          timeLimit: request.timeLimit,
          maxDepth: request.maxDepth,
        }
      );
      return move && Number.isInteger(move.x) && Number.isInteger(move.y) ? move : null;
    }

    const index = chooseMove(
      request.board.slice(),
      request.me,
      request.opponent,
      request.difficulty,
      Math.random
    );
    return Number.isInteger(index) ? index : -1;
  } catch {
    return cancelledValue(request);
  }
}

export function createAIClient() {
  let worker = null;
  let broken = typeof Worker === 'undefined';
  let seq = 0;
  let job = null;

  function settle(value) {
    const current = job;
    job = null;
    if (current) current.resolve(value);
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

        const move = data.move;
        settle(
          move && Number.isInteger(move.x) && Number.isInteger(move.y)
            ? { x: move.x, y: move.y }
            : null
        );
      };
      worker.onerror = () => {
        broken = true;
        dropWorker();
        if (job) {
          const current = job;
          job = null;
          setTimeout(() => current.resolve(runLocal(current.request)), 0);
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
    const current = job;
    job = null;
    if (current) current.resolve(cancelledValue(current.request));
  }

  function start(request) {
    const id = ++seq;

    return new Promise((resolve) => {
      if (job) {
        const previous = job;
        job = null;
        previous.resolve(cancelledValue(previous.request));
      }

      if (request.kind === 'finite') {
        resolve(runLocal(request));
        return;
      }

      const active = getWorker();
      if (!active) {
        setTimeout(() => resolve(runLocal(request)), 0);
        return;
      }

      job = { id, request, resolve };
      try {
        active.postMessage({ id, ...request });
      } catch {
        job = null;
        setTimeout(() => resolve(runLocal(request)), 0);
      }
    });
  }

  /**
   * @param {{board:Array, me:string, opponent:string, difficulty:string,
   *          size:number, winLength:number, timeLimit?:number, maxDepth?:number}} params
   * @returns {Promise<number>} chi so o, -1 neu khong tim duoc
   */
  function choose(params) {
    return start({
      kind: 'finite',
      board: Array.isArray(params.board) ? params.board.slice() : [],
      me: params.me === 'B' ? 'B' : 'A',
      opponent: params.opponent === 'B' ? 'B' : 'A',
      difficulty: params.difficulty || 'medium',
      size: params.size,
      winLength: params.winLength,
      timeLimit: Number.isFinite(params.timeLimit) ? params.timeLimit : 800,
      maxDepth: params.maxDepth,
    });
  }

  /**
   * @param {{moves:Array<{x:number,y:number,s:string}>,
   *          region?:{minX:number,maxX:number,minY:number,maxY:number},
   *          me:string, opponent:string, difficulty:string,
   *          winLength?:number, timeLimit?:number, maxDepth?:number}} params
   * @returns {Promise<{x:number,y:number}|null>}
   */
  function chooseInfinite(params) {
    const moves = Array.isArray(params.moves)
      ? params.moves
          .filter((move) => Number.isInteger(move?.x) && Number.isInteger(move?.y))
          .map((move) => ({ x: move.x, y: move.y, s: move.s === 'B' ? 'B' : 'A' }))
      : [];

    return start({
      kind: 'infinite',
      moves,
      region: params.region ? { ...params.region } : null,
      me: params.me === 'B' ? 'B' : 'A',
      opponent: params.opponent === 'B' ? 'B' : 'A',
      difficulty: params.difficulty || 'medium',
      winLength: params.winLength,
      timeLimit: Number.isFinite(params.timeLimit) ? params.timeLimit : 800,
      maxDepth: params.maxDepth,
    });
  }

  return { choose, chooseInfinite, cancel };
}
