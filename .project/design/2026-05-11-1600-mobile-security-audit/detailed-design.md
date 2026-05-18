---
project_id: "2026-05-11-1600-mobile-security-audit"
phase: design
doc_type: detailed-design
created: "2026-05-11"
---

# 詳細設計書: モバイルリリース向けセキュリティ修正

## 1. `app/actions/user.ts`

### 1.1 追加する定数

ファイル先頭（"use server" の直後、既存 import の前）に以下を追加する。

```typescript
// ── バリデーション定数 ───────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ニックネームに使用可能な文字種
 * 許可: Unicode 文字・数字・区切り文字（日本語/英語対応）+ 一部記号
 * 禁止: 制御文字・絵文字 ZWJ 連結（爆弾対策）
 */
const NICKNAME_REGEX = /^[\p{L}\p{N}\p{Z}_\-\.・\s]{1,12}$/u;

/**
 * gameId ごとのスコア有効範囲
 * lowerIsBetter=true のゲーム (reaction) は [min, max] = [50, 2000]
 * lowerIsBetter=false のゲームは [0, max]
 */
const SCORE_LIMITS: Record<GameId, { min: number; max: number }> = {
  calculation:     { min: 0,  max: 60   },
  "memory-number": { min: 0,  max: 20   },
  stroop:          { min: 0,  max: 60   },
  reaction:        { min: 50, max: 2000 },
  pattern:         { min: 0,  max: 25   },
};

/** 1日あたりの同一ゲーム最大プレイ回数 */
const MAX_PLAYS_PER_DAY = 3;
```

### 1.2 `upsertUser` の修正

**Before:**
```typescript
export async function upsertUser(input: UpsertUserInput): Promise<ActionResult> {
  if (input.nickname.trim().length === 0) {
    return { success: false, error: "nickname is empty" };
  }
  if (input.nickname.trim().length > 12) {
    return { success: false, error: "nickname too long" };
  }
  if (input.age !== null && (input.age < 1 || input.age > 120)) {
    return { success: false, error: "invalid age" };
  }
  // ...
```

**After:**
```typescript
export async function upsertUser(input: UpsertUserInput): Promise<ActionResult> {
  // [追加] UUID 形式チェック
  if (!UUID_REGEX.test(input.id)) {
    return { success: false, error: "invalid userId format" };
  }

  const trimmedNickname = input.nickname.trim();

  if (trimmedNickname.length === 0) {
    return { success: false, error: "nickname is empty" };
  }
  if (trimmedNickname.length > 12) {
    return { success: false, error: "nickname too long" };
  }
  // [追加] 文字種チェック（長さチェック通過後に実行）
  if (!NICKNAME_REGEX.test(trimmedNickname)) {
    return { success: false, error: "invalid nickname characters" };
  }

  if (input.age !== null && (input.age < 1 || input.age > 120)) {
    return { success: false, error: "invalid age" };
  }

  try {
    await getOrCreateUser({
      id: input.id,
      nickname: trimmedNickname,  // 変更: trim() 済み変数を使用
      age: input.age,
    });
    await updateUser(input.id, {
      nickname: trimmedNickname,  // 変更: trim() 済み変数を使用
      age: input.age,
    });
    return { success: true };
  } catch (e) {
    console.error("[upsertUser]", e);
    return { success: false, error: "db error" };
  }
}
```

**処理フロー:**
```
upsertUser(input)
  │
  ├─[1] UUID_REGEX.test(input.id) → false → { success: false, error: "invalid userId format" }
  ├─[2] trimmedNickname.length === 0 → { success: false, error: "nickname is empty" }
  ├─[3] trimmedNickname.length > 12 → { success: false, error: "nickname too long" }
  ├─[4] NICKNAME_REGEX.test(trimmedNickname) → false → { success: false, error: "invalid nickname characters" }
  ├─[5] age が 1〜120 の範囲外 → { success: false, error: "invalid age" }
  └─[6] getOrCreateUser → updateUser → { success: true }
```

