/**
 * Luu lich su van online (server la nguon su that) va API lich su / thong ke.
 * Moi van chi ghi mot lan; loi DB chi ghi log, khong lam hong phong.
 */
import express from 'express';
import { newId, query, transaction } from './db.js';

const VALID_RESULT_FILTERS = new Set(['win', 'loss', 'draw']);

function parseSizeFilter(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (raw === 'infinite') return 'infinite';
  const size = Number(raw);
  return Number.isInteger(size) && size === 3 ? String(size) : undefined;
}

function parseJson(raw, fallback) {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function outcomeFor(row, userId) {
  if (row.result === 'draw') return 'draw';
  const isA = row.player_a_user_id === userId;
  const mySymbol = isA ? 'A' : 'B';
  return row.result === mySymbol ? 'win' : 'loss';
}

const DELETED_PLAYER_NAME = 'Người chơi đã xóa';

function summaryFor(row, userId) {
  const isA = row.player_a_user_id === userId;
  const opponentDeleted = isA ? row.b_deleted !== null : row.a_deleted !== null;
  return {
    id: row.id,
    roomCode: row.room_code,
    size: row.size === 'infinite' ? 'infinite' : Number(row.size),
    winLength: Number(row.win_length),
    mySymbol: isA ? 'A' : 'B',
    opponent: {
      name: opponentDeleted ? DELETED_PLAYER_NAME : isA ? row.player_b_name : row.player_a_name,
      avatar: isA ? row.player_b_avatar : row.player_a_avatar,
      deleted: opponentDeleted,
    },
    result: row.result,
    outcome: outcomeFor(row, userId),
    endReason: row.end_reason,
    totalMoves: Number(row.total_moves),
    firstPlayer: row.first_player,
    startedAt: Number(row.started_at),
    endedAt: Number(row.ended_at),
  };
}

function detailFor(row, userId) {
  const summary = summaryFor(row, userId);
  return {
    ...summary,
    players: {
      A: {
        name: row.a_deleted !== null ? DELETED_PLAYER_NAME : row.player_a_name,
        avatar: row.player_a_avatar,
        deleted: row.a_deleted !== null,
      },
      B: {
        name: row.b_deleted !== null ? DELETED_PLAYER_NAME : row.player_b_name,
        avatar: row.player_b_avatar,
        deleted: row.b_deleted !== null,
      },
    },
    moves: parseJson(row.moves, []),
    winLine: parseJson(row.win_line, null),
  };
}

const MATCH_SELECT = `SELECT m.*, ua.deleted_at AS a_deleted, ub.deleted_at AS b_deleted
  FROM matches m
  LEFT JOIN users ua ON ua.id = m.player_a_user_id
  LEFT JOIN users ub ON ub.id = m.player_b_user_id`;

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
  next();
}

