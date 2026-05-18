---
project_id: "2026-05-11-2357-bug-fix-play-count-ranking"
phase: design
document: basic-design
created: "2026-05-11"
---

# 基本設計書: プレイ回数・ランキング・統計 3バグ修正

## 1. 修正アーキテクチャ概要

### 変更前のスコア保存フロー

```
ゲーム終了
  └── saveScore() [lib/scores.ts]
        ├── localStorage "braingame_scores" 更新
        ├── localStorage "braingame_rankings" 更新
        └── import("@/app/actions/user").then({ recordScore }) [Server Action]
              └── ❌ Capacitor Android では CORS ブロック
```

### 変更後のスコア保存フロー

```
ゲーム終了
  └── saveScore() [lib/scores.ts]
        ├── localStorage "braingame_scores" 更新
        ├── localStorage "braingame_rankings" 更新
        └── fetch("/api/record-score", { method: "POST", body: JSON })
              └── ✅ CORS ヘッダー付き API Route
                    └── recordScore ロジック（DB 書き込み）
```

### 変更前の useDbSync フロー

```
ランキングページ mount
  └── useDbSync → fetchData()
        ├── GET /api/sync → SyncResponse
        ├── localStorage "braingame_scores" 書き込み ✅
        ├── localStorage "braingame_rankings" 書き込み ✅
        └── ❌ localStorage "braingame_daily" は書き込まない
```

### 変更後の useDbSync フロー

```
ランキング/統計ページ mount
  └── useDbSync → fetchData()
        ├── GET /api/sync → SyncResponse
        ├── localStorage "braingame_scores" 書き込み ✅
        ├── localStorage "braingame_rankings" 書き込み ✅
        └── localStorage "braingame_daily" の plays・bestScores を DB 値で更新 ✅
              └── 条件: 今日の日付かつ DB のプレイ数 >= ローカルのプレイ数
```

## 2. 修正対象ファイル一覧

| # | ファイル | 変更種別 | 対応要件 |
|---|----------|----------|----------|
| 1 | `app/api/record-score/route.ts` | **新規作成** | REQ-1 |
| 2 | `lib/scores.ts` | 編集 | REQ-1 |
| 3 | `hooks/useDbSync.ts` | 編集 | REQ-2 |
| 4 | `app/stats/page.tsx` | 編集 | REQ-3 |

## 3. 各修正の概要

### 3.1 新規: app/api/record-score/route.ts

`app/actions/user.ts` の `recordScore` 関数のロジックをそのまま引き継ぐ API Route。

- `OPTIONS` ハンドラ: Preflight に対して CORS ヘッダーを返す
- `POST` ハンドラ:
  - リクエストボディから `{ userId, gameId, score }` を取得
  - `app/actions/user.ts` と同一のバリデーション（UUID チェック・gameId チェック・スコア範囲チェック）を適用
  - DB の daily_plays による 1日上限チェック
  - `saveScoreToDb` → `recordDailyPlay` → `updateDailyHistory` を順に呼び出す
  - `revalidatePath("/rankings")` は Server Action でのみ動作するため除外（代替なし）
  - CORS ヘッダー: `getCorsHeaders()` を `/api/sync/route.ts` と同一パターンで実装
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type`

### 3.2 編集: lib/scores.ts

`saveScore()` 関数の DB 書き込み部分を Server Action import から API Route fetch に変更。

変更箇所（行 91-98）:
```typescript
// 変更前: Server Action (CORS なし)
import("@/app/actions/user").then(({ recordScore }) => {
  recordScore({ userId, gameId, score }).catch(...)
})

