# 詳細設計書: BrainGame スコア活用機能

> **このドキュメントをそのまま Claude Code に渡して実装を依頼できます。**
> タスクを上から順に実装し、各タスクの完了条件を確認してから次へ進んでください。

## セッション開始手順
1. `/clear` でコンテキストをリセット
2. 「最初に読むべきファイル」を読み込む
3. タスク1から順番に実装する

## 最初に読むべきファイル
- @docs/brain-game-score-features-basic-design.md — 基本設計・全体像
- @lib/scores.ts — 既存スコア管理
- @lib/benchmarks.ts — 年代別平均テーブル
- @lib/nickname.ts — ニックネーム・年齢管理
- @app/page.tsx — ホーム画面（更新対象）

## レビューで判明した修正点（v3: 全体見直し）

### 新機能設計の修正（v2から引き継ぎ）

| # | 問題 | 修正内容 |
|---|------|---------|
| 1 | `brain-age.ts` の線形補間がreactionの非単調ベンチマークで壊れる | 線形補間 → 最近傍年代法に変更 |
| 2 | `memory-number` の `saveScore` は2箇所にある | タスク7で両方に `recordPlay` を追加 |
| 3 | `pattern` のスコア引数は `score` 変数（`level` ではない） | タスク7の `recordPlay` 引数を `score` に修正 |
| 4 | `totalPlays` が「プレイ済み種目数（最大5）」になる | `scores.ts` に `getTotalPlayCount()` を追加 |

### 既存コードの不具合（全体見直しで発見）

| # | ファイル | 問題 | 重要度 |
|---|---------|------|--------|
| 5 | `lib/daily.ts`（新規） | `today()` および `getDailyHistory()` が UTC 日付を返す → JST では0〜8時台に「昨日」の日付になる | **バグ** |
| 6 | `app/page.tsx` | 計算ゲームの description が「60秒間」だが実際は30秒 | **バグ** |
| 7 | `app/games/calculation/page.tsx` | `timerColor` の `timeLeft > 30` は GAME_TIME=30 のため常にfalse → 緑が表示されない | 表示不具合 |
| 8 | `lib/daily.ts`（新規） | `REFERENCE` を `Partial<Record>` にするとゲーム追加時の型漏れを検出できない | 型安全性 |

---

## タスク 0／9: 既存コードの不具合修正

### 修正1: app/page.tsx — 計算ゲームの説明文

```typescript
// 変更前
{ id: "calculation", description: "60秒間で四則演算を解け！", ... }

// 変更後
{ id: "calculation", description: "30秒間で四則演算を解け！", ... }
```

### 修正2: app/games/calculation/page.tsx — timerColor の閾値

```typescript
// 変更前
const timerColor = timeLeft > 30 ? "text-green-400" : timeLeft > 10 ? "text-yellow-400" : "text-red-400"

// 変更後（GAME_TIME=30 に合わせた閾値）
const timerColor = timeLeft > 20 ? "text-green-400" : timeLeft > 10 ? "text-yellow-400" : "text-red-400"
```

**完了確認:**
- [ ] ホーム画面の計算ゲームカードに「30秒間」と表示される
- [ ] 計算ゲームで残り20秒まで緑、10秒まで黄色、以降赤で表示される

---

## タスク 1／9: デイリー管理ライブラリ（lib/daily.ts）

**対象ファイル:** `lib/daily.ts`（新規作成）

**目的:** プレイ回数・上限管理、デイリースコア履歴を管理する。全ゲームからこのファイルを呼ぶ。