export function installHistory(app) {
  const router = express.Router();

  router.get('/history', requireUser, async (req, res) => {
    try {
      const size = parseSizeFilter(req.query.size);
      if (size === undefined) {
        return res.status(400).json({ ok: false, code: 'INVALID_SIZE' });
      }
      const resultFilter = String(req.query.result || '');
      if (resultFilter && !VALID_RESULT_FILTERS.has(resultFilter)) {
        return res.status(400).json({ ok: false, code: 'INVALID_RESULT_FILTER' });
      }
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
      const offset = (page - 1) * limit;
      const userId = req.user.id;

      const where = ['(m.player_a_user_id = ? OR m.player_b_user_id = ?)'];
      const params = [userId, userId];
      if (size) {
        where.push('m.size = ?');
        params.push(size);
      }
      if (resultFilter === 'draw') {
        where.push("m.result = 'draw'");
      } else if (resultFilter === 'win') {
        where.push(
          "((m.player_a_user_id = ? AND m.result = 'A') OR (m.player_b_user_id = ? AND m.result = 'B'))"
        );
        params.push(userId, userId);
      } else if (resultFilter === 'loss') {
        where.push(
          "((m.player_a_user_id = ? AND m.result = 'B') OR (m.player_b_user_id = ? AND m.result = 'A'))"
        );
        params.push(userId, userId);
      }
      const whereSql = where.join(' AND ');

      const countResult = await query(
        `SELECT COUNT(*) AS total FROM matches m WHERE ${whereSql}`,
        params
      );
      const listResult = await query(
        `${MATCH_SELECT} WHERE ${whereSql} ORDER BY m.ended_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const total = Number(countResult.rows[0]?.total || 0);
      return res.json({
        ok: true,
        page,
        limit,
        total,
        hasMore: offset + listResult.rows.length < total,
        items: listResult.rows.map((row) => summaryFor(row, userId)),
      });
    } catch (error) {
      console.error('[mmc] history list failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.get('/history/:id', requireUser, async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(404).json({ ok: false, code: 'MATCH_NOT_FOUND' });
      }
      const result = await query(`${MATCH_SELECT} WHERE m.id = ?`, [id]);
      const row = result.rows[0];
      const userId = req.user.id;
      if (
        !row ||
        (row.player_a_user_id !== userId && row.player_b_user_id !== userId)
      ) {
        return res.status(404).json({ ok: false, code: 'MATCH_NOT_FOUND' });
      }
      return res.json({ ok: true, match: detailFor(row, userId) });
    } catch (error) {
      console.error('[mmc] history detail failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  router.get('/stats', requireUser, async (req, res) => {
    try {
      const result = await query(
        `SELECT size_key, wins, losses, draws FROM user_stats WHERE user_id = ?`,
        [req.user.id]
      );
      const bySize = {};
      let wins = 0;
      let losses = 0;
      let draws = 0;
      for (const row of result.rows) {
        const entry = {
          wins: Number(row.wins),
          losses: Number(row.losses),
          draws: Number(row.draws),
        };
        bySize[row.size_key] = entry;
        wins += entry.wins;
        losses += entry.losses;
        draws += entry.draws;
      }
      const total = wins + losses + draws;
      return res.json({
        ok: true,
        stats: {
          total,
          wins,
          losses,
          draws,
          winRate: total ? Math.round((wins / total) * 1000) / 10 : 0,
          bySize,
        },
      });
    } catch (error) {
      console.error('[mmc] stats failed', error.message);
      return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
    }
  });

  app.use('/api', router);
}

function matchMoves(room) {
  if (room.infinite) {
    return room.moveLog.map((move) => ({ x: move.x, y: move.y, s: move.s }));
  }
  return room.moveLog.map((move) => ({ i: move.i, s: move.s }));
}

/**
 * Ghi mot van da ket thuc. Goi tu finishRound; dat co truoc khi await de
 * nhieu su kien ket thuc gan nhau khong tao ban ghi trung.
 */
export async function saveMatchRecord(room, { result, endReason }) {
  if (!room || room.matchSaved) return;
  room.matchSaved = true;

  const players = Array.isArray(room.players) ? room.players : [];
  const registered = players.filter((player) => player.userId);
  if (!registered.length) return;
  if (!Array.isArray(room.moveLog) || room.moveLog.length === 0) return;
  const playerA = players.find((player) => player.symbol === 'A');
  const playerB = players.find((player) => player.symbol === 'B');
  if (!playerA || !playerB) return;

  try {
    await transaction(async (tx) => {
      await tx.query(
        `INSERT INTO matches (
           id, room_code, size, win_length, player_a_user_id, player_b_user_id,
           player_a_name, player_b_name, player_a_avatar, player_b_avatar,
           first_player, result, end_reason, win_line, moves, total_moves,
           started_at, ended_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          room.id,
          String(room.size),
          room.winLength,
          playerA.userId || null,
          playerB.userId || null,
          playerA.name,
          playerB.name,
          playerA.avatar,
          playerB.avatar,
          room.starter || 'A',
          result,
          endReason,
          room.winLine ? JSON.stringify(room.winLine) : null,
          JSON.stringify(matchMoves(room)),
          room.moveLog.length,
          room.matchStartedAt || room.lastActivity,
          Date.now(),
        ]
      );

      for (const player of registered) {
        const isWin = result !== 'draw' && result === player.symbol;
        const isDraw = result === 'draw';
        await tx.query(
          `INSERT INTO user_stats (user_id, size_key, wins, losses, draws)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (user_id, size_key) DO UPDATE SET
             wins = user_stats.wins + excluded.wins,
             losses = user_stats.losses + excluded.losses,
             draws = user_stats.draws + excluded.draws`,
          [
            player.userId,
            String(room.size),
            isWin ? 1 : 0,
            !isWin && !isDraw ? 1 : 0,
            isDraw ? 1 : 0,
          ]
        );
      }
    });
  } catch (error) {
    // Khong nem tiep: loi DB khong duoc lam sap server hay treo phong.
    console.error('[mmc] save match failed', room.id, error.message);
  }
}
