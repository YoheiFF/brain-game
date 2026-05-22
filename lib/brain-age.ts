import type { GameId } from "./scores"

const AGE_BENCHMARKS: Record<GameId, Record<number, number>> = {
  calculation:     { 15: 11, 25: 13, 35: 12, 45: 11, 55: 9,  65: 7  },
  "memory-number": { 15: 7,  25: 7,  35: 6,  45: 6,  55: 5,  65: 4  },
  stroop:          { 15: 14, 25: 18, 35: 16, 45: 14, 55: 12, 65: 9  },
  reaction:        { 15: 240, 25: 250, 35: 270, 45: 300, 55: 340, 65: 390 },
  pattern:         { 15: 10, 25: 12, 35: 11, 45: 9,  55: 8,  65: 6  },
  "n-back":          { 15: 10, 25: 13, 35: 12, 45: 10, 55: 8,  65: 6  },
  "dual-task":       { 15: 10, 25: 11, 35: 10, 45: 9,  55: 7,  65: 5  },
  "trail-making":    { 15: 14, 25: 16, 35: 20, 45: 27, 55: 36, 65: 48 },
  "mental-rotation": { 15: 14, 25: 15, 35: 14, 45: 12, 55: 10, 65: 8  },
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
