import type { GameId } from "./scores"
import { calcGamePoints } from "./game-points"

/**
 * 20点 → 20歳、10点 → 45歳（40代平均）の線形換算
 * 60歳以上は表示側で "60歳以上" と扱う
 */
function gamePointsToAge(points: number): number {
  return Math.floor(20 + (20 - points) * 2.5)
}

/** 全ゲームの個人ベストから脳年齢（推定）を返す。2種目未満なら null */
export function calcBrainAge(bests: Partial<Record<GameId, number>>): number | null {
  const ages: number[] = []
  for (const [gameId, score] of Object.entries(bests) as [GameId, number][]) {
    if (score !== undefined) {
      const points = calcGamePoints(gameId, score)
      ages.push(gamePointsToAge(points))
    }
  }
  if (ages.length < 2) return null
  return Math.floor(ages.reduce((a, b) => a + b, 0) / ages.length)
}
