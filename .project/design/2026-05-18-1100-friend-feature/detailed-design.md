---
project_id: "2026-05-18-1100-friend-feature"
phase: design/detailed
created: "2026-05-18"
---

# 詳細設計書: フレンド機能

## 1. 概要

BrainGame に「フレンドコードによるフレンド申請・承認フロー」と「フレンドのみランキング」を追加する。  
既存の Turso DB / Next.js App Router / Capacitor 構成を踏襲し、新規ファイルを追加しつつ既存ファイルへの変更を最小限に抑える。

---

## 2. 影響範囲

### 2-1. 編集するファイル

| ファイル | 変更内容 |
|---|---|
| `lib/db.ts` | `getDb()` を `async` 化、初回マイグレーション処理を追加 |
| `lib/db-types.ts` | フレンド関連型定義を追加 |
| `lib/db-scores.ts` | `getFriendRankingsFromDb()` 関数を追加 |
| `app/actions/user.ts` | `upsertUser` にフレンドコード自動生成を追加 |
| `app/page.tsx` | ホームの右上リンクボタン群に「👥 フレンド」ボタンを追加 |

### 2-2. 新規作成するファイル

| ファイル | 説明 |
|---|---|
| `lib/db-friends.ts` | フレンド関連DB操作・フレンドコード生成ロジック |
| `app/api/friends/route.ts` | `GET /api/friends` フレンド一覧 |
| `app/api/friends/request/route.ts` | `POST /api/friends/request` フレンド申請 |
| `app/api/friends/respond/route.ts` | `POST /api/friends/respond` 申請への返答 |
| `app/api/friends/pending/route.ts` | `GET /api/friends/pending` 受信申請一覧 |
| `app/api/friends/ranking/route.ts` | `GET /api/friends/ranking` フレンドランキング |
| `app/friends/page.tsx` | フレンド管理ページ |
| `app/add-friend/page.tsx` | フレンドコード入力ページ |
| `app/friends/ranking/page.tsx` | フレンドランキングページ |

---

## 3. DBスキーマ変更詳細

### 3-1. `users` テーブルへのカラム追加

```sql
ALTER TABLE users ADD COLUMN friend_code TEXT UNIQUE;
```

- 既存ユーザーは `NULL`（初回フレンド機能アクセス時に生成）
- `UNIQUE` 制約: コード衝突防止

### 3-2. `friendships` テーブル（新規）

```sql
CREATE TABLE IF NOT EXISTS friendships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id TEXT NOT NULL,
  addressee_id TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
```

---

## 4. 型定義（TypeScript）

### `lib/db-types.ts` への追加

```typescript
// フレンドシップのステータス
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

// friendships テーブルの行
export interface Friendship {
  id: number;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
}

// フレンド一覧の各エントリ（GET /api/friends レスポンス）
export interface FriendEntry {
  userId: string;
  nickname: string;
  friendCode: string | null;
}

// 受信した申請の各エントリ（GET /api/friends/pending レスポンス）
export interface PendingRequest {
  requesterId: string;
  requesterNickname: string;
  createdAt: string;  // ISO 8601
}
```

---

## 5. ファイル別変更詳細

---

### 5-1. `lib/db.ts`（編集）

#### 変更概要
- `getDb()` を `async` 関数に変更
- シングルトン済みの場合は早期 return（従来通り）
- 新規クライアント生成後にマイグレーションを実行してから return

#### 変更後のシグネチャ

```typescript
export async function getDb(): Promise<Client>
```

#### マイグレーション処理（クライアント生成後に追加）

```typescript
// --- マイグレーション: friend_code カラム ---
try {
  await client.execute(
    "ALTER TABLE users ADD COLUMN friend_code TEXT UNIQUE"
  );
} catch {
  // "duplicate column name" エラーは無視（既に存在する）
}

// --- マイグレーション: friendships テーブル ---
await client.execute(`
  CREATE TABLE IF NOT EXISTS friendships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    UNIQUE(requester_id, addressee_id)
  )
`);
await client.execute(
  "CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id)"
);
await client.execute(
  "CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id)"
);
```

#### 既存呼び出し箇所の対応

