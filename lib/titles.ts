import type { GameId } from "./scores"
import { GAME_IDS } from "./scores"
import { calcGamePoints } from "./game-points"

export interface Title {
  id: string
  name: string
  icon: string
  description: string
  rarity: "normal" | "rare" | "epic"
}

interface TitleDef extends Title {
  condition: (bests: Partial<Record<GameId, number>>, totalPlays: number, sbClears?: number) => boolean
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
    description: "全9種目をプレイ",
    rarity: "normal",
    condition: (b) =>
      (["calculation", "memory-number", "stroop", "reaction", "pattern",
        "n-back", "dual-task", "trail-making", "mental-rotation"] as GameId[]).every(
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
  {
    id: "nback_master",
    name: "記憶の番人",
    icon: "🔄",
    description: "Nバック課題で100点以上獲得",
    rarity: "rare" as const,
    condition: (b: Partial<Record<GameId, number>>) => (b["n-back"] ?? 0) >= 100,
  },
  {
    id: "dual_master",
    name: "マルチタスカー",
    icon: "👁",
    description: "注意分割タスクで40問以上正解",
    rarity: "rare" as const,
    condition: (b: Partial<Record<GameId, number>>) => (b["dual-task"] ?? 0) >= 40,
  },
  {
    id: "trail_master",
    name: "迅速な思考",
    icon: "✏️",
    description: "トレイルメイキングで700点以上獲得",
    rarity: "rare" as const,
    condition: (b: Partial<Record<GameId, number>>) => (b["trail-making"] ?? 0) >= 700,
  },
  {
    id: "rotation_master",
    name: "空間の覇者",
    icon: "🔃",
    description: "心的回転で150点以上獲得",
    rarity: "epic" as const,
    condition: (b: Partial<Record<GameId, number>>) => (b["mental-rotation"] ?? 0) >= 150,
  },
  {
    id: "brain_king",
    name: "頭脳王",
    icon: "👑",
    description: "全ゲームで15点以上獲得",
    rarity: "epic",
    condition: (b) =>
      GAME_IDS.every((id) => {
        const score = b[id];
        if (score === undefined) return false;
        return calcGamePoints(id, score) >= 15;
      }),
  },
  {
    id: "omniscient",
    name: "全知全能",
    icon: "✨",
    description: "全ゲームで20点獲得",
    rarity: "epic",
    condition: (b) =>
      GAME_IDS.every((id) => {
        const score = b[id];
        if (score === undefined) return false;
        return calcGamePoints(id, score) >= 20;
      }),
  },
  {
    id: "superbrain",
    name: "SuperBrain",
    icon: "🧠",
    description: "SuperBrainモードをクリア",
    rarity: "rare",
    condition: (_b, _p, sbClears = 0) => sbClears >= 1,
  },
  {
    id: "ultrabrain",
    name: "UltraBrain",
    icon: "⚡🧠",
    description: "SuperBrainモードを10回クリア",
    rarity: "epic",
    condition: (_b, _p, sbClears = 0) => sbClears >= 10,
  },
]

export function getEarnedTitles(
  bests: Partial<Record<GameId, number>>,
  totalPlays: number,
  sbClears = 0
): Title[] {
  return TITLE_DEFS
    .filter((def) => def.condition(bests, totalPlays, sbClears))
    .map(({ condition: _c, ...title }) => title)
}

export function getAllTitles(
  bests: Partial<Record<GameId, number>>,
  totalPlays: number,
  sbClears = 0
): (Title & { earned: boolean })[] {
  return TITLE_DEFS.map(({ condition, ...title }) => ({
    ...title,
    earned: condition(bests, totalPlays, sbClears),
  }))
}
