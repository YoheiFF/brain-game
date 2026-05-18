---
project_id: "2026-05-18-1100-friend-feature"
phase: design/basic
created: "2026-05-18"
---

# 基本設計書: フレンド機能

## 1. システム構成

既存アーキテクチャ（Next.js 14 App Router + Turso DB + Capacitor）を拡張する。新規コンポーネントのみ追加し、既存コンポーネントへの変更を最小限に抑える。

```
┌─────────────────────────────────────────────────────────┐
│  Client (Browser / Capacitor WebView)                    │
│                                                          │
│  app/friends/page.tsx        ← フレンド管理              │
│  app/add-friend/page.tsx     ← コード入力                │
│  app/friends/ranking/page.tsx← フレンドランキング         │
│  app/page.tsx                ← ホーム（ボタン追加のみ）   │
└────────────────────┬────────────────────────────────────┘
                     │ fetch / Server Action
┌────────────────────▼────────────────────────────────────┐
│  Next.js API Routes (Vercel Edge / Node.js)              │
│                                                          │
│  GET  /api/friends              ← フレンド一覧           │
│  POST /api/friends/request      ← フレンド申請           │
│  POST /api/friends/respond      ← 申請への返答           │
│  GET  /api/friends/pending      ← 受信申請一覧           │
│  GET  /api/friends/ranking      ← フレンドランキング     │
└────────────────────┬────────────────────────────────────┘
                     │ libSQL (Turso)
┌────────────────────▼────────────────────────────────────┐
│  Turso DB                                                │
│                                                          │
│  users          （既存 + friend_code カラム追加）        │
│  friendships    （新規テーブル）                          │
│  scores         （既存・変更なし）                        │
│  daily_plays    （既存・変更なし）                        │
│  daily_history  （既存・変更なし）                        │
└─────────────────────────────────────────────────────────┘
```

---

## 2. DBスキーマ変更

### 2-1. `users` テーブルへのカラム追加

```sql
ALTER TABLE users ADD COLUMN friend_code TEXT UNIQUE;
```

- `NULL` 許容（既存ユーザーは初回フレンド機能利用時に生成される）
- `UNIQUE` 制約でコード重複防止
- 実行場所: `lib/db.ts` の `getDb()` 内（冪等処理）

### 2-2. `friendships` テーブル（新規）

```sql
CREATE TABLE IF NOT EXISTS friendships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id TEXT NOT NULL,
  addressee_id TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected'
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
```

- `requester_id`: 申請を送ったユーザーの UUID
- `addressee_id`: 申請を受けたユーザーの UUID
- `UNIQUE(requester_id, addressee_id)`: 重複申請防止
- インデックスでフレンド一覧・申請一覧の検索を高速化

---

## 3. APIエンドポイント設計

### 共通仕様

- CORS: 既存の `ALLOWED_ORIGINS = ["capacitor://localhost", "http://localhost"]` を踏襲
- userId バリデーション: UUID 正規表現 `/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i`
- エラーレスポンス: `{ error: string }` + 適切な HTTP ステータスコード

### 3-1. `GET /api/friends?userId=<uuid>`

- 目的: フレンド一覧取得（status=accepted のもの）
- レスポンス: `FriendEntry[]`
- フレンドのニックネームを JOIN で取得

### 3-2. `POST /api/friends/request`

- 目的: フレンド申請
- リクエストボディ: `{ userId: string, friendCode: string }`
- 処理:
  1. `UPPER(friend_code) = UPPER(friendCode)` でユーザーを検索
  2. 自分自身へは申請不可（400）
  3. 既に申請済みまたはフレンド済みの場合は 409
  4. `friendships` に `status=pending` で INSERT
- レスポンス: `{ success: true, addresseeNickname: string }`

### 3-3. `POST /api/friends/respond`

- 目的: フレンド申請への返答
- リクエストボディ: `{ userId: string, requesterId: string, action: "accept" | "reject" }`
- 処理:
  1. `addressee_id=userId, requester_id=requesterId, status=pending` の行を検索
  2. 見つからない場合 404
  3. `action=accept` → `status=accepted`, `updated_at` を更新
  4. `action=reject` → `status=rejected`, `updated_at` を更新
- レスポンス: `{ success: true }`

### 3-4. `GET /api/friends/pending?userId=<uuid>`

- 目的: 受信した申請一覧（status=pending, addressee_id=userId）
- レスポンス: `PendingRequest[]`（申請者のニックネーム・申請日時を含む）

### 3-5. `GET /api/friends/ranking?userId=<uuid>`

