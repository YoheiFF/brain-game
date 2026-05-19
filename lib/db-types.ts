import type { GameId } from "@/lib/scores";
import type { RankEntry, OverallEntry } from "@/lib/scores";

export type { GameId, RankEntry, OverallEntry };

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

// /api/sync レスポンス全体
export interface SyncResponse {
  personalBests: Partial<Record<GameId, number>>;
  gameRankings: Partial<Record<GameId, RankEntry[]>>;
  overallRanking: OverallEntry[];
  dailyPlays: Partial<Record<GameId, { playCount: number; bestScore: number | null }>>;
  dailyHistory: never[];
  myGameRanks: Partial<Record<GameId, RankEntry>>;
  myOverallRank: OverallEntry | null;
}

// フレンドシップのステータス
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

// friendships テーブルの行
export interface Friendship {
  id: number;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}

// フレンド一覧の各エントリ（GET /api/friends レスポンス）
export interface FriendEntry {
  userId: string;
  nickname: string;
  friendCode: string | null;
}

// 受信した申請の各エントリ（GET /api/friends/pending レスポンス）
export interface PendingRequest {
  requesterId: string;
  requesterNickname: string;
  createdAt: string;  // ISO 8601
}
