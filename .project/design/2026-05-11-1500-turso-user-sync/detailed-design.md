---
project_id: "2026-05-11-1500-turso-user-sync"
phase: design
doc_type: detailed-design
created: "2026-05-11"
---

# 詳細設計書: Turso DB 統合・リアルタイム同期

## 0. 前提・パッケージ・環境変数

### インストールするパッケージ

```bash
npm install @libsql/client server-only
```

- `@libsql/client`: Turso 公式ドライバ。`@libsql/client/web` サブパスを使用（Vercel Serverless 対応）
- `server-only`: lib/db.ts をクライアントバンドルから除外するための Next.js 公式パターン

### 環境変数（.env.local）

```
TURSO_DATABASE_URL=libsql://<db-name>-<org>.turso.io
TURSO_AUTH_TOKEN=<token>
```

### 共通型定義（各ファイルで使用）

```typescript
// --- 型定義 (lib/db-types.ts として切り出しても可) ---

// ユーザー
export interface User {
  id: string;           // UUID
  nickname: string;
  age: number | null;
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

// スコアエントリ（DB から返る形式）
export interface DbScoreEntry {
  userId: string;
  nickname: string;
  gameId: GameId;
  score: number;
  createdAt: string;    // ISO 8601
}

// デイリープレイ
export interface DailyPlay {
  userId: string;
  gameId: GameId;
  playDate: string;     // "YYYY-MM-DD"
  playCount: number;
  bestScore: number | null;
}

// デイリー履歴
export interface DailyHistoryRecord {
  userId: string;
  playDate: string;     // "YYYY-MM-DD"
  totalPoints: number;
  gamesPlayed: number;
}

// /api/sync レスポンス全体
export interface SyncResponse {
  personalBests: Partial<Record<GameId, number>>;
  gameRankings: Partial<Record<GameId, RankEntry[]>>;
  overallRanking: OverallEntry[];
  dailyPlays: Partial<Record<GameId, { playCount: number; bestScore: number | null }>>;
  dailyHistory: DailyHistoryEntry[];
  myGameRanks: Partial<Record<GameId, RankEntry>>;   // ユーザー個別のゲーム別順位
  myOverallRank: OverallEntry | null;                 // ユーザー個別の総合順位
}
```

---

## 1. lib/db.ts — Turso クライアント初期化

### 目的
Turso への接続クライアントを生成し、全 DB アクセスファイルに提供するシングルトン。

### 依存
- `server-only` パッケージ
- `@libsql/client/web`（`@libsql/client` ではなく `/web` サブパスを使用すること）

### 完全な実装仕様

```typescript
// lib/db.ts
import "server-only";
import { createClient, type Client } from "@libsql/client/web";

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "[BrainGame] TURSO_DATABASE_URL または TURSO_AUTH_TOKEN が未設定です。" +
      ".env.local を確認してください。"
    );
  }

  client = createClient({ url, authToken });
  return client;
}
```

### 処理フロー
1. `import "server-only"` によりクライアントバンドルに含まれた場合はビルドエラーになる
2. モジュールスコープの `client` 変数でシングルトンを実現（Vercel Serverless は短命なため実質毎回生成）
3. 環境変数未設定時は起動時にエラーをスロー（本番デプロイミスを早期検出）
4. 他の DB ファイルは `import { getDb } from "@/lib/db"` で取得する

### エラーハンドリング
- 環境変数未設定: `Error` をスロー（起動時エラー。呼び出し元でキャッチ不要）
- 接続失敗: `client.execute()` 呼び出し時にスローされる。各 CRUD 関数でキャッチ

---

## 2. lib/db-user.ts — ユーザー CRUD

### 目的
`users` テーブルへの作成・取得・更新操作を提供する。

### 依存
- `@/lib/db`（getDb）
- `server-only`（直接インポートはしない。db.ts 経由で保護される）

### 型

```typescript
import type { User } from "@/lib/db-types"; // または scores.ts の型を流用
```

### 関数仕様

#### `getUser(userId: string): Promise<User | null>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID 文字列 |
| 戻り値 | `User` オブジェクト or `null`（存在しない場合） |
| SQL | `SELECT id, nickname, age, created_at, updated_at FROM users WHERE id = ?` |

処理フロー:
1. `getDb().execute({ sql, args: [userId] })` を呼ぶ
2. `result.rows` が空配列なら `null` を返す
3. `result.rows[0]` を `User` 型にマッピングして返す
   - `row.id as string`、`row.nickname as string`、`row.age as number | null`、`row.created_at as string`、`row.updated_at as string`
4. 例外は呼び出し元に伝播させる

#### `getOrCreateUser(user: { id: string; nickname: string; age: number | null }): Promise<User>`

| 項目 | 内容 |
|---|---|
| 引数 | `user.id`: UUID、`user.nickname`: ニックネーム、`user.age`: 年齢（null 可） |
| 戻り値 | 作成または既存の `User` オブジェクト |
| SQL | INSERT OR IGNORE + SELECT |