### 1.3 `recordScore` の修正

**Before:**
```typescript
export async function recordScore(input: RecordScoreInput): Promise<ActionResult> {
  if (!input.userId) {
    return { success: false, error: "userId is required" };
  }
  if (input.score < 0) {
    return { success: false, error: "invalid score" };
  }
  if (!GAME_IDS.includes(input.gameId)) {
    return { success: false, error: "invalid gameId" };
  }

  try {
    await saveScoreToDb(input.userId, input.gameId, input.score);
    await recordDailyPlay(input.userId, input.gameId, input.score);
    await updateDailyHistory(input.userId);
    revalidatePath("/rankings");
    return { success: true };
  } catch (e) {
    console.error("[recordScore]", e);
    return { success: false, error: "db error" };
  }
}
```

**After:**
```typescript
export async function recordScore(input: RecordScoreInput): Promise<ActionResult> {
  if (!input.userId) {
    return { success: false, error: "userId is required" };
  }

  // [変更] gameId チェックをスコアチェックより前に移動（SCORE_LIMITS 参照のため）
  if (!GAME_IDS.includes(input.gameId)) {
    return { success: false, error: "invalid gameId" };
  }

  // [変更/追加] スコア範囲チェック（既存の score < 0 チェックを拡張）
  const limits = SCORE_LIMITS[input.gameId];
  if (input.score < limits.min || input.score > limits.max) {
    return { success: false, error: "score out of range" };
  }

  try {
    // [追加] レート制限チェック（DB 参照）
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const playResult = await db.execute({
      sql: "SELECT play_count FROM daily_plays WHERE user_id = ? AND game_id = ? AND play_date = ?",
      args: [input.userId, input.gameId, today],
    });
    const currentPlayCount = playResult.rows[0]
      ? (playResult.rows[0].play_count as number)
      : 0;
    if (currentPlayCount >= MAX_PLAYS_PER_DAY) {
      return { success: false, error: "daily play limit exceeded" };
    }

    await saveScoreToDb(input.userId, input.gameId, input.score);
    await recordDailyPlay(input.userId, input.gameId, input.score);
    await updateDailyHistory(input.userId);
    revalidatePath("/rankings");
    return { success: true };
  } catch (e) {
    console.error("[recordScore]", e);
    return { success: false, error: "db error" };
  }
}
```

**処理フロー:**
```
recordScore(input)
  │
  ├─[1] !input.userId → "userId is required"
  ├─[2] !GAME_IDS.includes(input.gameId) → "invalid gameId"
  ├─[3] score < SCORE_LIMITS[gameId].min
  │     OR score > SCORE_LIMITS[gameId].max → "score out of range"
  │
  ├─[4] DB: SELECT play_count FROM daily_plays WHERE user_id=? AND game_id=? AND play_date=TODAY
  │       └── play_count >= MAX_PLAYS_PER_DAY(3) → "daily play limit exceeded"
  │
  └─[5] saveScoreToDb → recordDailyPlay → updateDailyHistory → revalidatePath → { success: true }
```

### 1.4 `import` の変更

`getDb` を `lib/db.ts` からインポートする行を追加する。

**Before:**
```typescript
import { getOrCreateUser, updateUser } from "@/lib/db-user";
import {
  saveScoreToDb,
  recordDailyPlay,
  updateDailyHistory,
} from "@/lib/db-scores";
import { GAME_IDS, type GameId } from "@/lib/scores";
```

**After:**
```typescript
import { getDb } from "@/lib/db";
import { getOrCreateUser, updateUser } from "@/lib/db-user";
import {
  saveScoreToDb,
  recordDailyPlay,
  updateDailyHistory,
} from "@/lib/db-scores";
import { GAME_IDS, GAME_META, type GameId } from "@/lib/scores";
```

---

## 2. `lib/db.ts`

### 2.1 修正内容