```typescript
// lib/daily.ts
import type { GameId } from "./scores"
import { GAME_IDS, GAME_META } from "./scores"

export const MAX_PLAYS_PER_DAY = 3

const KEY_DAILY = "braingame_daily"
const KEY_HISTORY = "braingame_daily_history"

interface DailyRecord {
  date: string
  plays: Partial<Record<GameId, number>>
  bestScores: Partial<Record<GameId, number>>
}

export interface DailyHistoryEntry {
  date: string
  totalPoints: number
  gamesPlayed: number
}

// ※ toISOString() は UTC を返すため JST では0〜8時台に「昨日」になる
// ローカル日付を使うこと
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
  return Math.max(0, MAX_PLAYS_PER_DAY - getPlayCount(gameId))
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
    // ※ toISOString() は UTC を返すため JST では0〜8時台に日付がズレる
    // ローカルメソッドで日付文字列を生成すること
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

// 20代平均を基準(50pt)として正規化
// ※ Partial ではなく Record にしてゲーム追加時の型漏れを防ぐ
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
```

**完了確認:**
- [ ] `lib/daily.ts` が作成されている
- [ ] `npx tsc --noEmit` でエラーなし

---

## タスク 2／9: scores.ts に getTotalPlayCount を追加

**対象ファイル:** `lib/scores.ts`（末尾に追記）

**目的:** 全ゲームの累計プレイ回数を返す関数を追加する。称号「ストイック」の条件判定に使用する。

```typescript
// lib/scores.ts の末尾に追記

/** 全ゲームの累計プレイ回数を返す */
export function getTotalPlayCount(): number {
  const rankings = loadRankings()
  let total = 0
  for (const gameId of GAME_IDS) {
    total += (rankings[gameId] ?? []).length
  }
  return total
}
```

**完了確認:**
- [ ] `lib/scores.ts` の末尾に `getTotalPlayCount` が追加されている
- [ ] `npx tsc --noEmit` でエラーなし

---

## タスク 3／9: 脳年齢・脳タイプ・称号ライブラリ

**対象ファイル:** `lib/brain-age.ts`, `lib/brain-type.ts`, `lib/titles.ts`（新規作成）

```typescript
// lib/brain-age.ts
// ※ reactionのベンチマークは非単調（20代が最良でその後悪化）のため
//   線形補間ではなく「最近傍年代法」を使用する
import type { GameId } from "./scores"

const AGE_BENCHMARKS: Record<GameId, Record<number, number>> = {
  calculation:      { 15: 14, 25: 17, 35: 16, 45: 14, 55: 12, 65: 9 },
  "memory-number":  { 15: 7,  25: 8,  35: 7,  45: 6,  55: 6,  65: 5 },
  stroop:           { 15: 18, 25: 23, 35: 21, 45: 18, 55: 15, 65: 12 },
  reaction:         { 15: 260, 25: 220, 35: 240, 45: 270, 55: 300, 65: 350 },
  pattern:          { 15: 14, 25: 18, 35: 16, 45: 13, 55: 11, 65: 9 },
}

const AGE_POINTS = [15, 25, 35, 45, 55, 65]

/**
 * スコアに最も近いベンチマーク年代を返す（最近傍年代法）。
 * lowerIsBetter の場合は差の絶対値で比較する。
 */
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
```

```typescript
// lib/brain-type.ts
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
```

```typescript
// lib/titles.ts
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
      (b.pattern ?? 0) >= 13,
  },
  {
    id: "stoic",
    name: "ストイック",
    icon: "💪",
    description: "合計10回以上プレイ",
    rarity: "normal",
    // totalPlays は scores.ts の getTotalPlayCount() から取得した値を渡す
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
```

**完了確認:**
- [ ] 3ファイルが作成されている
- [ ] `npx tsc --noEmit` でエラーなし

---

## タスク 4／9: SVGチャートコンポーネント

**対象ファイル:** `components/RadarChart.tsx`, `components/MiniBarChart.tsx`（新規作成）