処理フロー:
1. `const now = new Date().toISOString()` で現在時刻を生成
2. SQL: `INSERT OR IGNORE INTO users (id, nickname, age, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
   - args: `[user.id, user.nickname, user.age, now, now]`
3. `getUser(user.id)` を呼んで返す（INSERT されたかどうかに関わらず）
4. 例外は呼び出し元に伝播させる

#### `updateUser(userId: string, updates: { nickname?: string; age?: number | null }): Promise<void>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID、`updates`: 更新フィールド（部分更新可） |
| 戻り値 | `void` |

処理フロー:
1. `updates.nickname` が指定されている場合: `UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?`
2. `updates.age` が指定されている場合（`undefined` でない）: `UPDATE users SET age = ?, updated_at = ? WHERE id = ?`
3. nickname と age の両方が指定されている場合は 1 クエリで更新:
   `UPDATE users SET nickname = ?, age = ?, updated_at = ? WHERE id = ?`
4. `updates` が空オブジェクトの場合は何もせず return する
5. 例外は呼び出し元に伝播させる

---

## 3. lib/db-scores.ts — スコア CRUD

### 目的
`scores`・`daily_plays`・`daily_history` テーブルへのアクセスを提供する。

### 依存
- `@/lib/db`（getDb）
- `@/lib/scores`（GameId, GAME_META, GAME_IDS, RankEntry, OverallEntry）
- `@/lib/game-points`（calcGamePoints）

### ポイント計算の参照値（db-scores.ts 内に定義）

```typescript
// game-points.ts と同じ参照値（循環インポート回避）
const POINTS_REF: Record<GameId, number> = {
  calculation: 17,
  "memory-number": 8,
  stroop: 23,
  reaction: 220,
  pattern: 18,
};
```

### 関数仕様

#### `saveScoreToDb(userId: string, gameId: GameId, score: number): Promise<void>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID、`gameId`: ゲーム種別、`score`: スコア値 |
| 戻り値 | `void` |

処理フロー:
1. `const now = new Date().toISOString()`
2. SQL: `INSERT INTO scores (user_id, game_id, score, created_at) VALUES (?, ?, ?, ?)`
   - args: `[userId, gameId, score, now]`
3. 例外は呼び出し元に伝播させる

#### `getPersonalBestsFromDb(userId: string): Promise<Partial<Record<GameId, number>>>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID |
| 戻り値 | ゲームIDをキー、ベストスコアを値とするオブジェクト |

処理フロー:
1. SQL:
   ```sql
   SELECT game_id, MAX(score) as best_score
   FROM scores
   WHERE user_id = ?
   GROUP BY game_id
   ```
   - reaction（lowerIsBetter）は MIN(score)。ただし DB に lowerIsBetter の知識を持たせない
   - 実装: `SELECT game_id, MAX(score) as max_s, MIN(score) as min_s FROM scores WHERE user_id = ? GROUP BY game_id`
   - 呼び出し元で `GAME_META[gameId].lowerIsBetter` を参照して `min_s` か `max_s` を選択
2. 結果を `Partial<Record<GameId, number>>` にマッピングして返す
3. 例外は呼び出し元に伝播させる

#### `getRankingsFromDb(): Promise<{ gameRankings: Partial<Record<GameId, RankEntry[]>>; overallRanking: OverallEntry[] }>`

| 項目 | 内容 |
|---|---|
| 引数 | なし |
| 戻り値 | ゲーム別ランキング + 総合ランキング |

処理フロー:
1. SQL（ゲーム別ベストスコアを user_id でグループ化）:
   ```sql
   SELECT s.user_id, u.nickname, s.game_id,
          MAX(s.score) as max_score,
          MIN(s.score) as min_score,
          MAX(s.created_at) as latest_date
   FROM scores s
   JOIN users u ON s.user_id = u.id
   GROUP BY s.user_id, s.game_id
   ```
2. 取得した rows を JavaScript 側で処理:
   a. ゲームごとに `GAME_META[gameId].lowerIsBetter` を参照して `max_score` か `min_score` を選択
   b. ゲームごとに score 順にソート（lowerIsBetter なら昇順、そうでなければ降順）
   c. 上位 20 件を `RankEntry[]`（`{ rank, nickname, score, date }`）に変換
3. 総合ランキング計算:
   a. user_id ごとにゲーム別ベストスコアを集約
   b. `POINTS_REF` を使って各ゲームのポイントを計算:
      `ratio = lowerIsBetter ? ref / score : score / ref`
      `points = Math.min(20, Math.max(1, Math.round(ratio * 10)))`
   c. ゲーム別ポイントを合算して `totalPoints`（最大 100）
   d. `gamesPlayed` を集計
   e. `totalPoints` 降順・`gamesPlayed` 降順でソートして rank を付与
4. `{ gameRankings, overallRanking }` を返す
5. 例外は呼び出し元に伝播させる

#### `recordDailyPlay(userId: string, gameId: GameId, score: number): Promise<{ playCount: number; bestScore: number }>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID、`gameId`: ゲーム種別、`score`: スコア値 |
| 戻り値 | 更新後のプレイ回数とベストスコア |