// 変更後: API Route (CORS 対応)
fetch("/api/record-score", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId, gameId, score }),
}).catch(...)
```

fire-and-forget パターン（エラーは console.warn のみ）は維持する。

### 3.3 編集: hooks/useDbSync.ts

`fetchData()` 内の localStorage 書き込み処理に `braingame_daily` の更新を追加。

追加処理の概要:
1. `/api/sync` レスポンスの `dailyPlays` を取得（`Partial<Record<GameId, { playCount, bestScore }>>` 型）
2. localStorage の `braingame_daily` を読み込む（`{ date, plays, bestScores }` 型）
3. 日付チェック: `braingame_daily.date` が今日でない場合は空の DailyRecord で初期化
4. 各 gameId について DB の `playCount` がローカルの `plays[gameId]` より大きければ上書き
5. 各 gameId について DB の `bestScore` が存在すれば `bestScores[gameId]` を DB 値で更新（DB を正として採用）
6. 更新した DailyRecord を localStorage に保存

`today()` ヘルパー関数は `lib/daily.ts` と同じ実装を hooks 内にインライン定義する（循環インポート回避）。

### 3.4 編集: app/stats/page.tsx

`useDbSync({ interval: null })` を追加し、マウント時に一度だけ DB 同期を行う。

- 既存の `useEffect([], [])` によるローカル読み込みは維持
- `useDbSync` の `data` が更新されたら `setBests` / `setDailyBests` / `setTotalPlays` を再呼び出し
  - ただし `useDbSync` は localStorage を既に更新しているため、単純に `getAllPersonalBests()` 等を再呼び出しすれば良い

## 4. CORS 設計

### ALLOWED_ORIGINS

`/api/sync/route.ts` と同一の定数を `/api/record-score/route.ts` にも定義する:

```typescript
const ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
];
```

`getCorsHeaders()` は `/api/sync` と完全に同じシグネチャ・ロジックで実装する（コピー）。

### メソッド設定

- `/api/sync`: `GET, OPTIONS`
- `/api/record-score`: `POST, OPTIONS`（差異はメソッドのみ）

## 5. バリデーション設計

`/api/record-score` の入力バリデーションは `app/actions/user.ts` の `recordScore` と同一:

| チェック項目 | 条件 | エラーメッセージ |
|-------------|------|-----------------|
| userId 存在 | 非空文字列 | "userId is required" |
| userId 形式 | UUID 正規表現 | "invalid userId format" |
| gameId 妥当性 | GAME_IDS に含まれる | "invalid gameId" |
| スコア範囲 | SCORE_LIMITS[gameId] 内 | "score out of range" |
| 1日上限 | daily_plays カウント < 3 | "daily play limit exceeded" |

レスポンスは `{ success: boolean; error?: string }` 形式で統一。

## 6. エラー処理設計

| 発生箇所 | エラー種別 | 対処 |
|----------|------------|------|
| `fetch("/api/record-score")` ネットワークエラー | オフライン等 | `console.warn` のみ、ゲームには影響なし |
| API Route: DB エラー | 内部エラー | `{ success: false, error: "db error" }` + `console.error` |
| API Route: バリデーションエラー | クライアントミス | `{ success: false, error: <詳細> }` + HTTP 400 |
| `useDbSync` fetchData エラー | ネットワーク等 | 既存の `setError` + 前回データ保持（変更なし） |
| `useDbSync` localStorage parse エラー | 破損データ | try-catch で空 DailyRecord にフォールバック |

## 7. データフロー図（修正後）

```
[ゲームプレイ終了]
    |
    v
saveScore(gameId, score, nickname, userId)
    |-- localStorage "braingame_scores" 更新 (即時)
    |-- localStorage "braingame_rankings" 更新 (即時)
    |-- fetch POST /api/record-score (非同期・fire-and-forget)
            |
            v
        [/api/record-score]
            |-- CORS チェック
            |-- バリデーション
            |-- DB daily_plays チェック (上限)
            |-- saveScoreToDb
            |-- recordDailyPlay
            |-- updateDailyHistory
            |-- { success: true }

[ランキング/統計ページ遷移]
    |
    v
useDbSync({ interval: 30000 or null })
    |-- GET /api/sync?userId=...
    |-- SyncResponse 受信
    |-- localStorage "braingame_scores" 更新
    |-- localStorage "braingame_rankings" 更新
    |-- localStorage "braingame_daily" 更新 (NEW)
            |-- plays[gameId] = max(local, db)
            |-- bestScores[gameId] = db 値 (db を正として採用)
```