```typescript
// components/RadarChart.tsx
"use client"
import type { CognitiveSkill } from "@/lib/brain-type"

interface Props {
  data: Record<CognitiveSkill, number | null>
  size?: number
}

const SKILLS: CognitiveSkill[] = ["計算力", "記憶力", "集中力", "反応速度", "空間認識"]

export default function RadarChart({ data, size = 220 }: Props) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const n = SKILLS.length

  function polar(angle: number, radius: number) {
    return {
      x: cx + radius * Math.sin(angle),
      y: cy - radius * Math.cos(angle),
    }
  }

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0]

  function gridPoints(ratio: number) {
    return SKILLS.map((_, i) => {
      const angle = (2 * Math.PI * i) / n
      const p = polar(angle, r * ratio)
      return `${p.x},${p.y}`
    }).join(" ")
  }

  function dataPoints() {
    return SKILLS.map((skill, i) => {
      const value = data[skill]
      const ratio = value !== null ? value / 100 : 0
      const angle = (2 * Math.PI * i) / n
      const p = polar(angle, r * ratio)
      return `${p.x},${p.y}`
    }).join(" ")
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={gridPoints(level)}
          fill="none"
          stroke="#2a2a4a"
          strokeWidth="1"
        />
      ))}
      {SKILLS.map((_, i) => {
        const angle = (2 * Math.PI * i) / n
        const end = polar(angle, r)
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={end.x} y2={end.y}
            stroke="#2a2a4a"
            strokeWidth="1"
          />
        )
      })}
      <polygon
        points={dataPoints()}
        fill="#6c63ff"
        fillOpacity="0.35"
        stroke="#6c63ff"
        strokeWidth="2"
      />
      {SKILLS.map((skill, i) => {
        const angle = (2 * Math.PI * i) / n
        const labelR = r + 22
        const p = polar(angle, labelR)
        const value = data[skill]
        return (
          <g key={skill}>
            <text
              x={p.x} y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fill={value !== null ? "#94a3b8" : "#3a3a5a"}
            >
              {skill}
            </text>
            {value !== null && (
              <text
                x={p.x} y={p.y + 13}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fill="#6c63ff"
                fontWeight="bold"
              >
                {value}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
```