`lib/db.ts` が `server-only` であるため、`getDb()` の呼び出し元はすべてサーバー側コード。以下のファイルで `const db = getDb()` → `const db = await getDb()` に変更:

- `lib/db-user.ts`（4箇所）
- `lib/db-scores.ts`（全関数）
- `app/actions/user.ts`（1箇所）

---

### 5-2. `lib/db-types.ts`（編集）

前述の型定義（`FriendshipStatus`, `Friendship`, `FriendEntry`, `PendingRequest`）を末尾に追加。

---

### 5-3. `lib/db-friends.ts`（新規）

#### インポート

```typescript
import "server-only";
import { getDb } from "@/lib/db";
import type { FriendEntry, PendingRequest } from "@/lib/db-types";
```

#### 定数

```typescript
const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FRIEND_CODE_LENGTH = 6;
const MAX_FRIENDS = 50;
const MAX_RETRY = 5;
```

#### 関数一覧

---

##### `generateFriendCode(): string`

- 処理: `crypto.getRandomValues(new Uint8Array(FRIEND_CODE_LENGTH))` で乱数取得 → 各バイトを `CHARS[b % CHARS.length]` でマッピング → join
- 戻り値: 6文字の大文字英数字文字列

```typescript
function generateFriendCode(): string {
  const array = new Uint8Array(FRIEND_CODE_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => FRIEND_CODE_CHARS[b % FRIEND_CODE_CHARS.length])
    .join('');
}
```

---

##### `ensureUniqueFriendCode(db: Client): Promise<string>`

- 処理:
  1. `generateFriendCode()` で候補コード生成
  2. `SELECT id FROM users WHERE friend_code = ?` で存在確認
  3. 存在しなければ return（最大 `MAX_RETRY` 回ループ）
  4. `MAX_RETRY` 回失敗したら `Error('friend code generation failed')` をスロー

---

##### `getOrCreateFriendCode(userId: string): Promise<string>`

- 処理:
  1. `SELECT friend_code FROM users WHERE id = ?`
  2. `friend_code` が NULL でなければその値を return
  3. NULL の場合: `ensureUniqueFriendCode(db)` で新コードを生成
  4. `UPDATE users SET friend_code = ?, updated_at = ? WHERE id = ?`
  5. 生成したコードを return

---

##### `getFriendsByUserId(userId: string): Promise<FriendEntry[]>`

```sql
SELECT
  CASE
    WHEN f.requester_id = ? THEN f.addressee_id
    ELSE f.requester_id
  END AS friend_id,
  u.nickname,
  u.friend_code
FROM friendships f
JOIN users u ON u.id = (
  CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
)
WHERE (f.requester_id = ? OR f.addressee_id = ?)
  AND f.status = 'accepted'
LIMIT 50
```

引数: `[userId, userId, userId, userId]`

- 戻り値: `FriendEntry[]` （`userId`, `nickname`, `friendCode`）

---

##### `getPendingRequests(userId: string): Promise<PendingRequest[]>`

```sql
SELECT f.requester_id, u.nickname AS requester_nickname, f.created_at
FROM friendships f
JOIN users u ON u.id = f.requester_id
WHERE f.addressee_id = ? AND f.status = 'pending'
ORDER BY f.created_at DESC
```

- 戻り値: `PendingRequest[]`（`requesterId`, `requesterNickname`, `createdAt`）

---

##### `sendFriendRequest(userId: string, friendCode: string): Promise<{ addresseeId: string; addresseeNickname: string }>`

- 処理フロー:
  1. `SELECT id, nickname FROM users WHERE UPPER(friend_code) = UPPER(?)` → `addressee` を取得
  2. 見つからない場合: `throw new FriendError('NOT_FOUND', 404)`
  3. `addressee.id === userId` の場合: `throw new FriendError('SELF_REQUEST', 400)`
  4. 既存の friendships 行を検索（双方向チェック）:
     ```sql
     SELECT status FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?)
        OR (requester_id = ? AND addressee_id = ?)
     ```
     引数: `[userId, addressee.id, addressee.id, userId]`
  5. `status=pending` または `status=accepted` が存在する場合: `throw new FriendError('ALREADY_EXISTS', 409)`
  6. `status=rejected` が存在する場合: INSERT ではなく UPDATE（再申請を許可）
  7. INSERT:
     ```sql
     INSERT INTO friendships (requester_id, addressee_id, status, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?)
     ```
  8. フレンド数上限チェック（INSERT 前に）:
     ```sql
     SELECT COUNT(*) as cnt FROM friendships
     WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
     ```
     `cnt >= MAX_FRIENDS` の場合: `throw new FriendError('LIMIT_EXCEEDED', 400)`
  9. 戻り値: `{ addresseeId, addresseeNickname }`

