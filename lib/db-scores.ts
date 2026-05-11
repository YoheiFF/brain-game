import { getDb } from "@/lib/db";
import { GAME_META, GAME_IDS, type GameId, type RankEntry, type OverallEntry } from "@/lib/scores";
import type { DailyHistoryEntry } from "@/lib/daily";

// game-points.ts と同じ参照値（循環インポート回避）
const POINTS_REF: Record<GameId, number> = {
  calculation: 17,
  "memory-number": 8,
  stroop: 23,
  reaction: 220,
  pattern: 18,
};

export async function saveScoreToDb(
  userId: string,
  gameId: GameId,
  score: number
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.execute({
    sql: "INSERT INTO scores (user_id, game_id, score, created_at) VALUES (?, ?, ?, ?)",
    args: [userId, gameId, score, now],
  });
}

export async function getPersonalBestsFromDb(
  userId: string
): Promise<Partial<Record<GameId, number>>> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT game_id, MAX(score) as max_s, MIN(score) as min_s
          FROM scores
          WHERE user_id = ?
          GROUP BY game_id`,
    args: [userId],
  });

  const bests: Partial<Record<GameId, number>> = {};
  for (const row of result.rows) {
    const gameId = row.game_id as GameId;
    if (!GAME_IDS.includes(gameId)) continue;
    const { lowerIsBetter } = GAME_META[gameId];
    bests[gameId] = lowerIsBetter
      ? (row.min_s as number)
      : (row.max_s as number);
  }
  return bests;
}

export async function getRankingsFromDb(): Promise<{
  gameRankings: Partial<Record<GameId, RankEntry[]>>;
  overallRanking: OverallEntry[];
}> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.user_id, u.nickname, s.game_id,
                 MAX(s.score) as max_score,
                 MIN(s.score) as min_score,
                 MAX(s.created_at) as latest_date
          FROM scores s
          JOIN users u ON s.user_id = u.id
          GROUP BY s.user_id, s.game_id`,
    args: [],
  });

  // ゲーム別ランキング構築
  const gameMap: Partial<Record<GameId, Array<{ nickname: string; score: number; date: string }>>> = {};
  // 総合ランキング用: user_id -> { nickname, bests }
  const userBests = new Map<string, { nickname: string; bests: Partial<Record<GameId, number>> }>();

  for (const row of result.rows) {
    const gameId = row.game_id as GameId;
    if (!GAME_IDS.includes(gameId)) continue;
    const { lowerIsBetter } = GAME_META[gameId];
    const score = lowerIsBetter
      ? (row.min_score as number)
      : (row.max_score as number);
    const nickname = row.nickname as string;
    const userId = row.user_id as string;
    const date = row.latest_date as string;

    // ゲーム別
    if (!gameMap[gameId]) gameMap[gameId] = [];
    gameMap[gameId]!.push({ nickname, score, date });

    // 総合用
    if (!userBests.has(userId)) {
      userBests.set(userId, { nickname, bests: {} });
    }
    userBests.get(userId)!.bests[gameId] = score;
  }

  // ゲーム別ランキング: ソート & 上位10件
  const gameRankings: Partial<Record<GameId, RankEntry[]>> = {};
  for (const gameId of GAME_IDS) {
    const list = gameMap[gameId] ?? [];
    const { lowerIsBetter } = GAME_META[gameId];
    const sorted = list
      .sort((a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score))
      .slice(0, 10);
    gameRankings[gameId] = sorted.map((e, i) => ({
      rank: i + 1,
      nickname: e.nickname,
      score: e.score,
      date: e.date,
    }));
  }

  // 総合ランキング計算
  const overallEntries: OverallEntry[] = [];
  for (const [, { nickname, bests }] of userBests.entries()) {
    let totalPoints = 0;
    let gamesPlayed = 0;
    for (const gameId of GAME_IDS) {
      const score = bests[gameId];
      if (score === undefined) continue;
      gamesPlayed++;
      const ref = POINTS_REF[gameId];
      const { lowerIsBetter } = GAME_META[gameId];
      const ratio = lowerIsBetter ? ref / score : score / ref;
      totalPoints += Math.min(20, Math.max(1, Math.round(ratio * 10)));
    }
    overallEntries.push({
      rank: 0,
      nickname,
      totalPoints,
      gamesPlayed,
      details: bests,
    });
  }

  const overallRanking = overallEntries
    .sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPlayed - a.gamesPlayed)
    .slice(0, 10)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return { gameRankings, overallRanking };
}