```typescript
// components/MiniBarChart.tsx
"use client"
import type { DailyHistoryEntry } from "@/lib/daily"

interface Props {
  data: DailyHistoryEntry[]
  height?: number
}

export default function MiniBarChart({ data, height = 80 }: Props) {
  const max = Math.max(...data.map((d) => d.totalPoints), 1)
  const barWidth = 14
  const gap = 4
  const width = data.length * (barWidth + gap)

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height + 20}`} preserveAspectRatio="none">
      {data.map((entry, i) => {
        const barH = Math.max(2, (entry.totalPoints / max) * height)
        const x = i * (barWidth + gap)
        const y = height - barH
        const isToday = i === data.length - 1

        return (
          <g key={entry.date}>
            <rect
              x={x} y={y}
              width={barWidth}
              height={barH}
              rx="3"
              fill={isToday ? "#6c63ff" : entry.totalPoints > 0 ? "#3a3a7a" : "#1a1a3a"}
            />
            {(i === 0 || i === data.length - 1 || i % 7 === 0) && (
              <text
                x={x + barWidth / 2}
                y={height + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#3a3a5a"
              >
                {entry.date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
```

**完了確認:**
- [ ] 2ファイルが作成されている
- [ ] `npx tsc --noEmit` でエラーなし

---

## タスク 5／9: 統計ページ（app/stats/page.tsx）

**対象ファイル:** `app/stats/page.tsx`（新規作成）

```typescript
// app/stats/page.tsx
"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getAllPersonalBests, getTotalPlayCount, type GameId } from "@/lib/scores"
import { getAge } from "@/lib/nickname"
import { calcBrainAge } from "@/lib/brain-age"
import { getRadarData, getBrainType, type CognitiveSkill } from "@/lib/brain-type"
import { getAllTitles } from "@/lib/titles"
import { getDailyHistory } from "@/lib/daily"
import RadarChart from "@/components/RadarChart"
import MiniBarChart from "@/components/MiniBarChart"

const RARITY_COLOR = {
  normal: "border-[#2a2a4a] text-[#64748b]",
  rare: "border-blue-500/40 text-blue-400",
  epic: "border-purple-500/40 text-purple-400",
}

export default function StatsPage() {
  const [bests, setBests] = useState<Partial<Record<GameId, number>>>({})
  const [age, setAge] = useState<number | null>(null)
  const [totalPlays, setTotalPlays] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setBests(getAllPersonalBests())
    setAge(getAge())
    setTotalPlays(getTotalPlayCount())
  }, [])

  if (!mounted) return null

  const brainAge = calcBrainAge(bests)
  const radarData = getRadarData(bests)
  const brainType = getBrainType(radarData)
  const titles = getAllTitles(bests, totalPlays)
  const history = getDailyHistory(14)
  const hasData = Object.keys(bests).length > 0

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-sm text-[#6c63ff] hover:underline">← ホーム</Link>
        <h1 className="text-3xl font-black text-white">🧠 脳の統計</h1>
      </div>

      {!hasData ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-4">🎮</p>
          <p className="text-white font-bold mb-2">まだプレイ履歴がありません</p>
          <p className="text-[#64748b] text-sm mb-6">ゲームをプレイすると統計が表示されます</p>
          <Link href="/" className="btn-primary">ゲームをプレイ</Link>
        </div>
      ) : (
        <div className="space-y-6">

          {/* 脳年齢 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-4">🧬 脳年齢診断</h2>
            {brainAge !== null ? (
              <div className="flex items-end gap-3">
                <span className="text-6xl font-black text-[#6c63ff]">{brainAge}</span>
                <span className="text-[#64748b] text-lg mb-1">歳</span>
                {age !== null && (
                  <span className={`text-sm mb-1 font-bold ${
                    brainAge < age ? "text-green-400" :
                    brainAge > age + 5 ? "text-red-400" : "text-yellow-400"
                  }`}>
                    {brainAge < age
                      ? `実年齢より${age - brainAge}歳若い！`
                      : brainAge > age
                      ? `実年齢より${brainAge - age}歳上`
                      : "実年齢と同等"}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[#64748b] text-sm">2種目以上プレイすると診断できます</p>
            )}
            <p className="text-[#3a3a6a] text-xs mt-2">※5種目のスコアをもとにした推定値です</p>
          </section>

          {/* レーダーチャート + 脳タイプ */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-1">📊 認知能力マップ</h2>
            <p className="text-[#6c63ff] font-bold text-sm mb-4">タイプ: {brainType}</p>
            <div className="flex justify-center">
              <RadarChart data={radarData as Record<CognitiveSkill, number | null>} size={240} />
            </div>
            <p className="text-[#3a3a6a] text-xs mt-2 text-center">
              ※ 20代平均スコアを50として換算
            </p>
          </section>

          {/* 称号 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-1">🏅 称号コレクション</h2>
            <p className="text-[#64748b] text-xs mb-4">累計プレイ: {totalPlays}回</p>
            <div className="grid grid-cols-2 gap-3">
              {titles.map((title) => (
                <div
                  key={title.id}
                  className={`border rounded-xl p-3 transition-all ${
                    title.earned
                      ? RARITY_COLOR[title.rarity]
                      : "border-[#1a1a2e] opacity-30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{title.icon}</span>
                    <span className={`text-sm font-bold ${title.earned ? "text-white" : "text-[#64748b]"}`}>
                      {title.name}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748b]">{title.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 成長グラフ */}
          <section className="card p-6">
            <h2 className="text-lg font-bold text-white mb-1">📈 成長グラフ（直近14日）</h2>
            <p className="text-[#64748b] text-xs mb-4">
              1日の合計ポイント推移（今日の分は紫）
            </p>
            <MiniBarChart data={history} height={80} />
          </section>

        </div>
      )}
    </main>
  )
}
```

**完了確認:**
- [ ] `app/stats/page.tsx` が作成されている
- [ ] `http://localhost:3000/stats` でページが表示されること
- [ ] 称号セクションに「累計プレイ: N回」が表示されること

---

## タスク 6／9: ホーム画面の更新

**対象ファイル:** `app/page.tsx`（更新）

**変更内容:**
1. `getAllRemainingPlays` と `MAX_PLAYS_PER_DAY` をインポート
2. `remainingPlays` の state を追加
3. `useEffect` 内で `getAllRemainingPlays()` を呼ぶ
4. ランキングボタンの隣に「🧠 統計」ボタンを追加
5. 各ゲームカードに残りプレイ数バッジを追加

**変更差分（追記・修正箇所のみ）:**

```typescript
// ① import に追加
import { getAllRemainingPlays, MAX_PLAYS_PER_DAY } from "@/lib/daily"

// ② state に追加（既存の const [age, ...] の隣）
const [remainingPlays, setRemainingPlays] = useState<Partial<Record<GameId, number>>>({})

// ③ useEffect 内に追加（既存の setAge の後）
setRemainingPlays(getAllRemainingPlays())

// ④ ランキングボタン（<Link href="/rankings" ...>）の直前に追加
<Link
  href="/stats"
  className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-bold px-4 py-2 rounded-xl transition-all"
>
  🧠 統計
</Link>

// ⑤ ゲームカードの情報表示部分（ベスト表示の直下）に追加
{(() => {
  const remaining = remainingPlays[game.id] ?? MAX_PLAYS_PER_DAY
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className={`text-xs font-bold ${
        remaining === 0 ? "text-red-400" :
        remaining === 1 ? "text-yellow-400" : "text-green-400"
      }`}>
        {remaining === 0 ? "本日上限" : `残り${remaining}回`}
      </span>
    </div>
  )
})()}
```

IMPORTANT: 既存の JSX 構造をそのまま維持し、差分部分のみ追加すること。

**完了確認:**
- [ ] 各ゲームカードに「残り○回」が表示されること
- [ ] 「🧠 統計」ボタンが表示され `/stats` に遷移すること

---

## タスク 7／9: 全5ゲームにプレイ上限チェックを追加

**対象ファイル:**
- `app/games/calculation/page.tsx`
- `app/games/memory-number/page.tsx`
- `app/games/stroop/page.tsx`
- `app/games/reaction/page.tsx`
- `app/games/pattern/page.tsx`

**共通の変更パターン:**

```typescript
// ① import に追加（全ゲーム共通）
import { recordPlay, getRemainingPlays, MAX_PLAYS_PER_DAY } from "@/lib/daily"

// ② state に追加（全ゲーム共通）
const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY)

// ③ useEffect 内に追加（全ゲーム共通）
setRemaining(getRemainingPlays("GAME_ID"))   // GAME_ID は下表参照

// ④ ready フェーズのスタートボタンを以下に差し替え（全ゲーム共通）
{remaining > 0 ? (
  <button onClick={startGame} className="btn-primary w-full text-lg">
    スタート（残り{remaining}回）
  </button>
) : (
  <div className="text-center space-y-2">
    <p className="text-red-400 font-bold text-sm">
      本日のプレイ上限（{MAX_PLAYS_PER_DAY}回）に達しました
    </p>
    <p className="text-[#64748b] text-xs">明日また挑戦しよう！</p>
  </div>
)}
```

**ゲームごとの `recordPlay` 追加箇所（ここが各ゲームで異なる）:**

### calculation（app/games/calculation/page.tsx）
`endGame` 関数内の `saveScore(...)` の直後に追加:
```typescript
const newBest = saveScore("calculation", currentScore, getNickname() ?? "ゲスト")
recordPlay("calculation", currentScore)   // ← 追加
setRemaining(getRemainingPlays("calculation"))  // ← 追加
```

### memory-number（app/games/memory-number/page.tsx）
⚠️ `saveScore` が **2箇所** にあるため、両方に追加すること。

**1箇所目: タイムアウト時（70行目付近）**
```typescript
setSequence((seq) => {
  const newBest = saveScore("memory-number", level, getNickname() ?? "ゲスト")
  setBest(newBest)
  setIsNewBest(newBest === level)
  return seq
})
recordPlay("memory-number", level)                    // ← setSequence の直後に追加
setRemaining(getRemainingPlays("memory-number"))      // ← 追加
setPhase("result")
```

**2箇所目: 不正解時（103行目付近）**
```typescript
const newBest = saveScore("memory-number", level, getNickname() ?? "ゲスト")
recordPlay("memory-number", level)                    // ← 追加
setRemaining(getRemainingPlays("memory-number"))      // ← 追加
setBest(newBest)
setIsNewBest(newBest === level)
setPhase("result")
```

### stroop（app/games/stroop/page.tsx）
`endGame` 関数内の `saveScore(...)` の直後に追加:
```typescript
const newBest = saveScore("stroop", s, getNickname() ?? "ゲスト")
recordPlay("stroop", s)                    // ← 追加
setRemaining(getRemainingPlays("stroop"))  // ← 追加
```

### reaction（app/games/reaction/page.tsx）
`handleTap` 関数内（全ラウンド完了時）の `saveScore(...)` の直後に追加:
```typescript
const newBest = saveScore("reaction", avg, getNickname() ?? "ゲスト")
recordPlay("reaction", avg)                    // ← 追加
setRemaining(getRemainingPlays("reaction"))    // ← 追加
```

### pattern（app/games/pattern/page.tsx）
⚠️ pattern のスコアは `score` 変数（`level` ではない）。

`handleSubmit` 関数内の `saveScore(...)` の直後に追加:
```typescript
const newBest = saveScore("pattern", score, getNickname() ?? "ゲスト")
recordPlay("pattern", score)                    // ← 追加（score変数を使うこと）
setRemaining(getRemainingPlays("pattern"))      // ← 追加
```

**完了確認:**
- [ ] 5ゲームすべての ready 画面に「残り○回」が表示されること
- [ ] 各ゲームを3回プレイすると「本日のプレイ上限」表示に変わること
- [ ] ランキングへの保存（saveScore）は引き続き正常に動作すること

---

## タスク 8／9: 型チェック・動作確認（中間）

**タスク0〜7完了後に実行:**

```bash
npx tsc --noEmit
npm run dev
```

**確認項目:**
- [ ] 計算ゲームのホームカード説明が「30秒間」になっている
- [ ] 計算ゲームのタイマーが 緑→黄→赤 と3段階で変化する
- [ ] 全ゲームに「残り○回」が表示される
- [ ] 3回プレイで「本日の上限」になる
- [ ] `/stats` ページが表示される
- [ ] 脳年齢・レーダーチャート・称号・グラフが表示される

---

## タスク 9／9: 最終動作確認

**検証コマンド:**
```bash
npx tsc --noEmit
npm run dev
```

**既存コード修正の確認:**
- [ ] ホームの計算ゲームカードに「30秒間」と表示される
- [ ] 計算ゲームのタイマーが 緑(>20s)→黄(>10s)→赤(≤10s) と変化する

**新機能の確認:**
- [ ] 全ゲームカードに「残り3回」が表示される
- [ ] いずれかのゲームを3回プレイ → 「本日上限」表示に変わる
- [ ] 翌日になるとプレイ回数がリセットされる（デバイスの日付変更で確認）
- [ ] 「🧠 統計」ボタンから `/stats` に遷移できる
- [ ] 2種目以上プレイ後に脳年齢が表示される
- [ ] レーダーチャートに5軸が描画される
- [ ] 称号セクションに累計プレイ回数が表示される
- [ ] 10回以上プレイ後に「ストイック」称号が獲得される
- [ ] 成長グラフに棒グラフが表示される
- [ ] `memory-number` を3回（タイムアウト・不正解どちらでも）プレイ → 上限に達すること
- [ ] `reaction` を3回プレイ（5ラウンド完走 × 3回）→ 上限に達すること

## 参照
- 基本設計書: `docs/brain-game-score-features-basic-design.md`
- 調査文書: `research/topics/brain-game-score-features.md`
