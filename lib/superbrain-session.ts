// lib/superbrain-session.ts
import type { GameId } from "./scores";
import type { Difficulty } from "./difficulty";

export type SuperBrainStatus = "playing" | "gameover" | "cleared";

export interface ChallengeResult {
  gameId: GameId;
  difficulty: Difficulty;
  score: number;
  passed: boolean;
  clearThreshold: number;
}

export interface SuperBrainSession {
  sessionId: string;
  status: SuperBrainStatus;
  games: GameId[];         // 長さ5のGameId配列
  challengeIndex: number;  // 0〜4
  results: ChallengeResult[];
  createdAt: string;       // ISO 8601
}

const SESSION_KEY = "superbrain_session";

export function loadSession(): SuperBrainSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SuperBrainSession;
  } catch {
    return null;
  }
}

export function saveSession(session: SuperBrainSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // sessionStorage 書き込み失敗は無視
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** 5ゲームをランダム選択（重複なし） */
export function selectRandomGames(allGameIds: GameId[]): GameId[] {
  const shuffled = [...allGameIds].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

const CLEAR_COUNT_KEY = "superbrain_clear_count";

/** SuperBrainのクリア回数を取得する */
export function getSuperBrainClearCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(localStorage.getItem(CLEAR_COUNT_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

/** SuperBrainクリア時に回数を+1して返す */
export function incrementSuperBrainClearCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const count = getSuperBrainClearCount() + 1;
    localStorage.setItem(CLEAR_COUNT_KEY, String(count));
    return count;
  } catch {
    return 0;
  }
}

/** 新しいセッションを生成する */
export function createSession(games: GameId[]): SuperBrainSession {
  return {
    sessionId: crypto.randomUUID(),
    status: "playing",
    games,
    challengeIndex: 0,
    results: [],
    createdAt: new Date().toISOString(),
  };
}
