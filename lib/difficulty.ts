// lib/difficulty.ts
import type { GameId } from "./scores";

export type Difficulty = "normal" | "hard" | "superhard" | "ultrahard";

// ── 難易度パラメータ型 ────────────────────────────────────

export interface CalculationDifficultyParams {
  gameTime: number;       // 制限時間（秒）
  numberOffset: number;   // 加算数値範囲への加算値（0=通常）
}

export interface MemoryNumberDifficultyParams {
  startLevel: number;     // 開始桁数
  showMsPerDigit: number; // 1桁あたりの表示ms
}

export interface StroopDifficultyParams {
  gameTime: number;       // 制限時間（秒）
}

export interface ReactionDifficultyParams {
  rounds: number;         // ラウンド数
  minWait: number;        // ms
  maxWait: number;        // ms
}

export interface PatternDifficultyParams {
  startLevel: number;     // 開始レベル
  showTimeBase: number;   // 表示時間ベース（ms）
  showTimePerLevel: number; // レベルごとの加算ms
}

export interface NBackDifficultyParams {
  nLevel: number;          // N値（2=2バック）
  speedMultiplier: number; // 速度ステージ係数（1.0=通常、0.8=20%高速）
}

export interface DualTaskDifficultyParams {
  leftIntervalMs: number;
  rightIntervalMs: number;
  fastLeftIntervalMs: number;
  fastRightIntervalMs: number;
  boostThreshold: number;
}

export interface TrailMakingDifficultyParams {
  nodeCount: number;
  timeLimitSec: number;
}

export interface MentalRotationDifficultyParams {
  timeFirstHalfMs: number;
  timeSecondHalfMs: number;
}

export interface RunningTotalDifficultyParams {
  startStageIndex: number; // STAGES 配列のインデックス（0〜3）
}

// ── 難易度パラメータ定数 ────────────────────────────────

export const DIFFICULTY_PARAMS = {
  calculation: {
    normal:    { gameTime: 30, numberOffset: 0  } satisfies CalculationDifficultyParams,
    hard:      { gameTime: 20, numberOffset: 0  } satisfies CalculationDifficultyParams,
    superhard: { gameTime: 15, numberOffset: 20 } satisfies CalculationDifficultyParams,
    ultrahard: { gameTime: 10, numberOffset: 30 } satisfies CalculationDifficultyParams,
  },
  "memory-number": {
    normal:    { startLevel: 3, showMsPerDigit: 600 } satisfies MemoryNumberDifficultyParams,
    hard:      { startLevel: 5, showMsPerDigit: 400 } satisfies MemoryNumberDifficultyParams,
    superhard: { startLevel: 7, showMsPerDigit: 300 } satisfies MemoryNumberDifficultyParams,
    ultrahard: { startLevel: 9, showMsPerDigit: 200 } satisfies MemoryNumberDifficultyParams,
  },
  stroop: {
    normal:    { gameTime: 30 } satisfies StroopDifficultyParams,
    hard:      { gameTime: 20 } satisfies StroopDifficultyParams,
    superhard: { gameTime: 15 } satisfies StroopDifficultyParams,
    ultrahard: { gameTime: 10 } satisfies StroopDifficultyParams,
  },
  reaction: {
    normal:    { rounds: 5, minWait: 1500, maxWait: 4000 } satisfies ReactionDifficultyParams,
    hard:      { rounds: 5, minWait: 1000, maxWait: 3000 } satisfies ReactionDifficultyParams,
    superhard: { rounds: 5, minWait: 500,  maxWait: 2500 } satisfies ReactionDifficultyParams,
    ultrahard: { rounds: 5, minWait: 300,  maxWait: 2000 } satisfies ReactionDifficultyParams,
  },
  pattern: {
    normal:    { startLevel: 1, showTimeBase: 1200, showTimePerLevel: 100 } satisfies PatternDifficultyParams,
    hard:      { startLevel: 3, showTimeBase: 1000, showTimePerLevel: 80  } satisfies PatternDifficultyParams,
    superhard: { startLevel: 5, showTimeBase: 900,  showTimePerLevel: 60  } satisfies PatternDifficultyParams,
    ultrahard: { startLevel: 7, showTimeBase: 800,  showTimePerLevel: 50  } satisfies PatternDifficultyParams,
  },
  "n-back": {
    normal:    { nLevel: 2, speedMultiplier: 1.0 } satisfies NBackDifficultyParams,
    hard:      { nLevel: 3, speedMultiplier: 1.0 } satisfies NBackDifficultyParams,
    superhard: { nLevel: 3, speedMultiplier: 0.8 } satisfies NBackDifficultyParams,
    ultrahard: { nLevel: 4, speedMultiplier: 0.8 } satisfies NBackDifficultyParams,
  },
  "dual-task": {
    normal:    { leftIntervalMs: 1100, rightIntervalMs: 1000, fastLeftIntervalMs: 700, fastRightIntervalMs: 800, boostThreshold: 15 } satisfies DualTaskDifficultyParams,
    hard:      { leftIntervalMs: 900,  rightIntervalMs: 800,  fastLeftIntervalMs: 600, fastRightIntervalMs: 600, boostThreshold: 15 } satisfies DualTaskDifficultyParams,
    superhard: { leftIntervalMs: 700,  rightIntervalMs: 600,  fastLeftIntervalMs: 500, fastRightIntervalMs: 500, boostThreshold: 10 } satisfies DualTaskDifficultyParams,
    ultrahard: { leftIntervalMs: 500,  rightIntervalMs: 500,  fastLeftIntervalMs: 400, fastRightIntervalMs: 400, boostThreshold: 8  } satisfies DualTaskDifficultyParams,
  },
  "trail-making": {
    normal:    { nodeCount: 20, timeLimitSec: 60 } satisfies TrailMakingDifficultyParams,
    hard:      { nodeCount: 25, timeLimitSec: 60 } satisfies TrailMakingDifficultyParams,
    superhard: { nodeCount: 30, timeLimitSec: 50 } satisfies TrailMakingDifficultyParams,
    ultrahard: { nodeCount: 35, timeLimitSec: 45 } satisfies TrailMakingDifficultyParams,
  },
  "mental-rotation": {
    normal:    { timeFirstHalfMs: 3000, timeSecondHalfMs: 2000 } satisfies MentalRotationDifficultyParams,
    hard:      { timeFirstHalfMs: 2500, timeSecondHalfMs: 1500 } satisfies MentalRotationDifficultyParams,
    superhard: { timeFirstHalfMs: 2000, timeSecondHalfMs: 1500 } satisfies MentalRotationDifficultyParams,
    ultrahard: { timeFirstHalfMs: 1500, timeSecondHalfMs: 1500 } satisfies MentalRotationDifficultyParams,
  },
  "running-total": {
    normal:    { startStageIndex: 0 } satisfies RunningTotalDifficultyParams,
    hard:      { startStageIndex: 1 } satisfies RunningTotalDifficultyParams,
    superhard: { startStageIndex: 2 } satisfies RunningTotalDifficultyParams,
    ultrahard: { startStageIndex: 3 } satisfies RunningTotalDifficultyParams,
  },
} as const satisfies Record<GameId, Record<Difficulty, unknown>>;