- 目的: フレンドランキング取得
- 処理:
  1. `friendships` からフレンド ID リストを取得
  2. 自分の ID を追加
  3. `getFriendRankingsFromDb(userId, friendIds)` を呼び出し
- レスポンス: 既存 `getRankingsFromDb()` と同等の構造 `{ gameRankings, overallRanking }`

---

## 4. 新規ライブラリファイル

### `lib/db-friends.ts`（新規）

- `generateFriendCode(): string` - コード生成
- `ensureUniqueFriendCode(db): Promise<string>` - 衝突リトライ付き生成
- `getOrCreateFriendCode(userId): Promise<string>` - 取得または生成・保存
- `getFriendsByUserId(userId): Promise<FriendEntry[]>` - フレンド一覧
- `getPendingRequests(userId): Promise<PendingRequest[]>` - 受信申請一覧
- `sendFriendRequest(userId, friendCode): Promise<{addresseeId: string, addresseeNickname: string}>` - フレンド申請
- `respondToFriendRequest(userId, requesterId, action): Promise<void>` - 申請への返答
- `getFriendIds(userId): Promise<string[]>` - フレンド ID リスト取得

### `lib/db-scores.ts` への追加

- `getFriendRankingsFromDb(userId, friendIds): Promise<{gameRankings, overallRanking}>` - フレンドランキング取得

---

## 5. 新規ページ

### 5-1. `/friends`（`app/friends/page.tsx`）

フレンド管理の統合ページ。以下のセクションを含む:
1. 自分のフレンドコード表示 + LINE シェアボタン + コピーボタン
2. 受信申請バナー（pending が存在する場合）
3. フレンドコード入力 → 申請フォーム
4. フレンド一覧（ニックネームを表示）
5. フレンドランキングへのリンク

### 5-2. `/add-friend`（`app/add-friend/page.tsx`）

- URL パラメータ `?code=xxx` を読み取り、フォームに自動入力
- コードを確認して申請ボタンを表示
- 申請後は `/friends` にリダイレクト

### 5-3. `/friends/ranking`（`app/friends/ranking/page.tsx`）

- `/api/friends/ranking?userId=xxx` からデータ取得
- 既存の `RankingsPage` と同等の UI（タブ切り替え: 総合 / 各ゲーム）
- フレンドが0人の場合は「フレンドを追加してから確認しよう」空状態

---

## 6. 既存ファイルへの変更

### `lib/db.ts`

`getDb()` 内に以下のマイグレーション処理を追加（クライアント生成後、return 前）:

```typescript
// マイグレーション: friend_code カラム
try {
  await client.execute("ALTER TABLE users ADD COLUMN friend_code TEXT UNIQUE");
} catch { /* 既に存在する場合は無視 */ }

// マイグレーション: friendships テーブル
await client.execute(`CREATE TABLE IF NOT EXISTS friendships (...)`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_friendships_requester ...`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_friendships_addressee ...`);
```

> 注: `getDb()` はシングルトンのため、マイグレーションは初回呼び出し時のみ実行される。ただし非同期処理を含むため、`getDb()` を `async` に変更する必要がある。既存の全呼び出し箇所も `await getDb()` に更新する。

### `app/actions/user.ts`（`upsertUser`）

`getOrCreateUser` 呼び出し後に `getOrCreateFriendCode(input.id)` を呼び出してフレンドコードを自動生成・保存。

### `app/page.tsx`

右上リンクボタン群に「👥 フレンド」ボタンを追加（`/friends` へリンク）。

### `lib/db-types.ts`

フレンド関連の型定義を追加:
- `FriendshipStatus`
- `Friendship`
- `FriendEntry`
- `PendingRequest`

---

## 7. LINEシェア実装方針

```
Web Share API (navigator.share) が使える場合:
  → ネイティブシェアシート（Androidの共有メニュー）を表示
  → title: "BrainGame フレンド招待", text: コード, url: /add-friend?code=XXX

Web Share API が使えない場合:
  → https://line.me/R/share?text=<urlencoded> を window.open で開く

コピーボタン（常時表示）:
  → navigator.clipboard.writeText(friendCode)
```

---

## 8. セキュリティ考慮

- フレンドコード検索 API: `friend_code` → `userId` のマッピングを直接返すエンドポイントは作らない。申請時にのみ内部でルックアップし、`addresseeId` は DB に保存するが API レスポンスでは返さない
- レート制限: 実装なし（既存の制約と同レベル）
- フレンドコードのブルートフォース: 6文字 × 32文字種 ≈ 10億通りで現実的でない。申請フローにはニックネーム確認ステップがあり、関係のない人への意図しない申請は申請者の意図的な操作
