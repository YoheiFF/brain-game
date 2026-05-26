import type { GameId } from "./scores"
import { GAME_META } from "./scores"

// 20代平均スコアを10点の基準として換算
const REFERENCE: Record<GameId, number> = {
  calculation: 15,
  "memory-number": 7,
  stroop: 18,
  reaction: 300,
  pattern: 12,
  "n-back":          10,
  "dual-task":       10,
  "trail-making":    20,
  "mental-rotation": 10,
  "running-total":   6,
}

/** ゲームの生スコアを 1〜20 点に換算する */
export function calcGamePoints(gameId: GameId, score: number): number {
  const ref = REFERENCE[gameId]
  const { lowerIsBetter } = GAME_META[gameId]
  const ratio = lowerIsBetter ? ref / score : score / ref
  return Math.min(20, Math.max(1, Math.round(ratio * 10)))
}

/** 全ゲームのベストスコアから合計ポイント（最大100）を返す */
export function calcTotalPoints(bests: Partial<Record<GameId, number>>): number {
  let total = 0
  for (const [gameId, score] of Object.entries(bests) as [GameId, number][]) {
    if (score !== undefined) total += calcGamePoints(gameId, score)
  }
  return total
}