処理フロー:
1. `const today = new Date().toISOString().slice(0, 10)` で "YYYY-MM-DD" を生成
2. 既存レコードを取得:
   ```sql
   SELECT play_count, best_score FROM daily_plays
   WHERE user_id = ? AND game_id = ? AND play_date = ?
   ```
3. 現在の `play_count` と `best_score` を計算:
   - `newPlayCount = (existing?.play_count ?? 0) + 1`
   - `prevBest = existing?.best_score ?? null`
   - `lowerIsBetter = GAME_META[gameId].lowerIsBetter`
   - `newBest = prevBest === null ? score : lowerIsBetter ? Math.min(prevBest, score) : Math.max(prevBest, score)`
4. UPSERT:
   ```sql
   INSERT INTO daily_plays (user_id, game_id, play_date, play_count, best_score)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT (user_id, game_id, play_date)
   DO UPDATE SET play_count = ?, best_score = ?
   ```
   - args: `[userId, gameId, today, newPlayCount, newBest, newPlayCount, newBest]`
5. `{ playCount: newPlayCount, bestScore: newBest }` を返す
6. 例外は呼び出し元に伝播させる

#### `updateDailyHistory(userId: string): Promise<void>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID |
| 戻り値 | `void` |
| 呼び出し元 | recordDailyPlay の後に recordScore Server Action から呼ぶ |

処理フロー:
1. `const today = new Date().toISOString().slice(0, 10)`
2. 当日の全ゲームの `daily_plays` を取得:
   ```sql
   SELECT game_id, best_score FROM daily_plays
   WHERE user_id = ? AND play_date = ?
   ```
3. 取得した rows からポイント計算:
   - `GAME_META[gameId].lowerIsBetter` を参照
   - `ratio = lowerIsBetter ? POINTS_REF[gameId] / best_score : best_score / POINTS_REF[gameId]`
   - `points = Math.min(100, Math.round(ratio * 50))`（lib/daily.ts の `updateDailyHistory` と同ロジック）
   - `totalPoints` と `gamesPlayed` を集計
4. UPSERT:
   ```sql
   INSERT INTO daily_history (user_id, play_date, total_points, games_played)
   VALUES (?, ?, ?, ?)
   ON CONFLICT (user_id, play_date)
   DO UPDATE SET total_points = ?, games_played = ?
   ```
5. 例外は呼び出し元に伝播させる

#### `getDailyPlaysFromDb(userId: string): Promise<Partial<Record<GameId, { playCount: number; bestScore: number | null }>>>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID |
| 戻り値 | 当日のゲーム別プレイ回数・ベストスコア |

処理フロー:
1. `const today = new Date().toISOString().slice(0, 10)`
2. SQL:
   ```sql
   SELECT game_id, play_count, best_score FROM daily_plays
   WHERE user_id = ? AND play_date = ?
   ```
3. 結果を `Partial<Record<GameId, { playCount, bestScore }>>` にマッピングして返す
4. 例外は呼び出し元に伝播させる

#### `getDailyHistoryFromDb(userId: string, days: number): Promise<DailyHistoryEntry[]>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID、`days`: 取得日数（例: 14） |
| 戻り値 | 過去 N 日分の履歴（古い順）。プレイなしの日は `{ totalPoints: 0, gamesPlayed: 0 }` |

処理フロー:
1. SQL:
   ```sql
   SELECT play_date, total_points, games_played FROM daily_history
   WHERE user_id = ?
   ORDER BY play_date DESC
   LIMIT ?
   ```
2. 取得した rows を日付降順から昇順に反転
3. `DailyHistoryEntry[]`（`{ date: string, totalPoints: number, gamesPlayed: number }`）に変換して返す
4. 例外は呼び出し元に伝播させる

#### `getUserRanksFromDb(userId: string): Promise<{ gameRanks: Partial<Record<GameId, RankEntry>>; overallRank: OverallEntry | null }>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID |
| 戻り値 | ゲーム別個人順位 + 総合個人順位 |

処理フロー:
1. `getRankingsFromDb()` を呼ばずに、独立した DB クエリを直接実行する:
   ```sql
   SELECT s.user_id, u.nickname, s.game_id,
          MAX(s.score) as max_score,
          MIN(s.score) as min_score,
          MAX(s.created_at) as latest_date
   FROM scores s
   JOIN users u ON s.user_id = u.id
   GROUP BY s.user_id, s.game_id
   ```
   （`getRankingsFromDb()` と同一 SQL。`/api/sync` では `Promise.all` で並列実行するため、結果共有ではなく独立クエリとして実装している）
2. 取得した rows を JavaScript 側で処理:
   - `gameMap`: `gameId` ごとに `{ userId, nickname, score, date }` の配列を構築
   - `userBests`: `userId` ごとにゲーム別ベストスコアを集約
   - `lowerIsBetter` に応じて `max_score` または `min_score` を選択