---

##### `respondToFriendRequest(userId: string, requesterId: string, action: "accept" | "reject"): Promise<void>`

- 処理フロー:
  1. `SELECT id FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`
     引数: `[requesterId, userId]`
  2. 見つからない場合: `throw new FriendError('NOT_FOUND', 404)`
  3. `action === 'accept'`:
     ```sql
     UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?
     ```
  4. `action === 'reject'`:
     ```sql
     UPDATE friendships SET status = 'rejected', updated_at = ? WHERE id = ?
     ```

---

##### `getFriendIds(userId: string): Promise<string[]>`

```sql
SELECT
  CASE
    WHEN requester_id = ? THEN addressee_id
    ELSE requester_id
  END AS friend_id
FROM friendships
WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
```

引数: `[userId, userId, userId]`

- 戻り値: `string[]`（フレンドの userId 配列）

---

##### `FriendError` クラス

```typescript
export class FriendError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'SELF_REQUEST' | 'ALREADY_EXISTS' | 'LIMIT_EXCEEDED',
    public readonly httpStatus: number,
    message?: string
  ) {
    super(message ?? code);
  }
}
```

---

### 5-4. `lib/db-scores.ts`（編集）

#### 追加関数: `getFriendRankingsFromDb`

```typescript
export async function getFriendRankingsFromDb(
  userId: string,
  friendIds: string[]
): Promise<{
  gameRankings: Partial<Record<GameId, RankEntry[]>>;
  overallRanking: OverallEntry[];
}>
```

- 処理: 既存 `getRankingsFromDb()` のロジックと同一。ただし SQL の WHERE 句でユーザーを絞る:
  ```sql
  WHERE s.user_id IN (?, ?, ...)
  ```
  - `friendIds` に `userId` を追加した配列をプレースホルダーとして渡す
- `friendIds` が空（フレンド0人）の場合でも `[userId]` で自分だけのランキングを返す
- ソート・上位20件・ランク計算は既存ロジックと同一

---

### 5-5. `app/actions/user.ts`（編集）

#### `upsertUser` に追加（try ブロック内の末尾）

```typescript
import { getOrCreateFriendCode } from "@/lib/db-friends";

// 既存処理の後に追加
try {
  await getOrCreateFriendCode(input.id);
} catch (e) {
  // フレンドコード生成失敗はログのみ（ユーザー登録自体は成功させる）
  console.warn("[upsertUser] getOrCreateFriendCode 失敗:", e);
}
```

---

### 5-6. `app/page.tsx`（編集）

右上リンクボタン群（`/stats` と `/rankings` の間または直後）に追加:

```tsx
<Link
  href="/friends"
  className="flex items-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-bold px-4 py-2 rounded-xl transition-all"
>
  👥 フレンド
</Link>
```

---

### 5-7. APIルート共通パターン

