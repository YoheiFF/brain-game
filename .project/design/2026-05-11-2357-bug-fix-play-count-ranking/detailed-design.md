---
project_id: "2026-05-11-2357-bug-fix-play-count-ranking"
phase: design
document: detailed-design
created: "2026-05-11"
---

# 詳細設計書: プレイ回数・ランキング・統計 3バグ修正

## 概要

BrainGame アプリで発生している3つのバグを修正する。

| バグ | 根本原因 | 修正方針 |
|------|----------|----------|
| BUG-1: 残りプレイ回数が減らない | useDbSync が dailyPlays を localStorage に書き戻さない | useDbSync に braingame_daily の書き戻し処理を追加 |
| BUG-2: ランキング遷移後に残り回数が復活 | 同上 | 同上 |
| BUG-3: スコアがランキング・統計に未反映 | Server Action が Capacitor CORS ブロックを受ける / stats ページに DB 同期なし | recordScore を API Route に変換 / stats ページに useDbSync 追加 |

---

## 影響範囲（編集・新規ファイル一覧）

| ファイルパス | 変更種別 | 対応バグ |
|------------|----------|----------|
| `app/api/record-score/route.ts` | 新規作成 | BUG-3 |
| `lib/scores.ts` | 編集（行 91-98） | BUG-3 |
| `hooks/useDbSync.ts` | 編集（fetchData 関数内） | BUG-1, BUG-2 |
| `app/stats/page.tsx` | 編集（useDbSync 追加） | BUG-3 補完 |

---

## ファイル別変更詳細

---

### 1. app/api/record-score/route.ts（新規作成）

#### 変更理由

`app/actions/user.ts` の `recordScore` は Next.js Server Action として定義されており、Capacitor Android（`capacitor://localhost` オリジン）からの呼び出し時に CORS ポリシーでブロックされる。`/api/sync` と同じ CORS ヘッダーパターンを持つ API Route に変換することで、Capacitor 環境でも DB へのスコア書き込みを可能にする。

#### 編集前の関連コード

新規ファイルのため「前」は存在しない。参照した既存コード:

```typescript
// app/api/sync/route.ts 行14-27（CORS パターンの参照元）
const ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// app/actions/user.ts 行98-138（移植するロジックの参照元）
export async function recordScore(input: RecordScoreInput): Promise<ActionResult> {
  // ... バリデーション + DB 書き込みロジック
}
```

#### 編集後の期待コード（完全なコードブロック）

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  saveScoreToDb,
  recordDailyPlay,
  updateDailyHistory,
} from "@/lib/db-scores";
import { GAME_IDS, type GameId } from "@/lib/scores";

// ── バリデーション定数（app/actions/user.ts と同一） ───────────────
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCORE_LIMITS: Record<GameId, { min: number; max: number }> = {
  calculation:     { min: 0,  max: 60   },
  "memory-number": { min: 0,  max: 20   },
  stroop:          { min: 0,  max: 60   },
  reaction:        { min: 50, max: 2000 },
  pattern:         { min: 0,  max: 25   },
};

const MAX_PLAYS_PER_DAY = 3;

// ── CORS（/api/sync/route.ts と同一パターン） ────────────────────
const ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// ── Preflight ────────────────────────────────────────────────────
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