3. ゲーム別順位の算出:
   - 各 `gameId` について `gameMap[gameId]` を score 順にソート（lowerIsBetter なら昇順、そうでなければ降順）
   - `sorted.findIndex((e) => e.userId === userId)` で自分のインデックスを特定する
   - `idx !== -1` の場合: `{ rank: idx + 1, nickname, score, date }` を `gameRanks[gameId]` にセットする
   - 該当なしの場合は `gameRanks[gameId]` を未定義のままにする（`Partial` のため省略可）
4. 総合順位の算出:
   - `userBests` の全エントリについて `POINTS_REF` を使ってポイントを計算し `overallEntries` を構築する
   - `totalPoints` 降順・`gamesPlayed` 降順でソートして `rank` を付与する
   - `sortedOverall.find((e) => e.userId === userId)` で自分のエントリを取得する
   - 該当なしの場合は `overallRank: null` を返す
5. `{ gameRanks, overallRank }` を返す
6. 例外は呼び出し元に伝播させる

> 注意: `getUserRanksFromDb()` は `getRankingsFromDb()` とは独立した DB クエリを発行する。これにより `/api/sync` が `Promise.all` で両関数を並列実行できる。ただし内部ロジック（SQL・ポイント計算式）は `getRankingsFromDb()` と同一のため、将来的にどちらかを変更した場合は両関数を同期して修正すること。

---

## 4. app/api/sync/route.ts — GET エンドポイント

### 目的
ポーリング用の一括データ取得エンドポイント。ユーザー個人データ + グローバルランキングを返す。

### ファイル先頭

```typescript
import { NextRequest, NextResponse } from "next/server";
```

### 関数仕様

#### `export async function GET(request: NextRequest): Promise<NextResponse>`

処理フロー:
1. `const userId = request.nextUrl.searchParams.get("userId")`
2. `userId` が null または空文字列の場合: `NextResponse.json({ error: "userId is required" }, { status: 400 })` を返す
3. userId が UUID 形式かどうかの簡易バリデーション（正規表現でチェック）:
   - `const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
   - 不正な場合: `{ status: 400 }` を返す
4. `try { ... } catch (e) { ... }` で全体をラップ
5. 並列フェッチ（Promise.all）:
   ```typescript
   const [personalBests, rankings, myRanks, dailyPlays, dailyHistory] = await Promise.all([
     getPersonalBestsFromDb(userId),
     getRankingsFromDb(),
     getUserRanksFromDb(userId),
     getDailyPlaysFromDb(userId),
     getDailyHistoryFromDb(userId, 14),
   ]);
   ```
6. レスポンス構築:
   ```typescript
   const body: SyncResponse = {
     personalBests,
     gameRankings: rankings.gameRankings,
     overallRanking: rankings.overallRanking,
     myGameRanks: myRanks.gameRanks,
     myOverallRank: myRanks.overallRank,
     dailyPlays,
     dailyHistory,
   };
   ```
7. `NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })` を返す
8. catch: `NextResponse.json({ error: "Internal Server Error" }, { status: 500 })` を返す

---

## 5. app/actions/user.ts — Server Actions

### ファイル先頭
```typescript
"use server";
import { revalidatePath } from "next/cache";
```

### 型

```typescript
export interface UpsertUserInput {
  id: string;       // UUID（クライアントが生成）
  nickname: string;
  age: number | null;
}

export interface RecordScoreInput {
  userId: string;
  gameId: GameId;
  score: number;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}
```

### 関数仕様

#### `export async function upsertUser(input: UpsertUserInput): Promise<ActionResult>`

処理フロー:
1. バリデーション:
   - `input.nickname.trim().length === 0` → `{ success: false, error: "nickname is empty" }`
   - `input.nickname.trim().length > 12` → `{ success: false, error: "nickname too long" }`
   - `input.age !== null && (input.age < 1 || input.age > 120)` → `{ success: false, error: "invalid age" }`
2. `try { await getOrCreateUser({ id: input.id, nickname: input.nickname.trim(), age: input.age }) }`
   - 既に存在する場合（ニックネーム変更）は `updateUser(input.id, { nickname: input.nickname.trim(), age: input.age })` を追加で呼ぶ
   - 具体的には: getOrCreateUser の後に updateUser を必ず呼ぶ（重複 INSERT は IGNORE するため）
3. 成功: `{ success: true }` を返す
4. catch: `console.error("[upsertUser]", e)` → `{ success: false, error: "db error" }` を返す
   - エラーはスローしない（呼び出し元でサイレント処理）

#### `export async function recordScore(input: RecordScoreInput): Promise<ActionResult>`

処理フロー:
1. バリデーション:
   - `input.userId` が空文字列 → `{ success: false, error: "userId is required" }`
   - `input.score < 0` → `{ success: false, error: "invalid score" }`
   - `GAME_IDS.includes(input.gameId)` でなければ → `{ success: false, error: "invalid gameId" }`
2. `try { ... } catch { ... }` で全体をラップ
3. 以下を順番に実行:
   ```
   a. saveScoreToDb(input.userId, input.gameId, input.score)
   b. recordDailyPlay(input.userId, input.gameId, input.score)
   c. updateDailyHistory(input.userId)
   d. revalidatePath("/rankings")
   ```
4. 成功: `{ success: true }` を返す
5. catch: `console.error("[recordScore]", e)` → `{ success: false, error: "db error" }` を返す

> **廃止予定（Deprecated）**: この `recordScore` Server Action は `2026-05-11-2357-bug-fix-play-count-ranking` で作成された `/api/record-score` API Route への移行により、実際の呼び出しルートが切り替わっている（`lib/scores.ts` の `saveScore()` は `fetch("/api/record-score", ...)` を呼ぶ）。
> 現在この Server Action は直接呼び出されていない。
> `app/actions/user.ts` の `recordScore` に含まれる `MAX_PLAYS_PER_DAY = 3` 制限は実質的に機能していない（`/api/record-score` では `MAX_PLAYS_PER_DAY = 6`）。
> 将来的には `app/actions/user.ts` から `recordScore` を削除し、`/api/record-score` に統一することを推奨する。

---

## 6. scripts/migrate-schema.ts — DB スキーマ作成スクリプト

### 目的
初回セットアップ時に Turso DB にテーブルを作成する CLI スクリプト。
`npx ts-node scripts/migrate-schema.ts` で実行。

### 実装仕様

```typescript
// scripts/migrate-schema.ts
import { createClient } from "@libsql/client/web";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("環境変数 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が未設定です");
  process.exit(1);
}

