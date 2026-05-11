export type GameId = "calculation" | "memory-number" | "stroop" | "reaction" | "pattern";

export const GAME_META: Record<GameId, { label: string; unit: string; lowerIsBetter?: boolean }> = {
  calculation:   { label: "計算ゲーム",     unit: "問" },
  "memory-number": { label: "数字記憶",     unit: "桁" },
  stroop:        { label: "ストループテスト", unit: "個" },
  reaction:      { label: "反応速度テスト",  unit: "ms", lowerIsBetter: true },
  pattern:       { label: "図形記憶",       unit: "個" },
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
export function saveScore(
  gameId: GameId,
  score: number,
  nickname: string,
  userId?: string // DB 保存用（undefined の場合は localStorage のみ）
): number {
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

  // DB に非同期で保存（fire-and-forget）
  if (userId) {
    import("@/app/actions/user").then(({ recordScore }) => {
      recordScore({ userId, gameId, score }).catch((e) => {
        console.warn("[saveScore] recordScore failed:", e);
      });
    }).catch((e) => {
      console.warn("[saveScore] import failed:", e);
    });
  }

  return newBest;
}

// ── ランキング取得 ─────────────────────────────────────

export interface RankEntry {
  rank: number;
  nickname: string;
  score: number;
  date: string;
}

/** 種目別ランキング: ニックネームごとのベストのみ、上位10件 */
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
    .slice(0, 10)
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

// game-points.ts と同じ基準値（20代平均スコア）
// 循環インポートを避けるため scores.ts 内に定義
const POINTS_REF: Record<GameId, number> = {
  calculation: 17,
  "memory-number": 8,
  stroop: 23,
  reaction: 220,
  pattern: 18,
};

/**
 * 総合ランキング
 * 各種目のベストスコアを20代平均基準で1〜20点に換算して合算。
 * TOP画面の calcTotalPoints と同方式で最大100点。
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

  const entries: OverallEntry[] = [];
  for (const [nickname, bests] of playerBests.entries()) {
    let totalPoints = 0;
    let gamesPlayed = 0;
    for (const [gameId, score] of Object.entries(bests) as [GameId, number][]) {
      if (score === undefined) continue;
      gamesPlayed++;
      const ref = POINTS_REF[gameId];
      const { lowerIsBetter } = GAME_META[gameId];
      const ratio = lowerIsBetter ? ref / score : score / ref;
      totalPoints += Math.min(20, Math.max(1, Math.round(ratio * 10)));
    }
    entries.push({
      rank: 0,
      nickname,
      totalPoints,
      gamesPlayed,
      details: bests,
    });
  }

  return entries
    .sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPlayed - a.gamesPlayed)
    .slice(0, 10)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/** 指定ニックネームの種目別ランク（全件検索）*/
export function getUserGameRankEntry(gameId: GameId, nickname: string): RankEntry | null {
  const { lowerIsBetter } = GAME_META[gameId];
  const list = loadRankings()[gameId] ?? [];

  const bestMap = new Map<string, ScoreEntry>();
  for (const entry of list) {
    const prev = bestMap.get(entry.nickname);
    if (!prev) {
      bestMap.set(entry.nickname, entry);
    } else {
      const isBetter = lowerIsBetter ? entry.score < prev.score : entry.score > prev.score;
      if (isBetter) bestMap.set(entry.nickname, entry);
    }
  }

  const sorted = [...bestMap.values()]
    .sort((a, b) => lowerIsBetter ? a.score - b.score : b.score - a.score);

  const idx = sorted.findIndex((e) => e.nickname === nickname);
  if (idx === -1) return null;
  const e = sorted[idx];
  return { rank: idx + 1, nickname: e.nickname, score: e.score, date: e.date };
}

/** 指定ニックネームの総合ランク（全件検索）*/
export function getUserOverallRankEntry(nickname: string): OverallEntry | null {
  const rankings = loadRankings();
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

  const entries: OverallEntry[] = [];
  for (const [nick, bests] of playerBests.entries()) {
    let totalPoints = 0;
    let gamesPlayed = 0;
    for (const [gameId, score] of Object.entries(bests) as [GameId, number][]) {
      if (score === undefined) continue;
      gamesPlayed++;
      const ref = POINTS_REF[gameId];
      const { lowerIsBetter } = GAME_META[gameId];
      const ratio = lowerIsBetter ? ref / score : score / ref;
      totalPoints += Math.min(20, Math.max(1, Math.round(ratio * 10)));
    }
    entries.push({ rank: 0, nickname: nick, totalPoints, gamesPlayed, details: bests });
  }

  const sorted = entries
    .sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPlayed - a.gamesPlayed)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return sorted.find((e) => e.nickname === nickname) ?? null;
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