全 API ルートは以下の構造を踏襲:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";  // ※ getDb は async に変更済み

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "http://localhost",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
}
```

---

### 5-8. `app/api/friends/route.ts`（新規）

#### `GET /api/friends?userId=<uuid>`

```typescript
export async function GET(request: NextRequest): Promise<NextResponse>
```

処理フロー:
1. `userId` クエリパラメータ取得・UUID バリデーション（失敗時 400）
2. `getFriendsByUserId(userId)` 呼び出し
3. `FriendEntry[]` を JSON レスポンスで返す
4. エラー時: 500

---

### 5-9. `app/api/friends/request/route.ts`（新規）

#### `POST /api/friends/request`

リクエストボディ:
```typescript
{ userId: string; friendCode: string }
```

処理フロー:
1. リクエストボディを JSON パース
2. `userId` UUID バリデーション（失敗時 400）
3. `friendCode` の存在チェック（空文字は 400）、大文字正規化
4. `sendFriendRequest(userId, friendCode)` 呼び出し
5. `FriendError` の `httpStatus` に応じたエラーレスポンスを返す:
   - `NOT_FOUND` → 404 `{ error: "フレンドコードが見つかりません" }`
   - `SELF_REQUEST` → 400 `{ error: "自分自身には申請できません" }`
   - `ALREADY_EXISTS` → 409 `{ error: "既に申請済みまたはフレンドです" }`
   - `LIMIT_EXCEEDED` → 400 `{ error: "フレンド上限（50人）に達しています" }`
6. 成功時: 200 `{ success: true, addresseeNickname: string }`

---

### 5-10. `app/api/friends/respond/route.ts`（新規）

#### `POST /api/friends/respond`

リクエストボディ:
```typescript
{ userId: string; requesterId: string; action: "accept" | "reject" }
```

処理フロー:
1. ボディパース
2. `userId`, `requesterId` の UUID バリデーション（失敗時 400）
3. `action` が `"accept"` または `"reject"` でなければ 400
4. `respondToFriendRequest(userId, requesterId, action)` 呼び出し
5. `FriendError` の場合 404
6. 成功時: 200 `{ success: true }`

---

### 5-11. `app/api/friends/pending/route.ts`（新規）

#### `GET /api/friends/pending?userId=<uuid>`

処理フロー:
1. `userId` クエリパラメータ取得・UUID バリデーション
2. `getPendingRequests(userId)` 呼び出し
3. `PendingRequest[]` を JSON で返す

---

### 5-12. `app/api/friends/ranking/route.ts`（新規）

#### `GET /api/friends/ranking?userId=<uuid>`

処理フロー:
1. `userId` クエリパラメータ取得・UUID バリデーション
2. `getFriendIds(userId)` でフレンド ID リスト取得
3. `getFriendRankingsFromDb(userId, friendIds)` 呼び出し
4. `{ gameRankings, overallRanking }` を JSON で返す

---

### 5-13. `app/friends/page.tsx`（新規）

#### コンポーネント構造

```
FriendsPage                    ("use client")
├── MyCodeSection              自分のフレンドコード表示
│   ├── コード表示（大きめフォント、等幅）
│   ├── コピーボタン           navigator.clipboard.writeText
│   └── LINEシェアボタン       handleShare()
├── PendingSection             受信申請（件数バッジ付き）
│   └── PendingCard × n       承認・拒否ボタン
├── AddFriendSection           フレンド申請フォーム
│   ├── <input> フレンドコード入力（最大6文字、自動大文字化）
│   └── 申請ボタン
├── FriendListSection          フレンド一覧
│   └── FriendCard × n        ニックネーム表示
└── フレンドランキングへのLink
```

#### データフェッチ

```typescript
// ページロード時
useEffect(() => {
  const userId = getUserId();  // localStorage から取得
  if (!userId) return;
  
  // 並列フェッチ
  Promise.all([
    fetch(`/api/friends?userId=${userId}`).then(r => r.json()),
    fetch(`/api/friends/pending?userId=${userId}`).then(r => r.json()),
  ]).then(([friends, pending]) => {
    setFriends(friends);
    setPending(pending);
  });
  
  // フレンドコード取得（API 呼び出しではなく Server Action で取得）
  getOrCreateFriendCode_action(userId).then(setMyCode);
}, []);
```

> 注: `getOrCreateFriendCode` は `lib/db-friends.ts` の `server-only` 関数。クライアントから呼ぶには `app/actions/friends.ts` に Server Action ラッパーを用意する（後述）。

#### `handleShare(friendCode: string): void`

```typescript
async function handleShare(friendCode: string) {
  const appUrl = "https://brain-game-opal.vercel.app";
  const shareText = `🧠 BrainGameで友達になろう！\nフレンドコード: ${friendCode}\n${appUrl}/add-friend?code=${friendCode}`;
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: "BrainGame フレンド招待",
        text: `フレンドコード: ${friendCode}`,
        url: `${appUrl}/add-friend?code=${friendCode}`,
      });
    } catch {
      // ユーザーがキャンセルした場合は何もしない
    }
  } else {
    const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(shareText)}`;
    window.open(lineUrl, '_blank', 'noopener,noreferrer');
  }
}
```