const db = createClient({ url, authToken });

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    age INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_game_id ON scores(game_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id)`,
  `CREATE TABLE IF NOT EXISTS daily_plays (
    user_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    play_date TEXT NOT NULL,
    play_count INTEGER DEFAULT 0,
    best_score REAL,
    PRIMARY KEY (user_id, game_id, play_date)
  )`,
  `CREATE TABLE IF NOT EXISTS daily_history (
    user_id TEXT NOT NULL,
    play_date TEXT NOT NULL,
    total_points INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, play_date)
  )`,
];

async function migrate() {
  for (const sql of SCHEMA_STATEMENTS) {
    await db.execute(sql);
    console.log("OK:", sql.slice(0, 50));
  }
  console.log("マイグレーション完了");
}

migrate().catch((e) => {
  console.error("マイグレーション失敗:", e);
  process.exit(1);
});
```

処理フロー:
1. `.env.local` から環境変数を読み込む（dotenv を使用）
2. `SCHEMA_STATEMENTS` の配列を順番に実行する（`for ... of` ループ）
3. 全て `IF NOT EXISTS` を使用するため、べき等（何度実行しても安全）
4. エラー時は終了コード 1 で終了

---

## 7. lib/nickname.ts — userId 管理を追加

### 変更内容
既存の `getNickname` / `setNickname` / `getAge` / `setAge` は変更しない。
`getUserId` / `setUserId` を追加する。

### 追加する定数と関数

```typescript
const KEY_USER_ID = "braingame_user_id";

export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_USER_ID);
}

export function setUserId(id: string): void {
  localStorage.setItem(KEY_USER_ID, id);
}

export function getOrInitUserId(): string {
  const existing = getUserId();
  if (existing) return existing;
  const newId = crypto.randomUUID();
  setUserId(newId);
  return newId;
}
```

#### `getOrInitUserId(): string`

処理フロー:
1. `getUserId()` を呼ぶ
2. 既存の UUID が存在する場合: そのまま返す
3. 存在しない場合:
   a. `crypto.randomUUID()` で新しい UUID を生成
   b. `setUserId(newId)` で localStorage に保存
   c. 生成した UUID を返す
4. この関数はクライアントサイドのみで呼ぶ（`window === "undefined"` チェック不要。呼び出し元が useEffect 内であることを保証する）

---

## 8. lib/scores.ts — DB 優先・localStorage フォールバックへの変更

### 変更方針
- 既存の型定義（`GameId`, `ScoreEntry`, `RankEntry`, `OverallEntry`, `GAME_META`, `GAME_IDS`）は変更しない
- `saveScore` / `getPersonalBest` / `getAllPersonalBests` / `getGameRanking` / `getOverallRanking` / `getTotalPlayCount` の公開 API シグネチャは変更しない
- 内部実装のみ変更する

### `saveScore` の変更（引数追加）

```typescript
// 変更前
export function saveScore(gameId: GameId, score: number, nickname: string): number

// 変更後（userId を追加）
export function saveScore(
  gameId: GameId,
  score: number,
  nickname: string,
  userId?: string  // DB 保存用（undefined の場合は localStorage のみ）
): number
```

処理フロー（変更後）:
1. 既存の localStorage 書き込み処理は維持（個人ベスト更新・ランキング追加）
2. `userId` が渡された場合: `recordScore({ userId, gameId, score })` を `await` なしで呼ぶ（fire-and-forget）
   - エラーは Server Action 内でキャッチ済みのため伝播しない
   - `import { recordScore } from "@/app/actions/user"` を追加
3. `newBest` を返す（変更なし）

> 注意: `lib/scores.ts` はクライアントコンポーネントから import されるため、Server Action の呼び出しは動作する（"use server" 関数はクライアントから呼び出し可能）

