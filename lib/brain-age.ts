import type { GameId } from "./scores"

const AGE_BENCHMARKS: Record<GameId, Record<number, number>> = {
  calculation:      { 15: 14, 25: 17, 35: 16, 45: 14, 55: 12, 65: 9 },
  "memory-number":  { 15: 7,  25: 8,  35: 7,  45: 6,  55: 6,  65: 5 },
  stroop:           { 15: 18, 25: 23, 35: 21, 45: 18, 55: 15, 65: 12 },
  reaction:         { 15: 260, 25: 220, 35: 240, 45: 270, 55: 300, 65: 350 },
  pattern:          { 15: 14, 25: 18, 35: 16, 45: 13, 55: 11, 65: 9 },
}

const AGE_POINTS = [15, 25, 35, 45, 55, 65]

function estimateAge(gameId: GameId, score: number): number {
  const benchmarks = AGE_BENCHMARKS[gameId]
  let closestAge = AGE_POINTS[0]
  let closestDiff = Infinity

  for (const age of AGE_POINTS) {
    const diff = Math.abs(score - benchmarks[age])
    if (diff < closestDiff) {
      closestDiff = diff
      closestAge = age
    }
  }
  return closestAge
}

/** 全ゲームの個人ベストから脳年齢（推定）を返す。2種目未満なら null */
export function calcBrainAge(bests: Partial<Record<GameId, number>>): number | null {
  const ages: number[] = []
  for (const [gameId, score] of Object.entries(bests) as [GameId, number][]) {
    if (score !== undefined) ages.push(estimateAge(gameId, score))
  }
  if (ages.length < 2) return null
  return Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
}