Turso クライアントの `fetch` オプションで 10 秒タイムアウトを設定する。

**Before:**
```typescript
client = createClient({ url, authToken });
```

**After:**
```typescript
client = createClient({
  url,
  authToken,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    return fetch(input, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timeoutId)
    );
  },
});
```

**完全な After:**
```typescript
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

  client = createClient({
    url,
    authToken,
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      return fetch(input, { ...init, signal: controller.signal }).finally(() =>
        clearTimeout(timeoutId)
      );
    },
  });
  return client;
}
```

**処理フロー:**
```
getDb() が呼び出される
  │
  ├── client が既に存在 → 既存クライアントを返す
  │
  └── client が null
        ├── 環境変数チェック（既存）
        └── createClient({
              url,
              authToken,
              fetch: カスタム fetch 関数
                ├── AbortController を生成
                ├── setTimeout(10秒) でタイムアウト登録
                ├── fetch 実行（signal 付き）
                └── .finally() で setTimeout をクリア
            })
```

---

## 3. `app/api/sync/route.ts`

### 3.1 修正内容

CORS ヘッダーを追加し、OPTIONS プリフライトハンドラを追加する。

**追加する定数・ヘルパー:**
```typescript
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
```

**Before（GET 関数）:**
```typescript
return NextResponse.json(body, {
  headers: { "Cache-Control": "no-store" },
});
```

**After（GET 関数）:**
```typescript
const origin = request.headers.get("origin");
return NextResponse.json(body, {
  headers: {
    "Cache-Control": "no-store",
    ...getCorsHeaders(origin),
  },
});
```

**追加（OPTIONS 関数）:**
```typescript
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}
```