### `getAllPersonalBests` / `getGameRanking` / `getOverallRanking` / `getTotalPlayCount`
- これらは引き続き localStorage から読み取る（キャッシュとして機能）
- DB からのデータは `/api/sync` 経由で取得し、hooks/useDbSync.ts がキャッシュを更新する

### `getUserGameRankEntry()` / `getUserOverallRankEntry()`（追加実装）

localStorage のランキングデータから指定ニックネームの順位を検索するヘルパー関数。
DB 同期前（localStorage キャッシュのみ存在する状態）での順位表示に使用される。

```typescript
/** 指定ニックネームの種目別ランク（全件検索）*/
export function getUserGameRankEntry(
  gameId: GameId,
  nickname: string
): RankEntry | null

/** 指定ニックネームの総合ランク（全件検索）*/
export function getUserOverallRankEntry(
  nickname: string
): OverallEntry | null
```

**処理フロー（`getUserGameRankEntry`）**:
1. `loadRankings()[gameId]` から localStorage のランキングデータを取得する
2. ニックネームごとにベストスコアを集約した `bestMap` を構築する
3. score 順にソートして `findIndex((e) => e.nickname === nickname)` で自分を特定する
4. 該当なしの場合は `null` を返す

**処理フロー（`getUserOverallRankEntry`）**:
1. `loadRankings()` から localStorage のランキングデータを取得する
2. 全ニックネームのゲーム別ベストスコアを集約する
3. `POINTS_REF` でポイントを計算し `totalPoints` 降順でソートする
4. `find((e) => e.nickname === nickname)` で自分を特定して返す
5. 該当なしの場合は `null` を返す

> **注意: `app/rankings/page.tsx` での実際の利用方法**
>
> `app/rankings/page.tsx` は `getUserGameRankEntry` / `getUserOverallRankEntry` を呼び出して「あなたの順位」を取得していない。
> 実装では `useDbSync` hook が返す `syncData` の `myGameRanks` / `myOverallRank` を直接参照している:
>
> ```typescript
> // app/rankings/page.tsx の実装（syncData を直接参照）
> useEffect(() => {
>   if (!syncData) return;
>   setGameRankings(syncData.gameRankings);
>   setOverall(syncData.overallRanking);
>   setMyGameEntries(syncData.myGameRanks);     // getUserGameRankEntry は使わない
>   setMyOverallEntry(syncData.myOverallRank);  // getUserOverallRankEntry は使わない
> }, [syncData]);
> ```
>
> `myGameRanks` / `myOverallRank` は `/api/sync` → `getUserRanksFromDb()` によって DB から取得・設定される。
> `getUserGameRankEntry` / `getUserOverallRankEntry` は `lib/scores.ts` に定義されているが、
> `rankings/page.tsx` からは import されておらず、現時点で未使用の状態である。

---

## 9. components/NicknameModal.tsx — upsertUser を呼ぶ

### 変更内容

`handleSubmit` 関数に `upsertUser` の呼び出しを追加する。

### 変更後の handleSubmit 処理フロー

```typescript
const handleSubmit = async () => {
  // 1. 既存のバリデーション（変更なし）
  const trimmed = value.trim();
  if (trimmed.length === 0) { setError("ニックネームを入力してください"); return; }
  if (trimmed.length > 12) { setError("12文字以内で入力してください"); return; }
  
  let ageNum: number | null = null;
  if (ageValue !== "") {
    const age = parseInt(ageValue, 10);
    if (isNaN(age) || age < 1 || age > 120) { setError("年齢は1〜120で入力してください"); return; }
    ageNum = age;
    setAge(age);  // localStorage に保存（変更なし）
  }
  
  // 2. localStorage に保存（変更なし）
  setNickname(trimmed);
  
  // 3. UUID の取得または生成（新規追加）
  const userId = getOrInitUserId();  // lib/nickname.ts の新関数
  
  // 4. Server Action を非同期で呼ぶ（fire-and-forget）（新規追加）
  upsertUser({ id: userId, nickname: trimmed, age: ageNum }).catch((e) => {
    console.warn("[NicknameModal] upsertUser 失敗:", e);
  });
  
  // 5. モーダルを閉じる（変更なし）
  onClose(trimmed);
};
```

### import の追加

```typescript
import { upsertUser } from "@/app/actions/user";
import { getOrInitUserId } from "@/lib/nickname";
```

### 関数定義を `async` にすること

```typescript
const handleSubmit = async () => { ... }
```

---

## 10. app/page.tsx — useDbSync hook の組み込み

### 変更内容

1. `useDbSync` hook を import して、DB からのデータで state を上書きする
2. 「スコアはこのデバイスに保存されます」のフッターテキストを変更

### useDbSync hook の組み込み

