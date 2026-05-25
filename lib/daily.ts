import type { GameId } from "./scores"
import { GAME_IDS, GAME_META } from "./scores"

export const MAX_PLAYS_PER_DAY = 3

const KEY_DAILY = "braingame_daily"

interface DailyRecord {
  date: string
  plays: Partial<Record<GameId, number>>
  bestScores: Partial<Record<GameId, number>>
  rewardedPlays?: Partial<Record<GameId, number>>
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function loadDaily(): DailyRecord {
  if (typeof window === "undefined") return { date: today(), plays: {}, bestScores: {} }
  try {
    const raw = localStorage.getItem(KEY_DAILY)
    const parsed: DailyRecord = raw ? JSON.parse(raw) : null
    if (parsed && parsed.date === today()) return parsed
    return { date: today(), plays: {}, bestScores: {} }
  } catch {
    return { date: today(), plays: {}, bestScores: {} }
  }
}

function saveDaily(record: DailyRecord) {
  localStorage.setItem(KEY_DAILY, JSON.stringify(record))
}

export function getPlayCount(gameId: GameId): number {
  return loadDaily().plays[gameId] ?? 0
}

export function getRemainingPlays(gameId: GameId): number {
  const record = loadDaily()
  const totalPlays = record.plays[gameId] ?? 0
  const rewardedEarned = record.rewardedPlays?.[gameId] ?? 0
  return Math.max(0, MAX_PLAYS_PER_DAY + rewardedEarned - totalPlays)
}

export function getRewardedRemaining(gameId: GameId): number {
  return 1 // 広告視聴回数に上限なし
}

export function recordRewardedPlay(gameId: GameId): void {
  const record = loadDaily()
  if (!record.rewardedPlays) record.rewardedPlays = {}
  record.rewardedPlays[gameId] = (record.rewardedPlays[gameId] ?? 0) + 1
  saveDaily(record)
}

export function canPlay(gameId: GameId): boolean {
  return getRemainingPlays(gameId) > 0
}

export function recordPlay(gameId: GameId, score: number): void {
  const record = loadDaily()
  record.plays[gameId] = (record.plays[gameId] ?? 0) + 1

  const { lowerIsBetter } = GAME_META[gameId]
  const prev = record.bestScores[gameId] ?? null
  record.bestScores[gameId] =
    prev === null
      ? score
      : lowerIsBetter
      ? Math.min(prev, score)
      : Math.max(prev, score)

  saveDaily(record)
}

export function getDailyBests(): Partial<Record<GameId, number>> {
  return loadDaily().bestScores
}

export function getAllRemainingPlays(): Partial<Record<GameId, number>> {
  const result: Partial<Record<GameId, number>> = {}
  for (const id of GAME_IDS) result[id] = getRemainingPlays(id)
  return result
}
