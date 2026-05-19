import type { GameId } from "./scores"
import { calcGamePoints } from "./game-points"

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
  "n-back":          "記憶力",
  "dual-task":       "集中力",
  "trail-making":    "反応速度",
  "mental-rotation": "空間認識",
}

export const SKILL_GAMES: Record<CognitiveSkill, { id: GameId; title: string }[]> = {
  計算力:   [{ id: "calculation",     title: "計算ゲーム" }],
  記憶力:   [{ id: "memory-number",   title: "数字記憶" }, { id: "n-back", title: "3バック課題" }],
  集中力:   [{ id: "stroop",          title: "ストループ" }, { id: "dual-task", title: "注意分割タスク" }],
  反応速度: [{ id: "reaction",        title: "反応速度テスト" }, { id: "trail-making", title: "トレイルメイキング" }],
  空間認識: [{ id: "pattern",         title: "図形記憶" }, { id: "mental-rotation", title: "心的回転" }],
}

/** 各スキルの最高ゲームポイント(1〜20)を 5〜100 に換算。20pt = 100(外枠) */
export function getRadarData(
  bests: Partial<Record<GameId, number>>
): Record<CognitiveSkill, number | null> {
  const result = {} as Record<CognitiveSkill, number | null>
  for (const skill of Object.values(SKILL_MAP)) result[skill] = null

  for (const [gameId, score] of Object.entries(bests) as [GameId, number][]) {
    if (score === undefined) continue
    const skill = SKILL_MAP[gameId]
    const pts = calcGamePoints(gameId, score)
    const radarValue = Math.round(pts / 20 * 100)
    const current = result[skill]
    result[skill] = current === null ? radarValue : Math.max(current, radarValue)
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