// ── クリア閾値 ──────────────────────────────────────────
// lowerIsBetter なゲーム（reaction, trail-making）は「この値以下」でクリア
// それ以外は「この値以上」でクリア

export const PASS_THRESHOLD: Record<GameId, Partial<Record<Difficulty, number>>> = {
  calculation:     { hard: 7,   superhard: 7,   ultrahard: 5   },
  "memory-number": { hard: 5,   superhard: 7,   ultrahard: 9   },
  stroop:          { hard: 10,  superhard: 9,   ultrahard: 6   },
  reaction:        { hard: 350, superhard: 300, ultrahard: 270 }, // ms以下でクリア
  pattern:         { hard: 5,   superhard: 7,   ultrahard: 9   },
  "n-back":        { hard: 12,  superhard: 12,  ultrahard: 10  },
  "dual-task":     { hard: 14,  superhard: 12,  ultrahard: 10  },
  "trail-making":  { hard: 55,  superhard: 45,  ultrahard: 40  }, // 秒以下でクリア
  "mental-rotation": { hard: 13, superhard: 12, ultrahard: 11  },
  "running-total": { hard: 6,   superhard: 5,   ultrahard: 4   },
};

/** スコアがクリア閾値を達成しているか判定する */
export function isPassed(gameId: GameId, difficulty: Difficulty, score: number): boolean {
  const threshold = PASS_THRESHOLD[gameId]?.[difficulty];
  if (threshold === undefined) return true; // normalは常にクリア
  // lowerIsBetter なゲーム
  if (gameId === "reaction" || gameId === "trail-making") {
    return score <= threshold;
  }
  return score >= threshold;
}

/** SuperBrainの第N問（0始まり）の難易度を返す */
export function getChallengeSequence(): Difficulty[] {
  return ["hard", "hard", "superhard", "superhard", "ultrahard"];
}

/** 難易度の日本語ラベル */
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  normal:    "ノーマル",
  hard:      "Hard",
  superhard: "SuperHard",
  ultrahard: "UltraHard",
};

/** 難易度のバッジカラー（Tailwind クラス） */
export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  normal:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
  hard:      "bg-orange-500/20 text-orange-400 border-orange-500/30",
  superhard: "bg-red-500/20 text-red-400 border-red-500/30",
  ultrahard: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};
