import type { GameId } from "./scores"

export interface Title {
  id: string
  name: string
  icon: string
  description: string
  rarity: "normal" | "rare" | "epic"
}

interface TitleDef extends Title {
  condition: (bests: Partial<Record<GameId, number>>, totalPlays: number) => boolean
}

const TITLE_DEFS: TitleDef[] = [
  {
    id: "calc_master",
    name: "計算の達人",
    icon: "🧮",
    description: "計算ゲームで20問以上クリア",
    rarity: "rare",
    condition: (b) => (b.calculation ?? 0) >= 20,
  },
  {
    id: "memory_master",
    name: "記憶マスター",
    icon: "🔢",
    description: "数字記憶で9桁以上を記憶",
    rarity: "rare",
    condition: (b) => (b["memory-number"] ?? 0) >= 9,
  },
  {
    id: "iron_focus",
    name: "鉄の集中力",
    icon: "🎯",
    description: "ストループテストで25点以上獲得",
    rarity: "rare",
    condition: (b) => (b.stroop ?? 0) >= 25,
  },
  {
    id: "lightning",
    name: "電光石火",
    icon: "⚡",
    description: "反応速度200ms以下を達成",
    rarity: "epic",
    condition: (b) => b.reaction !== undefined && b.reaction <= 200,
  },
  {
    id: "spatial_genius",
    name: "空間の申し子",
    icon: "🧩",
    description: "図形記憶で20点以上獲得",
    rarity: "rare",
    condition: (b) => (b.pattern ?? 0) >= 20,
  },
  {
    id: "all_clear",
    name: "全種目制覇",
    icon: "🏆",
    description: "全5種目をプレイ",
    rarity: "normal",
    condition: (b) =>
      (["calculation", "memory-number", "stroop", "reaction", "pattern"] as GameId[]).every(
        (id) => b[id] !== undefined
      ),
  },
  {
    id: "genius_brain",
    name: "全能の脳",
    icon: "🧠",
    description: "全5種目でベンチマーク平均超え",
    rarity: "epic",
    condition: (b) =>
      (b.calculation ?? 0) >= 16 &&
      (b["memory-number"] ?? 0) >= 7 &&
      (b.stroop ?? 0) >= 18 &&
      b.reaction !== undefined && b.reaction <= 270 &&
      (b.pattern ?? 0) >= 12,
  },
  {
    id: "stoic",
    name: "ストイック",
    icon: "💪",
    description: "合計10回以上プレイ",
    rarity: "normal",
    condition: (_, totalPlays) => totalPlays >= 10,
  },
]

export function getEarnedTitles(
  bests: Partial<Record<GameId, number>>,
  totalPlays: number
): Title[] {
  return TITLE_DEFS
    .filter((def) => def.condition(bests, totalPlays))
    .map(({ condition: _c, ...title }) => title)
}

export function getAllTitles(
  bests: Partial<Record<GameId, number>>,
  totalPlays: number
): (Title & { earned: boolean })[] {
  return TITLE_DEFS.map(({ condition, ...title }) => ({
    ...title,
    earned: condition(bests, totalPlays),
  }))
}