**完全な After:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  getPersonalBestsFromDb,
  getRankingsFromDb,
  getUserRanksFromDb,
  getDailyPlaysFromDb,
  getDailyHistoryFromDb,
} from "@/lib/db-scores";
import type { SyncResponse } from "@/lib/db-types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get("userId");
  const origin = request.headers.get("origin");

  if (!userId || userId.trim() === "") {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 }
    );
  }

  if (!UUID_REGEX.test(userId)) {
    return NextResponse.json(
      { error: "invalid userId format" },
      { status: 400 }
    );
  }

  try {
    const [personalBests, rankings, myRanks, dailyPlays, dailyHistory] =
      await Promise.all([
        getPersonalBestsFromDb(userId),
        getRankingsFromDb(),
        getUserRanksFromDb(userId),
        getDailyPlaysFromDb(userId),
        getDailyHistoryFromDb(userId, 14),
      ]);

    const body: SyncResponse = {
      personalBests,
      gameRankings: rankings.gameRankings,
      overallRanking: rankings.overallRanking,
      myGameRanks: myRanks.gameRanks,
      myOverallRank: myRanks.overallRank,
      dailyPlays,
      dailyHistory,
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "no-store",
        ...getCorsHeaders(origin),
      },
    });
  } catch (e) {
    console.error("[GET /api/sync]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
```

---

## 4. `capacitor.config.ts`

### 4.1 修正内容

`server.url` を追加して Vercel デプロイ URL をロードする方式に切り替える。

**Before:**
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.braingame.app',
  appName: 'BrainGame',
  webDir: 'out',
  android: {
    backgroundColor: '#0a0a1a',
  },
};

export default config;
```

**After:**
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.braingame.app',
  appName: 'BrainGame',
  webDir: 'out',
  server: {
    // TODO: デプロイ後に実際の Vercel URL に置換すること
    // 例: https://brain-game-app.vercel.app
    url: 'https://REPLACE_WITH_VERCEL_URL',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0a0a1a',
  },
};

export default config;
```

**注意事項:**
- `server.url` が設定されている場合、`webDir` は参照されない
- `cleartext: false` により HTTP（非 TLS）接続を禁止する（Vercel は HTTPS 必須）
- プレースホルダー `REPLACE_WITH_VERCEL_URL` を実際の URL に置換するまで APK はサーバーに接続できない
- ローカル開発時は `server.url` をコメントアウトするか、`http://localhost:3000` に設定する

---

## 5. `next.config.mjs`

### 5.1 確認結果

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
};
export default nextConfig;
```

**変更なし。** 以下の理由による:

- `output: "export"` は追加しない
  - 理由: Capacitor を `server.url` 方式に切り替えるため、静的エクスポートは不要
  - `output: "export"` を追加すると Server Actions が動作しなくなる
- `images: { unoptimized: true }` は既存の設定として維持する
- CORS ヘッダーは `/api/sync/route.ts` で個別に設定するため、`next.config.mjs` への `headers()` 追加は不要

---

## 6. テスト観点リスト

### 6.1 REQ-01: スコア上限バリデーション

| # | テスト観点 | 入力 | 期待結果 |
|---|-----------|------|---------|
| T-01 | calculation 上限超過 | gameId="calculation", score=61 | { success: false, error: "score out of range" } |
| T-02 | calculation 上限ちょうど | gameId="calculation", score=60 | { success: true } |
| T-03 | memory-number 上限超過 | gameId="memory-number", score=21 | { success: false, error: "score out of range" } |
| T-04 | stroop 上限超過 | gameId="stroop", score=61 | { success: false, error: "score out of range" } |
| T-05 | reaction 下限未満（チート） | gameId="reaction", score=49 | { success: false, error: "score out of range" } |
| T-06 | reaction 上限超過 | gameId="reaction", score=2001 | { success: false, error: "score out of range" } |
| T-07 | reaction 正常値 | gameId="reaction", score=220 | { success: true } |
| T-08 | pattern 上限超過 | gameId="pattern", score=26 | { success: false, error: "score out of range" } |
| T-09 | score=-1（既存の score<0 チェックの統合確認） | gameId="calculation", score=-1 | { success: false, error: "score out of range" } |
| T-10 | 全ゲーム正常上限値 | 各 gameId の max 値 | { success: true } |

### 6.2 REQ-03: UUID バリデーション（upsertUser）

| # | テスト観点 | 入力 | 期待結果 |
|---|-----------|------|---------|
| T-11 | 空文字 id | id="" | { success: false, error: "invalid userId format" } |
| T-12 | UUID 形式でない文字列 | id="not-a-uuid" | { success: false, error: "invalid userId format" } |
| T-13 | 正しい UUID | id="550e8400-e29b-41d4-a716-446655440000" | バリデーション通過 |
| T-14 | SQL インジェクション試行 | id="'; DROP TABLE users; --" | { success: false, error: "invalid userId format" } |
| T-15 | UUID 大文字 | id="550E8400-E29B-41D4-A716-446655440000" | バリデーション通過（case-insensitive） |

### 6.3 REQ-04: レート制限

| # | テスト観点 | 前提状態 | 期待結果 |
|---|-----------|---------|---------|
| T-16 | 当日 1 回目 | play_count=0 | { success: true } |
| T-17 | 当日 2 回目 | play_count=1 | { success: true } |
| T-18 | 当日 3 回目（最後の許可） | play_count=2 | { success: true } |
| T-19 | 当日 4 回目（制限超過） | play_count=3 | { success: false, error: "daily play limit exceeded" } |
| T-20 | 異なる gameId は独立してカウント | gameA: play_count=3 | gameB の recordScore は成功 |
| T-21 | 翌日はリセット | 昨日 play_count=3 | { success: true }（today の count=0） |

### 6.4 REQ-06: CORS ヘッダー

| # | テスト観点 | リクエスト Origin | 期待レスポンスヘッダー |
|---|-----------|----------------|-------------------|
| T-22 | Capacitor Android オリジン | Origin: capacitor://localhost | Access-Control-Allow-Origin: capacitor://localhost |
| T-23 | localhost オリジン | Origin: http://localhost | Access-Control-Allow-Origin: http://localhost |
| T-24 | 未知のオリジン | Origin: https://evil.com | Access-Control-Allow-Origin: capacitor://localhost（デフォルト） |
| T-25 | Origin なし | （Origin ヘッダーなし） | Access-Control-Allow-Origin: capacitor://localhost（デフォルト） |
| T-26 | OPTIONS プリフライト | OPTIONS リクエスト | Status 204, CORS ヘッダー付き |

### 6.5 REQ-07: nickname 文字種バリデーション

| # | テスト観点 | 入力 nickname | 期待結果 |
|---|-----------|-------------|---------|
| T-27 | 日本語のみ | "テスト太郎" | バリデーション通過 |
| T-28 | 英数字のみ | "Player123" | バリデーション通過 |
| T-29 | スクリプトタグ | "<script>" | { success: false, error: "invalid nickname characters" } |
| T-30 | 制御文字 | "\x00abc" | { success: false, error: "invalid nickname characters" } |
| T-31 | 絵文字 | "👍test" | { success: false, error: "invalid nickname characters" } |
| T-32 | 許可記号 | "test_user" | バリデーション通過 |
| T-33 | 全角英数 | "Ａｂｃ123" | バリデーション通過 |
| T-34 | 許可: ハイフン、ドット | "user-1.0" | バリデーション通過 |

### 6.6 REQ-05: Turso タイムアウト

| # | テスト観点 | 前提 | 期待結果 |
|---|-----------|-----|---------|
| T-35 | タイムアウト設定確認 | db.ts の createClient を確認 | fetch オプションが設定されている |
| T-36 | 通常接続は影響なし | Turso が正常応答 | 従来通り動作する |
| T-37 | （手動テスト）接続タイムアウト模擬 | ネットワーク切断 | 10 秒後に AbortError が発生 |

### 6.7 REQ-02: Capacitor server.url

| # | テスト観点 | 確認方法 | 期待結果 |
|---|-----------|---------|---------|
| T-38 | server.url が設定されている | capacitor.config.ts を確認 | url プロパティが存在する |
| T-39 | cleartext: false が設定されている | capacitor.config.ts を確認 | HTTP 接続が禁止されている |
| T-40 | （手動テスト）APK が Vercel に接続する | URL 置換後に APK ビルド | Server Actions が正常動作 |

---

## 7. 実装時の注意事項

### 7.1 SCORE_LIMITS の型安全性

`SCORE_LIMITS` は `Record<GameId, ...>` として定義するため、
新しい gameId が追加された際にコンパイルエラーで気づける。
`GAME_META` と同じファイルに移動させることも将来的に検討する。

### 7.2 レート制限チェックの競合状態

同一ユーザーが同時に複数リクエストを送信した場合（競合状態）、
`play_count` のチェックと `recordDailyPlay` の間に別のリクエストが入る可能性がある。
現状の Turso（HTTP ベース）では DB レベルのロックが困難なため、
若干のオーバーカウント（例: 制限を 1 回超えて記録される）は許容する。
厳密な制限が必要な場合は DB トランザクションまたは Redis ベースの制限を追加実装する。

### 7.3 NICKNAME_REGEX の Unicode 対応

`/u` フラグ（Unicode モード）を使用することで `\p{L}` 等の Unicode プロパティエスケープが有効になる。
Node.js 12 以降・最新ブラウザでサポートされており、Next.js の動作環境では問題ない。

### 7.4 capacitor.config.ts のプレースホルダー

`REPLACE_WITH_VERCEL_URL` は文字列として記述するため、TypeScript のコンパイルエラーは発生しない。
ただし APK は実際の Vercel URL に置換するまで正常動作しないため、
リリース前チェックリストに URL 置換を含めること。

### 7.5 `getDb` のインポート

`app/actions/user.ts` は `"use server"` ディレクティブを持つため、
`lib/db.ts` が `import "server-only"` を持っていても問題ない。
バンドル安全性は既に保証されている。