// ── POST /api/record-score ───────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON" },
      { status: 400, headers: corsHeaders }
    );
  }

  const { userId, gameId, score } = body as {
    userId?: unknown;
    gameId?: unknown;
    score?: unknown;
  };

  // バリデーション: userId
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    return NextResponse.json(
      { success: false, error: "userId is required" },
      { status: 400, headers: corsHeaders }
    );
  }
  if (!UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { success: false, error: "invalid userId format" },
      { status: 400, headers: corsHeaders }
    );
  }

  // バリデーション: gameId
  if (!gameId || typeof gameId !== "string" || !GAME_IDS.includes(gameId as GameId)) {
    return NextResponse.json(
      { success: false, error: "invalid gameId" },
      { status: 400, headers: corsHeaders }
    );
  }
  const validGameId = gameId as GameId;

  // バリデーション: score
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return NextResponse.json(
      { success: false, error: "score must be a number" },
      { status: 400, headers: corsHeaders }
    );
  }
  const limits = SCORE_LIMITS[validGameId];
  if (score < limits.min || score > limits.max) {
    return NextResponse.json(
      { success: false, error: "score out of range" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // 1日上限チェック（DB 参照）
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const playResult = await db.execute({
      sql: "SELECT play_count FROM daily_plays WHERE user_id = ? AND game_id = ? AND play_date = ?",
      args: [userId, validGameId, today],
    });
    const currentPlayCount = playResult.rows[0]
      ? (playResult.rows[0].play_count as number)
      : 0;
    if (currentPlayCount >= MAX_PLAYS_PER_DAY) {
      return NextResponse.json(
        { success: false, error: "daily play limit exceeded" },
        { status: 429, headers: corsHeaders }
      );
    }

    // DB 書き込み
    await saveScoreToDb(userId, validGameId, score);
    await recordDailyPlay(userId, validGameId, score);
    await updateDailyHistory(userId);

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error("[POST /api/record-score]", e);
    return NextResponse.json(
      { success: false, error: "db error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
```

#### 関数シグネチャ・処理ロジック

- `OPTIONS(request: NextRequest): Promise<NextResponse>` — Preflight 対応。204 + CORS ヘッダーを返す
- `POST(request: NextRequest): Promise<NextResponse>` — スコア記録本体
  1. JSON パース
  2. `userId` バリデーション（存在・UUID 形式）
  3. `gameId` バリデーション（GAME_IDS に含まれるか）
  4. `score` バリデーション（数値型・`SCORE_LIMITS` 範囲内）
  5. DB の `daily_plays` から当日の `play_count` を取得し、`MAX_PLAYS_PER_DAY` 以上なら 429 を返す
  6. `saveScoreToDb` → `recordDailyPlay` → `updateDailyHistory` を直列で実行
  7. `{ success: true }` + CORS ヘッダーを返す
  8. 例外時は `console.error` + `{ success: false, error: "db error" }` + 500

---

### 2. lib/scores.ts（編集）

#### 変更理由

`saveScore()` が `import("@/app/actions/user")` 経由で Server Action を動的 import・呼び出しているが、Capacitor Android では Server Action の POST リクエストが CORS ブロックされる。`/api/record-score` API Route への `fetch` 呼び出しに変更することで CORS 問題を解消する。

#### 編集前の関連コード

```typescript
// lib/scores.ts 行90-99
  // DB に非同期で保存（fire-and-forget）
  if (userId) {
    import("@/app/actions/user").then(({ recordScore }) => {
      recordScore({ userId, gameId, score }).catch((e) => {
        console.warn("[saveScore] recordScore failed:", e);
      });
    }).catch((e) => {
      console.warn("[saveScore] import failed:", e);
    });
  }
```

#### 編集後の期待コード（完全なコードブロック）

`saveScore` 関数全体:

```typescript
/** スコアを保存し、新しいベスト値を返す */
export function saveScore(
  gameId: GameId,
  score: number,
  nickname: string,
  userId?: string // DB 保存用（undefined の場合は localStorage のみ）
): number {
  const { lowerIsBetter } = GAME_META[gameId];

  // 個人ベスト更新
  const personal = loadPersonal();
  const prevBest = personal[gameId] ?? null;
  const newBest =
    prevBest === null
      ? score
      : lowerIsBetter
      ? Math.min(prevBest, score)
      : Math.max(prevBest, score);
  personal[gameId] = newBest;
  savePersonal(personal);

  // ランキングに追加
  const rankings = loadRankings();
  const list = rankings[gameId] ?? [];
  list.push({ nickname, score, date: new Date().toISOString() });
  rankings[gameId] = list;
  saveRankings(rankings);

  // DB に非同期で保存（fire-and-forget）
  if (userId) {
    fetch("/api/record-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, gameId, score }),
    }).catch((e) => {
      console.warn("[saveScore] record-score API failed:", e);
    });
  }

  return newBest;
}
```

#### 関数シグネチャ・処理ロジック

シグネチャは変更なし:
```typescript
export function saveScore(
  gameId: GameId,
  score: number,
  nickname: string,
  userId?: string
): number
```

変更点は行 91-98 の Server Action 呼び出し部分のみ。fetch の戻り値（Promise<Response>）の `.then` は不要（fire-and-forget のため）、`.catch` のみで警告ログを出力する。

---

### 3. hooks/useDbSync.ts（編集）

#### 変更理由

`fetchData()` が `/api/sync` の `SyncResponse.dailyPlays` を受信しているにもかかわらず、`localStorage` の `braingame_daily` を更新していない。そのため、localStorage クリア後・別デバイス・アプリ再起動後に DB 上の当日プレイ数がクライアントに反映されず、残り回数が不正に「残り3回」と表示される。

#### 編集前の関連コード

```typescript
// hooks/useDbSync.ts 行40-65
      // localStorage キャッシュを更新（オフラインフォールバック用）
      localStorage.setItem(
        "braingame_scores",
        JSON.stringify(json.personalBests)
      );
      localStorage.setItem(
        "braingame_rankings",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(json.gameRankings).map(([k, v]) => [
              k,
              v?.map((e) => ({
                nickname: e.nickname,
                score: e.score,
                date: e.date,
              })),
            ])
          )
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error("unknown error"));
      // エラー時は前回の data をそのまま保持
    } finally {
```

#### 編集後の期待コード（完全なコードブロック）

`useDbSync.ts` ファイル全体:

```typescript
"use client";
import { useState, useEffect, useCallback } from "react";
import { getUserId } from "@/lib/nickname";
import type { SyncResponse } from "@/lib/db-types";
import type { GameId } from "@/lib/scores";

interface UseDbSyncOptions {
  interval: number | null; // ポーリング間隔 (ms)。null = 初回フェッチのみ
}

interface UseDbSyncResult {
  data: SyncResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

// lib/daily.ts の today() と同一実装（循環インポート回避）
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const KEY_DAILY = "braingame_daily";

interface DailyRecord {
  date: string;
  plays: Partial<Record<GameId, number>>;
  bestScores: Partial<Record<GameId, number>>;
}

/**
 * /api/sync の dailyPlays を braingame_daily localStorage に書き戻す。
 * - 今日のデータのみを対象とする（日付変わりで自動リセット）
 * - DB のプレイ数 > ローカルのプレイ数 の場合のみ上書き（DB > ローカルの場合のみ採用。同値は上書きしない）
 * - bestScores は DB 値を優先して上書き（DB に記録された正確な値を反映）
 */
function mergeDailyPlaysToStorage(
  dailyPlays: SyncResponse["dailyPlays"]
): void {
  const today = todayString();

  let record: DailyRecord;
  try {
    const raw = localStorage.getItem(KEY_DAILY);
    const parsed: DailyRecord | null = raw ? JSON.parse(raw) : null;
    // 今日のレコードでなければ空で初期化
    record =
      parsed && parsed.date === today
        ? parsed
        : { date: today, plays: {}, bestScores: {} };
  } catch {
    record = { date: today, plays: {}, bestScores: {} };
  }

  let changed = false;

  for (const [gameId, dbEntry] of Object.entries(dailyPlays) as [
    GameId,
    { playCount: number; bestScore: number | null }
  ][]) {
    if (!dbEntry) continue;

    const localPlayCount = record.plays[gameId] ?? 0;

    // DB のプレイ数がローカルより多い場合のみ上書き（より多くプレイ済みの値を採用）
    if (dbEntry.playCount > localPlayCount) {
      record.plays[gameId] = dbEntry.playCount;
      changed = true;
    }

    // bestScore は DB 値を優先（DB に記録された確定値を反映）
    if (dbEntry.bestScore !== null) {
      const localBest = record.bestScores[gameId];
      if (localBest === undefined || dbEntry.bestScore !== localBest) {
        record.bestScores[gameId] = dbEntry.bestScore;
        changed = true;
      }
    }
  }

  if (changed) {
    localStorage.setItem(KEY_DAILY, JSON.stringify(record));
  }
}

export function useDbSync(
  options: UseDbSyncOptions = { interval: 30000 }
): UseDbSyncResult {
  const { interval } = options;
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    // localStorage から userId を取得
    const userId = getUserId();
    if (!userId) return; // 未設定（ニックネーム設定前）は何もしない

    setLoading(true);
    try {
      const res = await window.fetch(
        `/api/sync?userId=${encodeURIComponent(userId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SyncResponse = await res.json();
      setData(json);
      setError(null);

      // localStorage キャッシュを更新（オフラインフォールバック用）
      localStorage.setItem(
        "braingame_scores",
        JSON.stringify(json.personalBests)
      );
      localStorage.setItem(
        "braingame_rankings",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(json.gameRankings).map(([k, v]) => [
              k,
              v?.map((e) => ({
                nickname: e.nickname,
                score: e.score,
                date: e.date,
              })),
            ])
          )
        )
      );

      // braingame_daily の plays・bestScores を DB 値で更新（BUG-1・2 修正）
      if (json.dailyPlays) {
        mergeDailyPlaysToStorage(json.dailyPlays);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error("unknown error"));
      // エラー時は前回の data をそのまま保持
    } finally {
      setLoading(false);
    }
  }, []);

  // マウント直後に即時フェッチ
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ポーリング（interval が null でない場合）
  useEffect(() => {
    if (!interval) return;

    const handleVisibilityChange = () => {
      // 次のインターバルが来るまで待つだけ
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData();
      }
    }, interval);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [interval, fetchData]);

  return { data, loading, error, refetch: fetchData };
}
```

#### 関数シグネチャ・処理ロジック

新規追加関数:

```typescript
function todayString(): string
// lib/daily.ts の today() と同一実装。"YYYY-MM-DD" 形式の文字列を返す。

interface DailyRecord {
  date: string;
  plays: Partial<Record<GameId, number>>;
  bestScores: Partial<Record<GameId, number>>;
}
// lib/daily.ts の DailyRecord と同一構造（循環インポート回避のため再定義）

function mergeDailyPlaysToStorage(
  dailyPlays: SyncResponse["dailyPlays"]
): void
// DB の dailyPlays を braingame_daily localStorage に書き戻す。
// 日付チェック・プレイ数の大きい方を採用・bestScore は DB 値優先。
```

`fetchData` のロジック変更:
- 既存の `braingame_scores` / `braingame_rankings` 書き込みは変更なし
- `json.dailyPlays` が存在する場合に `mergeDailyPlaysToStorage(json.dailyPlays)` を追加呼び出し

`mergeDailyPlaysToStorage` の処理順序:
1. `localStorage.getItem("braingame_daily")` を JSON パース
2. `parsed.date === today` でない場合は `{ date: today, plays: {}, bestScores: {} }` に初期化
3. `dailyPlays` の各エントリを走査:
   - `dbEntry.playCount > localPlayCount` のとき `record.plays[gameId]` を上書き
   - `dbEntry.bestScore !== null` のとき `record.bestScores[gameId]` を上書き
4. `changed` フラグが true の場合のみ `localStorage.setItem("braingame_daily", ...)` を実行（不要な書き込みを回避）

---

### 4. app/stats/page.tsx（編集）

#### 変更理由

統計ページは `useDbSync` を使用しておらず、localStorage のみを参照している。別デバイス・アプリ再起動後に DB の最新データが反映されない（BUG-3 の補完）。`useDbSync({ interval: null })` を追加してマウント時に一度だけ DB から最新データを取得し、localStorage 更新後に画面を再描画する。

#### 編集前の関連コード

```typescript
// app/stats/page.tsx 行1-10（import 部分）
"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getAllPersonalBests, getTotalPlayCount, type GameId } from "@/lib/scores"
import { getAge } from "@/lib/nickname"
import { calcBrainAge } from "@/lib/brain-age"
import { getRadarData, getBrainType, type CognitiveSkill } from "@/lib/brain-type"
import { getAllTitles } from "@/lib/titles"
import { getDailyHistory, getDailyBests } from "@/lib/daily"
import RadarChart from "@/components/RadarChart"
import MiniBarChart from "@/components/MiniBarChart"

// app/stats/page.tsx 行29-35（データ読み込み部分）
  useEffect(() => {
    setMounted(true)
    setBests(getAllPersonalBests())
    setDailyBests(getDailyBests())
    setAge(getAge())
    setTotalPlays(getTotalPlayCount())
  }, [])
```

#### 編集後の期待コード（完全なコードブロック）

変更箇所は import 追加と useDbSync フックの追加のみ。ファイルの変更部分:

```typescript
"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getAllPersonalBests, getTotalPlayCount, type GameId } from "@/lib/scores"
import { getAge } from "@/lib/nickname"
import { calcBrainAge } from "@/lib/brain-age"
import { getRadarData, getBrainType, type CognitiveSkill } from "@/lib/brain-type"
import { getAllTitles } from "@/lib/titles"
import { getDailyHistory, getDailyBests } from "@/lib/daily"
import RadarChart from "@/components/RadarChart"
import MiniBarChart from "@/components/MiniBarChart"
import { useDbSync } from "@/hooks/useDbSync"  // 追加

// ... 型定義・定数は変更なし ...

export default function StatsPage() {
  const [bests, setBests] = useState<Partial<Record<GameId, number>>>({})
  const [dailyBests, setDailyBests] = useState<Partial<Record<GameId, number>>>({})
  const [age, setAge] = useState<number | null>(null)
  const [totalPlays, setTotalPlays] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<Tab>("today")

  // 初回マウント時のみ DB から最新データを取得して localStorage を更新（BUG-3 補完）
  const { data: syncData } = useDbSync({ interval: null })  // 追加

  // 初回マウント時に localStorage から読み込む（既存）
  useEffect(() => {
    setMounted(true)
    setBests(getAllPersonalBests())
    setDailyBests(getDailyBests())
    setAge(getAge())
    setTotalPlays(getTotalPlayCount())
  }, [])

  // DB 同期完了後に画面を再描画（追加）
  useEffect(() => {
    if (!syncData) return
    // useDbSync が localStorage を更新済みのため、再読み込みで最新値を取得する
    setBests(getAllPersonalBests())
    setDailyBests(getDailyBests())
    setTotalPlays(getTotalPlayCount())
  }, [syncData])

  // ... 以降の JSX は変更なし ...
```

#### 関数シグネチャ・処理ロジック

- `useDbSync({ interval: null })` の `data`（`SyncResponse | null`）を `syncData` として受け取る
- `syncData` が更新されたとき（DB 同期完了時）に `setBests` / `setDailyBests` / `setTotalPlays` を再呼び出し
- `useDbSync` の `fetchData` が `braingame_scores` / `braingame_daily` / `braingame_rankings` を localStorage に書き込んだ後に `setData` が呼ばれるため、`getAllPersonalBests()` / `getDailyBests()` / `getTotalPlayCount()` は最新の localStorage 値を返す
- `setAge` は DB 同期の影響を受けないため再呼び出し不要

---

## データ構造定義

### DailyRecord（lib/daily.ts から参照）

```typescript
interface DailyRecord {
  date: string;                                     // "YYYY-MM-DD" 形式（今日の日付）
  plays: Partial<Record<GameId, number>>;            // ゲーム別プレイ回数（当日）
  bestScores: Partial<Record<GameId, number>>;       // ゲーム別当日ベストスコア
  rewardedPlays?: Partial<Record<GameId, number>>;   // 広告視聴で獲得した追加プレイ権利数（省略可）
}
```

localStorage キー: `"braingame_daily"`

### SyncResponse.dailyPlays（lib/db-types.ts から参照）

```typescript
// SyncResponse.dailyPlays の型
Partial<Record<GameId, { playCount: number; bestScore: number | null }>>
```

`getDailyPlaysFromDb(userId)` が返す今日（JST）の DB データ。

### マッピング対応表

| SyncResponse.dailyPlays | DailyRecord |
|------------------------|-------------|
| `dailyPlays[gameId].playCount` | `record.plays[gameId]` |
| `dailyPlays[gameId].bestScore` | `record.bestScores[gameId]` |

### API リクエスト/レスポンス（/api/record-score）

リクエストボディ（JSON）:
```typescript
{
  userId: string;   // UUID v4 形式
  gameId: GameId;   // "calculation" | "memory-number" | "stroop" | "reaction" | "pattern"
  score: number;    // SCORE_LIMITS[gameId].min 以上 max 以下
}
```

レスポンスボディ（JSON）:
```typescript
{ success: true }
// または
{ success: false; error: string }
```

---

## エラー処理方針

### /api/record-score のエラー処理

| エラー種別 | HTTP ステータス | レスポンス |
|-----------|----------------|-----------|
| JSON パース失敗 | 400 | `{ success: false, error: "invalid JSON" }` |
| userId 未指定・空文字 | 400 | `{ success: false, error: "userId is required" }` |
| userId UUID 形式不正 | 400 | `{ success: false, error: "invalid userId format" }` |
| gameId 不正 | 400 | `{ success: false, error: "invalid gameId" }` |
| score 型不正・NaN | 400 | `{ success: false, error: "score must be a number" }` |
| score 範囲外 | 400 | `{ success: false, error: "score out of range" }` |
| 1日上限超過 | 429 | `{ success: false, error: "daily play limit exceeded" }` |
| DB 例外 | 500 | `{ success: false, error: "db error" }` + `console.error` |

全レスポンスに CORS ヘッダーを付与する（エラー時も同様）。

### lib/scores.ts の fetch エラー処理

```typescript
fetch("/api/record-score", { ... }).catch((e) => {
  console.warn("[saveScore] record-score API failed:", e);
});
```

fire-and-forget のため、エラーはコンソール警告のみ。ゲームプレイの体験を阻害しない。

### hooks/useDbSync.ts の mergeDailyPlaysToStorage エラー処理

```typescript
try {
  const raw = localStorage.getItem(KEY_DAILY);
  // ...
} catch {
  record = { date: today, plays: {}, bestScores: {} };
}
```

localStorage の parse 失敗時は空の DailyRecord にフォールバック。DB の値で初期化される。

---

## テスト観点

### 正常系

| # | テスト内容 | 確認方法 |
|---|-----------|---------|
| T-1 | Capacitor Android でゲームプレイ後、ランキングページに自分のスコアが表示される | Android 実機/エミュレータでプレイ後にランキング確認 |
| T-2 | ゲームプレイ後にランキングページへ遷移し、ホームへ戻っても残りプレイ回数が減ったまま | 3回プレイ → ランキング遷移 → ホーム戻り → 残り0回を確認 |
| T-3 | アプリ再起動後（localStorage を手動クリア後）に useDbSync が DB のプレイ数を反映し、残り回数が正しく表示される | DevTools で braingame_daily を削除 → ページリロード → 残り回数確認 |
| T-4 | 統計ページに遷移すると DB の最新データ（個人ベスト・累計プレイ数）が反映される | 別デバイスでプレイ後、このデバイスで統計確認 |
| T-5 | /api/record-score POST が `{ success: true }` を返す | curl またはブラウザコンソールでリクエスト |
| T-6 | /api/record-score OPTIONS が 204 + CORS ヘッダーを返す | curl -X OPTIONS |

### 異常系

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| T-7 | `/api/record-score` に不正 userId を送信 | 400 + `"invalid userId format"` |
| T-8 | `/api/record-score` にスコア範囲外の値を送信 | 400 + `"score out of range"` |
| T-9 | 1日3回プレイ後に再度 `/api/record-score` を呼ぶ | 429 + `"daily play limit exceeded"` |
| T-10 | オフライン状態でゲームプレイ | fetch は失敗するが console.warn のみで、ゲーム結果・localStorage は正常保存 |
| T-11 | `braingame_daily` が壊れた JSON の状態で useDbSync が実行される | 空 DailyRecord で初期化、DB 値で上書きされる |

### 境界値

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| T-12 | DB のプレイ数とローカルのプレイ数が同じ場合 | localStorage を上書きしない（`>` 条件: DB > ローカルの場合のみ上書き。同値は上書きしない） |
| T-13 | DB の bestScore が null の場合 | `bestScores[gameId]` を更新しない |
| T-14 | `dailyPlays` が空オブジェクト `{}` の場合 | localStorage への書き込みが発生しない（`changed` フラグが false のまま） |
| T-15 | 日付が変わった直後（ローカルは前日データ）に useDbSync が実行される | `parsed.date !== today` で空 DailyRecord に初期化、DB の今日データで更新 |
| T-16 | `reaction` ゲームのスコア 50（min 境界値）を送信 | 400 を返さず正常に保存 |
| T-17 | `reaction` ゲームのスコア 2000（max 境界値）を送信 | 400 を返さず正常に保存 |
| T-18 | `reaction` ゲームのスコア 49（min-1）を送信 | 400 + `"score out of range"` |

---

## 完了条件チェックリスト

実装完了の確認項目:

### ファイル作成・変更
- [ ] `app/api/record-score/route.ts` が新規作成されている
- [ ] `lib/scores.ts` の fire-and-forget が `fetch("/api/record-score", ...)` に変更されている
- [ ] `hooks/useDbSync.ts` に `mergeDailyPlaysToStorage` 関数が追加されている
- [ ] `hooks/useDbSync.ts` の `fetchData` 内で `mergeDailyPlaysToStorage` が呼ばれている
- [ ] `app/stats/page.tsx` に `useDbSync({ interval: null })` が追加されている
- [ ] `app/stats/page.tsx` に `syncData` 依存の `useEffect` が追加されている

### CORS 設定
- [ ] `/api/record-score` の `ALLOWED_ORIGINS` が `["capacitor://localhost", "http://localhost"]` である
- [ ] `/api/record-score` の `OPTIONS` ハンドラが 204 を返す
- [ ] `/api/record-score` の POST レスポンスに CORS ヘッダーが含まれる（エラー時も含む）
- [ ] `Access-Control-Allow-Methods` が `"POST, OPTIONS"` である（`"GET"` ではない）

### バリデーション
- [ ] userId の UUID 形式チェックが実装されている
- [ ] gameId の GAME_IDS チェックが実装されている
- [ ] score の SCORE_LIMITS 範囲チェックが実装されている
- [ ] 1日上限チェックが 429 を返す

### データ整合性
- [ ] `mergeDailyPlaysToStorage` が今日の日付のみを対象にしている
- [ ] `mergeDailyPlaysToStorage` が DB のプレイ数 > ローカルのプレイ数 の場合のみ上書きする
- [ ] `mergeDailyPlaysToStorage` が変更がない場合は localStorage.setItem を呼ばない
- [ ] `braingame_scores` / `braingame_rankings` の既存書き込みロジックが維持されている

### 型安全性
- [ ] `hooks/useDbSync.ts` の `DailyRecord` 型が `lib/daily.ts` の同名インターフェースと構造一致している
- [ ] `GameId` が `@/lib/scores` から import されている

### 動作確認（TypeScript コンパイル）
- [ ] `npx tsc --noEmit` でエラーが出ない