```typescript
// import の追加
import { useDbSync } from "@/hooks/useDbSync";

// Home コンポーネント内
const { data: syncData, loading: syncLoading } = useDbSync({ 
  interval: null  // ホームはポーリングなし（初回フェッチのみ）
});

// useEffect を変更（DB データで上書き）
useEffect(() => {
  setMounted(true);
  setBests(getAllPersonalBests());           // localStorage から初期値
  setRemainingPlays(getAllRemainingPlays()); // localStorage から初期値
  const nick = getNickname();
  setNickname(nick);
  setAge(getAge());
  if (!hasNickname()) {
    setModalMode("setup");
    setShowNicknameModal(true);
  }
}, []);

// syncData が届いたら上書き
useEffect(() => {
  if (!syncData) return;
  setBests(syncData.personalBests);
  // dailyPlays を remainingPlays に変換
  const remaining: Partial<Record<GameId, number>> = {};
  for (const id of GAME_IDS) {
    const play = syncData.dailyPlays[id];
    remaining[id] = Math.max(0, MAX_PLAYS_PER_DAY - (play?.playCount ?? 0));
  }
  setRemainingPlays(remaining);
}, [syncData]);
```

> **既知の制限事項**: 上記の `syncData` 処理における `remainingPlays` 計算は `MAX_PLAYS_PER_DAY = 3` 固定であり、リワードプレイ数（`rewardedPlays`）を加算していない。
> そのため、DB 同期後にリワード済みユーザーの残り回数が過小表示される可能性がある。
> `getAllRemainingPlays()` は `rewardedPlays` を考慮した正確な値を返すが、`syncData` からの変換ではこれが反映されていない。
> この制限は後続の設計フェーズで修正予定。現時点では `app/page.tsx` 初期ロード時の `getAllRemainingPlays()` が正確な値を返すため、実害は限定的。

### フッターテキストの変更

```typescript
// 変更前
<p className="text-center text-[#2a2a4a] text-xs mt-10">
  スコアはこのデバイスに保存されます
</p>

// 変更後
<p className="text-center text-[#2a2a4a] text-xs mt-10">
  {syncLoading ? "サーバーと同期中..." : "スコアはクラウドに保存されます"}
</p>
```

---

## 11. hooks/useDbSync.ts — ポーリング hook（新規）

### 目的
`/api/sync` を定期ポーリングし、最新データを返す汎用 hook。

### インターフェース

```typescript
interface UseDbSyncOptions {
  interval: number | null;  // ポーリング間隔 (ms)。null = 初回フェッチのみ
}

interface UseDbSyncResult {
  data: SyncResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useDbSync(options: UseDbSyncOptions = { interval: 30000 }): UseDbSyncResult
```

### 処理フロー