#### `handleRequest(friendCode: string): Promise<void>`

1. `fetch('/api/friends/request', { method: 'POST', body: JSON.stringify({ userId, friendCode: friendCode.toUpperCase() }) })`
2. 200: 「{addresseeNickname} さんに申請を送りました」を表示
3. エラー: `error` フィールドをトースト表示
4. 成功後: フレンド一覧・申請一覧を再フェッチ

#### `handleRespond(requesterId: string, action: "accept" | "reject"): Promise<void>`

1. `fetch('/api/friends/respond', { method: 'POST', body: JSON.stringify({ userId, requesterId, action }) })`
2. 成功後: 申請一覧を再フェッチ、承認の場合はフレンド一覧も再フェッチ

---

### 5-14. `app/add-friend/page.tsx`（新規）

#### 処理フロー

```typescript
// URL パラメータからコードを取得
const searchParams = useSearchParams();
const codeFromUrl = searchParams.get('code') ?? '';

// 初期値として入力フォームにセット
const [code, setCode] = useState(codeFromUrl.toUpperCase());
```

- 入力: 6文字の大文字英数字、入力時に自動で大文字変換（`onChange: (e) => setCode(e.target.value.toUpperCase())`）
- 申請ボタン: `code.length === 6` のときのみ活性
- 申請処理: `handleRequest` と同じ（`fetch POST /api/friends/request`）
- 成功後: `router.push('/friends')` でフレンド管理ページへリダイレクト

---

### 5-15. `app/friends/ranking/page.tsx`（新規）

#### データフェッチ

```typescript
useEffect(() => {
  const userId = getUserId();
  if (!userId) return;
  fetch(`/api/friends/ranking?userId=${userId}`)
    .then(r => r.json())
    .then(data => {
      setGameRankings(data.gameRankings);
      setOverall(data.overallRanking);
    });
}, []);
```

#### UI 構造

- 既存 `app/rankings/page.tsx` と同一のタブ UI・カード UI を流用
- ページタイトル: 「👥 フレンドランキング」
- フレンド0人・自分のみの場合: 空状態カード「フレンドを追加してから確認しよう」＋「フレンドを追加する」ボタン
- ローディング: `RankingSkeleton` コンポーネントを流用（または同等の実装）

---

### 5-16. `app/actions/friends.ts`（新規）

クライアント（`app/friends/page.tsx`）から `lib/db-friends.ts` の関数を呼び出すための Server Action ラッパー:

```typescript
"use server";
import { getOrCreateFriendCode } from "@/lib/db-friends";

export async function getMyFriendCode(userId: string): Promise<string> {
  // UUID バリデーション
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(userId)) throw new Error("invalid userId");
  return getOrCreateFriendCode(userId);
}
```

---

## 6. エラー処理方針

| エラー種別 | 処理方法 |
|---|---|
| UUID バリデーション失敗 | 400 `{ error: "invalid userId format" }` |
| フレンドコード未入力・不正形式 | 400 `{ error: "invalid friendCode" }` |
| 対象ユーザー不在 | 404 `{ error: "フレンドコードが見つかりません" }` |
| 自分自身への申請 | 400 `{ error: "自分自身には申請できません" }` |
| 重複申請 | 409 `{ error: "既に申請済みまたはフレンドです" }` |
| フレンド上限超過 | 400 `{ error: "フレンド上限（50人）に達しています" }` |
| 申請が見つからない（respond） | 404 `{ error: "申請が見つかりません" }` |
| DB エラー | 500 `{ error: "Internal Server Error" }` + `console.error` |
| フレンドコード生成失敗（5回リトライ後） | `Error('friend code generation failed')` をスロー → 呼び出し元でログのみ（ユーザー登録は成功） |

---

## 7. テスト観点

### 7-1. フレンドコード生成