/** 指定ユーザーの全ランキングでの順位を返す（Top10 外でも取得可能）*/
export async function getUserRanksFromDb(userId: string): Promise<{
  gameRanks: Partial<Record<GameId, RankEntry>>;
  overallRank: OverallEntry | null;
}> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.user_id, u.nickname, s.game_id,
                 MAX(s.score) as max_score,
                 MIN(s.score) as min_score,
                 MAX(s.created_at) as latest_date
          FROM scores s
          JOIN users u ON s.user_id = u.id
          GROUP BY s.user_id, s.game_id`,
    args: [],
  });

  const gameMap: Partial<Record<GameId, Array<{ userId: string; nickname: string; score: number; date: string }>>> = {};
  const userBests = new Map<string, { nickname: string; bests: Partial<Record<GameId, number>> }>();

  for (const row of result.rows) {
    const gameId = row.game_id as GameId;
    if (!GAME_IDS.includes(gameId)) continue;
    const { lowerIsBetter } = GAME_META[gameId];
    const score = lowerIsBetter ? (row.min_score as number) : (row.max_score as number);
    const uid = row.user_id as string;
    const nickname = row.nickname as string;
    const date = row.latest_date as string;

    if (!gameMap[gameId]) gameMap[gameId] = [];
    gameMap[gameId]!.push({ userId: uid, nickname, score, date });

    if (!userBests.has(uid)) userBests.set(uid, { nickname, bests: {} });
    userBests.get(uid)!.bests[gameId] = score;
  }

  // ゲーム別: 全件ソートして自分の順位を特定
  const gameRanks: Partial<Record<GameId, RankEntry>> = {};
  for (const gameId of GAME_IDS) {
    const list = gameMap[gameId] ?? [];
    const { lowerIsBetter } = GAME_META[gameId];
    const sorted = list.sort((a, b) => lowerIsBetter ? a.score - b.score : b.score - a.score);
    const idx = sorted.findIndex((e) => e.userId === userId);
    if (idx !== -1) {
      const e = sorted[idx];
      gameRanks[gameId] = { rank: idx + 1, nickname: e.nickname, score: e.score, date: e.date };
    }
  }

  // 総合: 全件ソートして自分の順位を特定
  const overallEntries: Array<OverallEntry & { userId: string }> = [];
  for (const [uid, { nickname, bests }] of userBests.entries()) {
    let totalPoints = 0;
    let gamesPlayed = 0;
    for (const gameId of GAME_IDS) {
      const score = bests[gameId];
      if (score === undefined) continue;
      gamesPlayed++;
      const ref = POINTS_REF[gameId];
      const { lowerIsBetter } = GAME_META[gameId];
      const ratio = lowerIsBetter ? ref / score : score / ref;
      totalPoints += Math.min(20, Math.max(1, Math.round(ratio * 10)));
    }
    overallEntries.push({ userId: uid, rank: 0, nickname, totalPoints, gamesPlayed, details: bests });
  }

  const sortedOverall = overallEntries
    .sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPlayed - a.gamesPlayed)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  const myOverall = sortedOverall.find((e) => e.userId === userId);
  const overallRank: OverallEntry | null = myOverall
    ? { rank: myOverall.rank, nickname: myOverall.nickname, totalPoints: myOverall.totalPoints, gamesPlayed: myOverall.gamesPlayed, details: myOverall.details }
    : null;

  return { gameRanks, overallRank };
}

export async function recordDailyPlay(
  userId: string,
  gameId: GameId,
  score: number
): Promise<{ playCount: number; bestScore: number }> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // 既存レコードを取得
  const existing = await db.execute({
    sql: "SELECT play_count, best_score FROM daily_plays WHERE user_id = ? AND game_id = ? AND play_date = ?",
    args: [userId, gameId, today],
  });

  const existingRow = existing.rows[0] ?? null;
  const prevPlayCount = existingRow ? (existingRow.play_count as number) : 0;
  const prevBest = existingRow ? (existingRow.best_score as number | null) : null;

  const newPlayCount = prevPlayCount + 1;
  const { lowerIsBetter } = GAME_META[gameId];
  const newBest =
    prevBest === null
      ? score
      : lowerIsBetter
      ? Math.min(prevBest, score)
      : Math.max(prevBest, score);

  await db.execute({
    sql: `INSERT INTO daily_plays (user_id, game_id, play_date, play_count, best_score)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (user_id, game_id, play_date)
          DO UPDATE SET play_count = ?, best_score = ?`,
    args: [userId, gameId, today, newPlayCount, newBest, newPlayCount, newBest],
  });

  return { playCount: newPlayCount, bestScore: newBest };
}

export async function updateDailyHistory(userId: string): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const result = await db.execute({
    sql: "SELECT game_id, best_score FROM daily_plays WHERE user_id = ? AND play_date = ?",
    args: [userId, today],
  });

  let totalPoints = 0;
  let gamesPlayed = 0;

  for (const row of result.rows) {
    const gameId = row.game_id as GameId;
    if (!GAME_IDS.includes(gameId)) continue;
    const bestScore = row.best_score as number | null;
    if (bestScore === null) continue;
    gamesPlayed++;
    const ref = POINTS_REF[gameId];
    const { lowerIsBetter } = GAME_META[gameId];
    const ratio = lowerIsBetter ? ref / bestScore : bestScore / ref;
    totalPoints += Math.min(100, Math.round(ratio * 50));
  }

  await db.execute({
    sql: `INSERT INTO daily_history (user_id, play_date, total_points, games_played)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (user_id, play_date)
          DO UPDATE SET total_points = ?, games_played = ?`,
    args: [userId, today, totalPoints, gamesPlayed, totalPoints, gamesPlayed],
  });
}

export async function getDailyPlaysFromDb(
  userId: string
): Promise<Partial<Record<GameId, { playCount: number; bestScore: number | null }>>> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const result = await db.execute({
    sql: "SELECT game_id, play_count, best_score FROM daily_plays WHERE user_id = ? AND play_date = ?",
    args: [userId, today],
  });

  const dailyPlays: Partial<Record<GameId, { playCount: number; bestScore: number | null }>> = {};
  for (const row of result.rows) {
    const gameId = row.game_id as GameId;
    if (!GAME_IDS.includes(gameId)) continue;
    dailyPlays[gameId] = {
      playCount: row.play_count as number,
      bestScore: row.best_score as number | null,
    };
  }
  return dailyPlays;
}

export async function getDailyHistoryFromDb(
  userId: string,
  days: number
): Promise<DailyHistoryEntry[]> {
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT play_date, total_points, games_played
          FROM daily_history
          WHERE user_id = ?
          ORDER BY play_date DESC
          LIMIT ?`,
    args: [userId, days],
  });

  // 降順 → 昇順に反転
  const rows = [...result.rows].reverse();

  return rows.map((row) => ({
    date: row.play_date as string,
    totalPoints: row.total_points as number,
    gamesPlayed: row.games_played as number,
  }));
}
