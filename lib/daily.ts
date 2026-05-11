import type { GameId } from "./scores"
import { GAME_IDS, GAME_META } from "./scores"

export const MAX_PLAYS_PER_DAY = 3
export const MAX_REWARDED_PLAYS_PER_DAY = 3

const KEY_DAILY = "braingame_daily"
const KEY_HISTORY = "braingame_daily_history"

interface DailyRecord {
  date: string
  plays: Partial<Record<GameId, number>>
  bestScores: Partial<Record<GameId, number>>
  rewardedPlays?: Partial<Record<GameId, number>>
}

export interface DailyHistoryEntry {
  date: string
  totalPoints: number
  gamesPlayed: number
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

function loadHistory(): Record<string, { totalPoints: number; gamesPlayed: number }> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(KEY_HISTORY) ?? "{}")
  } catch {
    return {}
  }
}

function saveHistory(data: Record<string, { totalPoints: number; gamesPlayed: number }>) {
  localStorage.setItem(KEY_HISTORY, JSON.stringify(data))
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
  const used = loadDaily().rewardedPlays?.[gameId] ?? 0
  return Math.max(0, MAX_REWARDED_PLAYS_PER_DAY - used)
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
  updateDailyHistory(record)
}

export function getDailyBests(): Partial<Record<GameId, number>> {
  return loadDaily().bestScores
}

export function getAllRemainingPlays(): Partial<Record<GameId, number>> {
  const result: Partial<Record<GameId, number>> = {}
  for (const id of GAME_IDS) result[id] = getRemainingPlays(id)
  return result
}

export function getDailyHistory(days: number): DailyHistoryEntry[] {
  const history = loadHistory()
  const result: DailyHistoryEntry[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const entry = history[key]
    result.push({
      date: key,
      totalPoints: entry?.totalPoints ?? 0,
      gamesPlayed: entry?.gamesPlayed ?? 0,
    })
  }
  return result
}

const REFERENCE: Record<GameId, number> = {
  calculation: 17,
  "memory-number": 8,
  stroop: 23,
  reaction: 220,
  pattern: 18,
}

function updateDailyHistory(record: DailyRecord) {
  const history = loadHistory()
  const scores = record.bestScores
  let totalPoints = 0
  let gamesPlayed = 0

  for (const gameId of GAME_IDS) {
    const score = scores[gameId]
    const ref = REFERENCE[gameId]
    if (score === undefined || ref === undefined) continue
    gamesPlayed++
    const { lowerIsBetter } = GAME_META[gameId]
    const ratio = lowerIsBetter ? ref / score : score / ref
    totalPoints += Math.min(100, Math.round(ratio * 50))
  }

  history[record.date] = { totalPoints, gamesPlayed }
  saveHistory(history)
}
