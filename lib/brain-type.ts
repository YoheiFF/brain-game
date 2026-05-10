import type { GameId } from "./scores"
import { GAME_META } from "./scores"

export type CognitiveSkill = "計算力" | "記憶力" | "集中力" | "反応速度" | "空間認識"
export type BrainType =
  | "バランス型"
  | "計算特化型"
  | "記憶特化型"
  | "集中特化型"
  | "反応特化型"
  | "空間特化型"

export const SKILL_MAP: Record<GameId, CognitiveSkill> = {
  calculation: "計算力",
  "memory-number": "記憶力",
  stroop: "集中力",
  reaction: "反応速度",
  pattern: "空間認識",
}

const REFERENCE_SCORES: Record<GameId, number> = {
  calculation: 17,
  "memory-number": 8,
  stroop: 23,
  reaction: 220,
  pattern: 18,
}

export function getRadarData(
  bests: Partial<Record<GameId, number>>
): Record<CognitiveSkill, number | null> {
  const result = {} as Record<CognitiveSkill, number | null>
  for (const skill of Object.values(SKILL_MAP)) result[skill] = null

  for (const [gameId, score] of Object.entries(bests) as [GameId, number][]) {
    if (score === undefined) continue
    const skill = SKILL_MAP[gameId]
    const ref = REFERENCE_SCORES[gameId]
    const { lowerIsBetter } = GAME_META[gameId]
    const ratio = lowerIsBetter ? ref / score : score / ref
    result[skill] = Math.min(100, Math.max(0, Math.round(ratio * 50)))
  }

  return result
}

export function getBrainType(radarData: Record<CognitiveSkill, number | null>): BrainType {
  const entries = Object.entries(radarData).filter(([, v]) => v !== null) as [CognitiveSkill, number][]
  if (entries.length < 3) return "バランス型"

  const avg = entries.reduce((s, [, v]) => s + v, 0) / entries.length
  const top = [...entries].sort((a, b) => b[1] - a[1])[0]

  if (top[1] - avg >= 20) {
    const typeMap: Record<CognitiveSkill, BrainType> = {
      計算力: "計算特化型",
      記憶力: "記憶特化型",
      集中力: "集中特化型",
      反応速度: "反応特化型",
      空間認識: "空間特化型",
    }
    return typeMap[top[0]]
  }
  return "バランス型"
}
