import type { GameId } from "@/lib/scores";
import type { RankEntry, OverallEntry } from "@/lib/scores";
import type { DailyHistoryEntry } from "@/lib/daily";

export type { GameId, RankEntry, OverallEntry, DailyHistoryEntry };

// ユーザー
export interface User {
  id: string;        // UUID
  nickname: string;
  age: number | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// スコアエントリ（DB から返る形式）
export interface DbScoreEntry {
  userId: string;
  nickname: string;
  gameId: GameId;
  score: number;
  createdAt: string; // ISO 8601
}

// デイリープレイ
export interface DailyPlay {
  userId: string;
  gameId: GameId;
  playDate: string;      // "YYYY-MM-DD"
  playCount: number;
  bestScore: number | null;
}

// デイリー履歴
export interface DailyHistoryRecord {
  userId: string;
  playDate: string;      // "YYYY-MM-DD"
  totalPoints: number;
  gamesPlayed: number;
}

// /api/sync レスポンス全体
export interface SyncResponse {
  personalBests: Partial<Record<GameId, number>>;
  gameRankings: Partial<Record<GameId, RankEntry[]>>;
  overallRanking: OverallEntry[];
  dailyPlays: Partial<Record<GameId, { playCount: number; bestScore: number | null }>>;
  dailyHistory: DailyHistoryEntry[];
  myGameRanks: Partial<Record<GameId, RankEntry>>;
  myOverallRank: OverallEntry | null;
}