```typescript
export function useDbSync({ interval }: UseDbSyncOptions): UseDbSyncResult {
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    // 1. localStorage から userId を取得
    const userId = getUserId();  // lib/nickname.ts
    if (!userId) return;  // 未設定（ニックネーム設定前）は何もしない

    // 2. フェッチ実行
    setLoading(true);
    try {
      const res = await window.fetch(`/api/sync?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SyncResponse = await res.json();
      setData(json);
      setError(null);

      // 3. localStorage キャッシュを更新（オフラインフォールバック用）
      localStorage.setItem("braingame_scores", JSON.stringify(json.personalBests));
      localStorage.setItem("braingame_rankings", JSON.stringify(
        Object.fromEntries(
          Object.entries(json.gameRankings).map(([k, v]) =>
            [k, v?.map(e => ({ nickname: e.nickname, score: e.score, date: e.date }))]
          )
        )
      ));
    } catch (e) {
      setError(e instanceof Error ? e : new Error("unknown error"));
      // エラー時は前回の data をそのまま保持（setData は呼ばない）
    } finally {
      setLoading(false);
    }
  }, []);

  // マウント直後に即時フェッチ
  useEffect(() => {
    fetch();
  }, [fetch]);

  // ポーリング（interval が null でない場合）
  useEffect(() => {
    if (!interval) return;

    // タブ非表示時はポーリング停止
    const handleVisibilityChange = () => {
      // 次のインターバルが来るまで待つだけで良い
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetch();
      }
    }, interval);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [interval, fetch]);

  return { data, loading, error, refetch: fetch };
}
```

### import

```typescript
"use client";
import { useState, useEffect, useCallback } from "react";
import { getUserId } from "@/lib/nickname";
import type { SyncResponse } from "@/lib/db-types";
```

---

## 12. app/rankings/page.tsx — ポーリングへの変更

### 変更内容

1. `useDbSync` hook を組み込み、30 秒ポーリングを有効にする
2. `getGameRanking` / `getOverallRanking` の localStorage 依存を削除し、DB からのデータを使用する
3. ポーリング中インジケーターを表示する

### 変更後の useEffect

```typescript
// import の追加
import { useDbSync } from "@/hooks/useDbSync";

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>("overall");
  const [gameRankings, setGameRankings] = useState<Partial<Record<GameId, RankEntry[]>>>({});
  const [overall, setOverall] = useState<OverallEntry[]>([]);
  const [myNick, setMyNick] = useState<string | null>(null);

  // 30秒ポーリング（ランキング画面のみ有効）
  const { data: syncData, loading } = useDbSync({ interval: 30000 });

  useEffect(() => {
    setMyNick(getNickname());
    // 初期値は localStorage から（DB データが届くまでのフォールバック）
    const gr: Partial<Record<GameId, RankEntry[]>> = {};
    for (const id of GAME_IDS) gr[id] = getGameRanking(id);
    setGameRankings(gr);
    setOverall(getOverallRanking());
  }, []);

  // DB データで上書き
  useEffect(() => {
    if (!syncData) return;
    setGameRankings(syncData.gameRankings);
    setOverall(syncData.overallRanking);
  }, [syncData]);
  
  // ... 以降の JSX は既存のまま
}
```

### ランキング画面のスケルトン表示（追加実装）

データ取得中（`loading === true` かつ `syncData === null`）の間は `RankingSkeleton` コンポーネントを表示する。

```typescript
// 表示ロジック（JSX 内）
{loading && !syncData ? (
  <RankingSkeleton />
) : (
  // 実データのランキング表示
)}
```

`RankingSkeleton` はランキングリストのプレースホルダー UI（グレーのアニメーションブロック）。
初回ロード時のみ表示され、データ取得完了後は実データに切り替わる。
30秒ポーリングの更新時（`syncData` が既に存在する場合）はスケルトンを表示しない。

なお、設計書では「localStorage をフォールバックとして使用する方針」と記載していたが、
実装では「DB 取得完了までスケルトン表示」に方針変更された。これにより古いキャッシュデータを誤表示するリスクを低減している。

---

## 13. テスト観点リスト

### 正常系

| No | テスト内容 | 手順 | 期待結果 |
|---|---|---|---|
| T-01 | ニックネーム設定で users テーブルに登録 | 新規ブラウザでニックネームを設定する | Turso DB の users テーブルに UUID + nickname レコードが作成される |
| T-02 | スコア保存で scores テーブルに記録 | ゲームをプレイしてスコアを確定する | scores テーブルに新レコードが追加される |
| T-03 | デイリー管理の更新 | 同日に同じゲームを 2 回プレイする | daily_plays テーブルの play_count が 2 になる |
| T-04 | ランキングに他デバイスのスコアが反映 | 2 つのブラウザで別々にスコアを記録し、30 秒待つ | 両方のスコアがランキング画面に表示される |
| T-05 | 総合ランキングのポイント計算 | 計算ゲームで 17 問（基準値）を取る | 総合ランキングの計算ゲームポイントが 10 点になる |
| T-06 | ニックネーム変更 | 既存ユーザーがニックネームを変更する | users テーブルの nickname が更新される |

### 異常系

| No | テスト内容 | 手順 | 期待結果 |
|---|---|---|---|
| T-10 | DB 接続失敗時のフォールバック | `.env.local` の TURSO_DATABASE_URL を無効な値にしてサーバーを起動し、ランキング画面を開く | エラー画面にならず、localStorage のキャッシュが表示される（または空状態の UI が表示される） |
| T-11 | スコア保存の DB 失敗 | ネットワーク切断状態でゲームをプレイしてスコアを確定する | ゲーム結果画面はそのまま表示される（エラーメッセージなし）。localStorage には保存される |
| T-12 | ポーリング失敗 | ランキング画面表示中にネットワークを切断する | 前回取得のランキングが表示され続ける。エラーメッセージは表示されない |
| T-13 | デイリー制限のバイパス試行 | 3 回プレイ後に localStorage を削除してゲームをプレイしようとする | Server Action 側で daily_plays テーブルを確認し、4 回目のプレイ記録が拒否される |
| T-14 | 無効な userId でのリクエスト | `/api/sync` に `userId=invalid_string` でリクエストする | HTTP 400 が返る |
| T-15 | 空の userId でのリクエスト | `/api/sync?userId=` でリクエストする | HTTP 400 が返る |

### 境界値

| No | テスト内容 | 手順 | 期待結果 |
|---|---|---|---|
| T-20 | ニックネーム 12 文字（上限） | 12 文字のニックネームを設定する | 保存される |
| T-21 | ニックネーム 13 文字（上限超え） | 13 文字のニックネームを入力して送信する | バリデーションエラーが表示される |
| T-22 | スコア 0 | score = 0 で recordScore を呼ぶ | scores テーブルに score = 0 が保存される |
| T-23 | スコア負の値 | score = -1 で recordScore を呼ぶ | `{ success: false, error: "invalid score" }` が返る |
| T-24 | ランキング 20 件上限 | 21 ユーザー分のスコアを登録する | ランキングは上位 20 件のみ返る |
| T-25 | 同名ニックネームの衝突 | 2 つのブラウザで同じニックネームを設定してスコアを記録する | 総合ランキングに同名ニックネームが 2 エントリ表示される（user_id が異なるため） |
| T-26 | デイリー 3 回目のプレイ | 同日に同じゲームを 3 回プレイする | daily_plays.play_count が 3 になり、4 回目は制限される |
| T-27 | buildエラーなし | npm run build を実行する | ビルドが正常完了する |
| T-28 | TURSO_AUTH_TOKEN クライアント漏洩なし | ブラウザの DevTools → Network → JS ファイルを確認する | auth_token 文字列が含まれていない |
