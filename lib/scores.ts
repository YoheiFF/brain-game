export type GameId = "calculation" | "memory-number" | "stroop" | "reaction" | "pattern";

export const GAME_META: Record<GameId, { label: string; unit: string; lowerIsBetter?: boolean }> = {
  calculation:   { label: "計算ゲーム",     unit: "問" },
  "memory-number": { label: "数字記憶",     unit: "桁" },
  stroop:        { label: "ストループテスト", unit: "点" },
  reaction:      { label: "反応速度テスト",  unit: "ms", lowerIsBetter: true },
  pattern:       { label: "図形記憶",       unit: "点" },
};

export const GAME_IDS = Object.keys(GAME_META) as GameId[];

// ── データ構造 ──────────────────────────────────────────
export interface ScoreEntry {
  nickname: string;
  score: number;
  date: string;
}

// 個人ベストキャッシュ (ホーム画面の高速表示用)
type PersonalBests = Partial<Record<GameId, number>>;

// 全プレイヤーのランキングデータ
type RankingsStore = Partial<Record<GameId, ScoreEntry[]>>;

const KEY_PERSONAL = "braingame_scores";
const KEY_RANKINGS = "braingame_rankings";

// ── 内部ユーティリティ ──────────────────────────────────
function loadPersonal(): PersonalBests {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY_PERSONAL) ?? "{}"); }
  catch { return {}; }
}

function loadRankings(): RankingsStore {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY_RANKINGS) ?? "{}"); }
  catch { return {}; }
}

function savePersonal(data: PersonalBests) {
  localStorage.setItem(KEY_PERSONAL, JSON.stringify(data));
}

function saveRankings(data: RankingsStore) {
  localStorage.setItem(KEY_RANKINGS, JSON.stringify(data));
}

// ── 公開 API ────────────────────────────────────────────

/** 個人ベストを返す (ホーム画面用) */
export function getPersonalBest(gameId: GameId): number | null {
  return loadPersonal()[gameId] ?? null;
}

/** 全ゲームの個人ベストを返す */
export function getAllPersonalBests(): PersonalBests {
  return loadPersonal();
}

/** スコアを保存し、新しいベスト値を返す */
export function saveScore(gameId: GameId, score: number, nickname: string): number {
  const { lowerIsBetter } = GAME_META[gameId];

  // 個人ベスト更新
  const personal = loadPersonal();
  const prevBest = personal[gameId] ?? null;
  const newBest =
    prevBest === null
      ? score
      : lowerIsBetter
      ? Math.min(prevBest, score)
      : Math.max(prevBest, score);
  personal[gameId] = newBest;
  savePersonal(personal);

  // ランキングに追加
  const rankings = loadRankings();
  const list = rankings[gameId] ?? [];
  list.push({ nickname, score, date: new Date().toISOString() });
  rankings[gameId] = list;
  saveRankings(rankings);

  return newBest;
}

// ── ランキング取得 ─────────────────────────────────────

export interface RankEntry {
  rank: number;
  nickname: string;
  score: number;
  date: string;
}

/** 種目別ランキング: ニックネームごとのベストのみ、上位30件 */
export function getGameRanking(gameId: GameId): RankEntry[] {
  const { lowerIsBetter } = GAME_META[gameId];
  const list = loadRankings()[gameId] ?? [];

  // ニックネームごとにベストスコアを集計
  const bestMap = new Map<string, ScoreEntry>();
  for (const entry of list) {
    const prev = bestMap.get(entry.nickname);
    if (!prev) {
      bestMap.set(entry.nickname, entry);
    } else {
      const isBetter = lowerIsBetter
        ? entry.score < prev.score
        : entry.score > prev.score;
      if (isBetter) bestMap.set(entry.nickname, entry);
    }
  }

  return [...bestMap.values()]
    .sort((a, b) =>
      lowerIsBetter ? a.score - b.score : b.score - a.score
    )
    .slice(0, 30)
    .map((e, i) => ({ rank: i + 1, nickname: e.nickname, score: e.score, date: e.date }));
}

// ── 総合ランキング ─────────────────────────────────────

export interface OverallEntry {
  rank: number;
  nickname: string;
  totalPoints: number;
  gamesPlayed: number;
  details: Partial<Record<GameId, number>>;
}

/**
 * 総合ランキング
 * 各種目のベストスコアを 0〜100 に正規化してポイント合計を算出。
 * reaction は lowerIsBetter のため逆正規化。
 */
export function getOverallRanking(): OverallEntry[] {
  const rankings = loadRankings();

  // 全ニックネームとゲームごとのベストを収集
  const playerBests = new Map<string, Partial<Record<GameId, number>>>();

  for (const gameId of GAME_IDS) {
    const list = rankings[gameId] ?? [];
    const { lowerIsBetter } = GAME_META[gameId];
    const bestMap = new Map<string, number>();
    for (const e of list) {
      const prev = bestMap.get(e.nickname);
      if (prev === undefined) {
        bestMap.set(e.nickname, e.score);
      } else {
        bestMap.set(e.nickname, lowerIsBetter ? Math.min(prev, e.score) : Math.max(prev, e.score));
      }
    }
    for (const [nick, score] of bestMap.entries()) {
      if (!playerBests.has(nick)) playerBests.set(nick, {});
      playerBests.get(nick)![gameId] = score;
    }
  }

  if (playerBests.size === 0) return [];

  // 各ゲームの全プレイヤー最大・最小を求めて正規化係数を計算
  const gameStats = new Map<GameId, { max: number; min: number }>();
  for (const gameId of GAME_IDS) {
    const scores = [...playerBests.values()]
      .map((d) => d[gameId])
      .filter((s): s is number => s !== undefined);
    if (scores.length === 0) continue;
    gameStats.set(gameId, { max: Math.max(...scores), min: Math.min(...scores) });
  }

  const entries: OverallEntry[] = [];
  for (const [nickname, bests] of playerBests.entries()) {
    let totalPoints = 0;
    let gamesPlayed = 0;
    for (const gameId of GAME_IDS) {
      const score = bests[gameId];
      const stats = gameStats.get(gameId);
      if (score === undefined || !stats) continue;
      gamesPlayed++;
      const { lowerIsBetter } = GAME_META[gameId];
      let normalized: number;
      if (stats.max === stats.min) {
        normalized = 100;
      } else if (lowerIsBetter) {
        normalized = ((stats.max - score) / (stats.max - stats.min)) * 100;
      } else {
        normalized = ((score - stats.min) / (stats.max - stats.min)) * 100;
      }
      totalPoints += normalized;
    }
    entries.push({
      rank: 0,
      nickname,
      totalPoints: Math.round(totalPoints),
      gamesPlayed,
      details: bests,
    });
  }

  return entries
    .sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPlayed - a.gamesPlayed)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/** 全ゲームの累計プレイ回数を返す */
export function getTotalPlayCount(): number {
  const rankings = loadRankings()
  let total = 0
  for (const gameId of GAME_IDS) {
    total += (rankings[gameId] ?? []).length
  }
  return total
}
