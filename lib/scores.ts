export type GameId = "calculation" | "memory-number" | "stroop" | "reaction" | "pattern"
  | "n-back" | "dual-task" | "trail-making" | "mental-rotation" | "running-total";

export const GAME_META: Record<GameId, { label: string; unit: string; lowerIsBetter?: boolean }> = {
  calculation:   { label: "計算ゲーム",     unit: "問" },
  "memory-number": { label: "数字記憶",     unit: "桁" },
  stroop:        { label: "ストループテスト", unit: "個" },
  reaction:      { label: "反応速度テスト",  unit: "ms", lowerIsBetter: true },
  pattern:       { label: "図形記憶",       unit: "個" },
  "n-back":           { label: "Nバック課題",     unit: "点" },
  "dual-task":        { label: "注意分割タスク",   unit: "問" },
  "trail-making":     { label: "トレイルメイキング", unit: "秒", lowerIsBetter: true },
  "mental-rotation":  { label: "心的回転",         unit: "問" },
  "running-total":    { label: "暗算ランニング",    unit: "問" },
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
    fetch("/api/record-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, gameId, score }),
    }).catch((e) => {
      console.warn("[saveScore] record-score API failed:", e);
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
    .slice(0, 20)
    .map((e, i) => ({ rank: i + 1, nickname: e.nickname, score: e.score, date: e.date }));
}

// ── 総合ランキング（廃止済み・互換性のため型定義のみ残す） ──────────

export interface OverallEntry {
  rank: number;
  nickname: string;
  totalPoints: number;
  gamesPlayed: number;
  details: Partial<Record<GameId, number>>;
}

/** @deprecated 総合ポイント廃止 */
export function getOverallRanking(): OverallEntry[] {
  return [];
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

/** @deprecated 総合ポイント廃止 */
export function getUserOverallRankEntry(_nickname: string): OverallEntry | null {
  return null;
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