| 観点 | 内容 |
|---|---|
| 正常系 | 6文字の大文字英数字が生成される |
| 正常系 | 生成されるコードに 0/O/1/I/l が含まれない |
| 正常系 | 初回 `upsertUser` 後にフレンドコードが DB に保存される |
| 正常系 | 2回目の `upsertUser` で既存コードが上書きされない |
| 境界値 | コード衝突時に最大5回リトライして新しいコードを生成する |
| 異常系 | 5回すべて衝突した場合にエラーがスローされる |

### 7-2. フレンド申請

| 観点 | 内容 |
|---|---|
| 正常系 | 存在するフレンドコードへの申請が成功する |
| 正常系 | 小文字・大文字混在のコード入力でも正しく検索される |
| 正常系 | 申請後に `status=pending` のレコードが作成される |
| 異常系 | 存在しないフレンドコードで 404 が返る |
| 異常系 | 自分自身のフレンドコードで 400 が返る |
| 異常系 | 同じ相手に重複申請すると 409 が返る |
| 異常系 | フレンド上限（50人）に達している場合に 400 が返る |
| 境界値 | フレンドコードが5文字・7文字の場合に 400 が返る |

### 7-3. 申請への返答

| 観点 | 内容 |
|---|---|
| 正常系 | 承認で `status=accepted` に更新される |
| 正常系 | 拒否で `status=rejected` に更新される |
| 異常系 | 存在しない申請に対して 404 が返る |
| 異常系 | 既に処理済みの申請（accepted/rejected）に対して 404 が返る |
| 異常系 | `action` に `"accept"` / `"reject"` 以外を指定すると 400 が返る |

### 7-4. フレンド一覧・申請一覧

| 観点 | 内容 |
|---|---|
| 正常系 | フレンド0人の場合、空配列が返る |
| 正常系 | `requester_id` 側でも `addressee_id` 側でも自分がフレンド一覧に表示される |
| 正常系 | `rejected` 状態の関係はフレンド一覧に含まれない |
| 正常系 | `pending` 状態の申請が受信申請一覧に表示される |

### 7-5. フレンドランキング

| 観点 | 内容 |
|---|---|
| 正常系 | フレンド0人の場合、自分のみのランキングが返る |
| 正常系 | フレンドのスコアが含まれたランキングが返る |
| 正常系 | フレンド以外のユーザーのスコアが含まれない |
| 境界値 | フレンド50人全員のランキングが正しく返る |

### 7-6. LINE シェア

| 観点 | 内容 |
|---|---|
| 正常系 | `navigator.share` が利用可能な場合、ネイティブシェアシートが開く |
| 正常系 | `navigator.share` が利用不可の場合、LINE シェア URL が開く |
| 正常系 | シェアテキストにフレンドコードと `/add-friend?code=xxx` URL が含まれる |
| 正常系 | `/add-friend?code=ABC123` でページを開くと ABC123 が入力欄に自動入力される |

---

## 8. 完了条件チェックリスト

### DB・バックエンド
- [ ] `users` テーブルに `friend_code TEXT UNIQUE` カラムが追加されている
- [ ] `friendships` テーブルが作成されている（インデックス含む）
- [ ] `getDb()` が async になり、マイグレーションが冪等実行される
- [ ] 全 DB 呼び出し元で `await getDb()` に更新されている
- [ ] `upsertUser` 呼び出し時にフレンドコードが自動生成される
- [ ] 5本の API エンドポイントが実装されている
- [ ] 全エンドポイントに CORS ヘッダーが設定されている

### フロントエンド
- [ ] ホーム画面に「👥 フレンド」リンクボタンが表示される
- [ ] `/friends` でフレンドコードが表示される
- [ ] LINE シェアボタンが機能する（Web Share API フォールバック含む）
- [ ] コピーボタンでフレンドコードがクリップボードにコピーされる
- [ ] フレンドコード入力フォームから申請を送れる
- [ ] 受信申請の承認・拒否ができる
- [ ] フレンド一覧が表示される
- [ ] `/add-friend?code=xxx` で自動入力される
- [ ] `/friends/ranking` でフレンドランキングが表示される
- [ ] フレンド0人の空状態が適切に表示される

### 品質
- [ ] TypeScript のビルドエラーがない（`npm run build` が通る）
- [ ] 存在しないコード・重複申請・自己申請のエラーハンドリングが機能する
- [ ] フレンドコードの大文字小文字を区別しない検索が機能する
