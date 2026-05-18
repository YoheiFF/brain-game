---
project_id: "2026-05-18-1100-friend-feature"
phase: research
created: "2026-05-18"
---
# 情報収集レポート: フレンド機能実装調査

## 結論サマリー

- **DBはTurso（libSQL/SQLite互換）**。friendshipsテーブルを1つ追加するだけで実装可能。
- **ユーザーIDはUUID（クライアント生成・localStorageに保存）**。フレンドコードはusersテーブルに`friend_code TEXT UNIQUE`カラムを追加して保持するのが最もシンプル。
- **LINEシェアは`https://line.me/R/share?text=<urlencoded>`URLスキームで実現可能**。Capacitor/Androidでも通常のIntentとして動作する。Web Share APIも補完的に使える。
- **フレンドコードは6〜8文字の大文字英数字（例: `AB3F7K`）**。crypto.randomUUID()から一部を切り出すか、独立した乱数生成で発行する。衝突確率は十分低い（6文字で36^6≒2.18億通り、1万人規模では事実上ゼロ）。
- **フレンドのみランキングは既存の`getRankingsFromDb()`に`WHERE user_id IN (...)`を追加するだけ**で実装可能。
- **認証基盤が存在しない（localStorageのUUIDのみ）**。フレンド機能はuserIdをセキュリティの境界として利用する必要があり、フレンドコードはuserIdを直接公開しない仕組みにすること。

---

## 確認済み事実

### アーキテクチャ
- **Next.js 14 (App Router) + Vercel デプロイ + Turso DB（libSQL/SQLite）**（出典: `package.json`, `lib/db.ts`）
- **Capacitor v8 Android アプリ**としても動作。`capacitor://localhost` がオリジン（出典: `app/api/sync/route.ts`, `capacitor.config.ts`）
- **本番URL**: `https://brain-game-opal.vercel.app`（出典: `capacitor.config.ts`）
- **CORS許可オリジン**: `capacitor://localhost`, `http://localhost`（出典: `app/api/sync/route.ts`）
- **userId**: `crypto.randomUUID()` でクライアント生成、`braingame_user_id` キーで localStorage に保存（出典: `lib/nickname.ts`）
- **認証機構なし**: userIdの正規表現チェック（UUID形式）のみ（出典: `app/api/sync/route.ts`）

### DB接続
- `@libsql/client/web` を使用（出典: `lib/db.ts`）
- シングルトンパターン、環境変数 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
- `server-only` により DB コードはサーバー側のみ（出典: `lib/db.ts`）

### スコア記録フロー
- ゲーム終了 → `lib/scores.ts:saveScore()` → `fetch("/api/record-score", ...)` fire-and-forget（出典: `lib/scores.ts`）
- API Route `POST /api/record-score`: バリデーション → saveScoreToDb → recordDailyPlay → updateDailyHistory（出典: `app/api/record-score/route.ts`）

### ランキング取得フロー
- `GET /api/sync?userId=<uuid>` → Promise.all で5つのDB関数を並列実行 → SyncResponse を返す（出典: `app/api/sync/route.ts`）
- `useDbSync` hookで初回フェッチ + 30秒ポーリング（出典: `hooks/useDbSync.ts`）
- ランキング上位20件。全ユーザーのベストスコアを集計（出典: `lib/db-scores.ts:getRankingsFromDb()`）

---

## 既存コードベースの関連箇所

| ファイル/関数 | 役割 |
|---|---|
| `lib/db.ts`: `getDb()` | Turso クライアントシングルトン。全DB関数で利用 |
| `lib/db-types.ts`: `User`, `SyncResponse` | 型定義。SyncResponseにfriendRankingを追加する必要あり |
| `lib/db-user.ts`: `getOrCreateUser()`, `updateUser()` | ユーザーCRUD。friend_code追加時にここも更新 |
| `lib/db-scores.ts`: `getRankingsFromDb()` | ランキング取得。フレンドランキングの雛形として利用可能 |
| `lib/db-scores.ts`: `getUserRanksFromDb()` | ユーザー個別順位。フレンドランキング版も同様に実装 |
| `lib/nickname.ts`: `getUserId()`, `getOrInitUserId()` | userId管理。フレンドコード取得APIにも同じパターンを使う |
| `app/api/sync/route.ts`: `GET /api/sync` | 一括同期API。フレンドランキングもここに追加するか、別エンドポイントにする |
| `app/api/record-score/route.ts` | CORS設定のパターンを踏襲 |
| `app/rankings/page.tsx` | ランキングUI。「フレンド」タブを追加する場所 |
| `app/page.tsx` | ホーム。フレンドコード表示・シェアボタンを追加する場所 |
| `components/NicknameModal.tsx` | Server Action (upsertUser) の呼び出しパターン |
| `scripts/migrate-schema.ts` | DBマイグレーション。friendships追加時はここに追記 |

---

## DBスキーマ現状

### usersテーブル
```sql
CREATE TABLE users (
  id         TEXT PRIMARY KEY,   -- UUID（クライアント生成）
  nickname   TEXT NOT NULL,
  age        INTEGER,
  created_at TEXT NOT NULL,      -- ISO 8601
  updated_at TEXT NOT NULL       -- ISO 8601
)
```

### scoresテーブル
```sql
CREATE TABLE scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  game_id    TEXT NOT NULL,      -- "calculation"|"memory-number"|"stroop"|"reaction"|"pattern"
  score      REAL NOT NULL,
  created_at TEXT NOT NULL
)
-- インデックス: idx_scores_game_id, idx_scores_user_id
```

### daily_playsテーブル
```sql
CREATE TABLE daily_plays (
  user_id    TEXT NOT NULL,
  game_id    TEXT NOT NULL,
  play_date  TEXT NOT NULL,      -- "YYYY-MM-DD"
  play_count INTEGER DEFAULT 0,
  best_score REAL,
  PRIMARY KEY (user_id, game_id, play_date)
)
```

### daily_historyテーブル
```sql
CREATE TABLE daily_history (
  user_id      TEXT NOT NULL,
  play_date    TEXT NOT NULL,    -- "YYYY-MM-DD"
  total_points INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, play_date)
)
```

---

## 提案: friendshipsテーブル設計

### usersテーブルへの追加カラム
```sql
ALTER TABLE users ADD COLUMN friend_code TEXT UNIQUE;
-- 例: "AB3F7K"（6文字大文字英数字）
-- NULL許容。初回フレンド機能アクセス時に生成・保存
```

### friendshipsテーブル（新規）
```sql
CREATE TABLE IF NOT EXISTS friendships (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id    TEXT NOT NULL REFERENCES users(id),  -- 申請者のuserID
  addressee_id    TEXT NOT NULL REFERENCES users(id),  -- 受信者のuserID
  status          TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'accepted' | 'rejected'
  created_at      TEXT NOT NULL,                       -- ISO 8601
  updated_at      TEXT NOT NULL,                       -- ISO 8601
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
```

### 設計上の選択理由
- `status = 'pending'` で申請中状態を表現し、`'accepted'` で双方向フレンド成立
- `UNIQUE (requester_id, addressee_id)` で重複申請防止
- フレンド一覧取得時は `requester_id = me OR addressee_id = me` かつ `status = 'accepted'` でクエリ
- `rejected` は任意（削除でも可だが履歴として保持しておくと重複申請防止になる）

---

## LINE シェア実装方法

### URL スキーム（確認済み）
```
https://line.me/R/share?text=<urlencoded-text>
```
- PC・スマートフォンともに動作
- LINEアプリがインストールされていれば自動的にアプリが起動
- インストールされていない場合はストアページへ誘導
- テキストにURLを含める場合はそのままURLエンコードすれば展開される

### 実装パターン（Next.js / React）
```typescript
// フレンドコードとURLを含むシェアテキスト
const shareText = encodeURIComponent(
  `BrainGameで対戦しよう！\nフレンドコード: ${friendCode}\n${appUrl}/friends?code=${friendCode}`
);
const lineShareUrl = `https://line.me/R/share?text=${shareText}`;

// ボタンのonClick
window.open(lineShareUrl, '_blank', 'noopener,noreferrer');
```

### Capacitor Android での動作
- `window.open(lineShareUrl, ...)` はCapacitorのWebView上で動作し、AndroidシステムがURLスキームを解釈
- LINEアプリがインストールされていればLINEが起動する（Intentで処理）
- `@capacitor/browser` プラグインを使えばより確実に動作するが、既存の`window.open`でも動作する

### Web Share API との組み合わせ（補完的）
```typescript
// ネイティブシェアシートが使える場合（Android/iOS）
if (navigator.share) {
  await navigator.share({
    title: 'BrainGame フレンド招待',
    text: `フレンドコード: ${friendCode}`,
    url: `https://brain-game-opal.vercel.app/friends?code=${friendCode}`,
  });
} else {
  // フォールバック: LINEシェアURLを直接開く
  window.open(lineShareUrl, '_blank');
}
```

### 実装方針の推奨
1. **プライマリ**: Web Share API（`navigator.share`）が使える場合はネイティブシェアシートを使用（Android/iOSのアプリ一覧から選べる）
2. **フォールバック**: LINEシェアボタン（`https://line.me/R/share?text=...`）を直接表示
3. **コピーボタン**: フレンドコード単体をクリップボードにコピー（`navigator.clipboard.writeText`）

---

## フレンドコード設計案

### 生成アルゴリズム
```typescript
function generateFriendCode(): string {
  // 大文字英字 + 数字（混同しやすい 0/O/1/I/l は除外）
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // 8文字で32^8 = 約1兆通り（十分すぎる）
  // 6文字で32^6 = 約10億通り（1万人規模では衝突確率 < 0.005%）
  const LENGTH = 6;
  
  const array = new Uint8Array(LENGTH);
  crypto.getRandomValues(array);
  
  return Array.from(array)
    .map(b => CHARS[b % CHARS.length])
    .join('');
}
```

### 衝突確率の試算
| ユーザー数 | コード長 | 文字種 | 衝突確率（誕生日問題近似） |
|---|---|---|---|
| 1万人 | 6文字 | 32種 | ≈ 0.0048% |
| 10万人 | 6文字 | 32種 | ≈ 0.48% |
| 1万人 | 8文字 | 32種 | ≈ ほぼ0% |

- **6文字で十分**（1万人規模のアプリ向け）
- 大文字のみ: ユーザーが入力しやすい（LINEでコードを手打ちするケースに対応）
- 0/O/1/I/l を除外: 視覚的混同を防ぐ

### 衝突時のリトライ
```typescript
// サーバー側でINSERT前にSELECTして衝突チェック
// または UNIQUE制約のINSERT失敗をキャッチしてリトライ（max 5回）
async function ensureUniqueFriendCode(db: Client): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateFriendCode();
    const result = await db.execute({
      sql: 'SELECT id FROM users WHERE friend_code = ?',
      args: [code],
    });
    if (result.rows.length === 0) return code;
  }
  throw new Error('friend code generation failed');
}
```

### フレンドコードの保存タイミング
- **オンデマンド生成**: フレンド機能ページへの初回アクセス時に生成・usersテーブルに保存
- `GET /api/friends/my-code?userId=<uuid>` で取得し、存在しなければ生成して返す

---

## 制約・前提・リスク

### 認証なし環境での制約
- **なりすましリスク**: userIdはUUIDで容易に推測不可だが、localStorageに平文保存される。デバイスを失うとアカウントも失う（既存の制約と同じ）
- **フレンドコードの公開性**: フレンドコードは短い（6文字）ため総当たりで他人のIDを発見できる可能性がある。フレンドコードからuserIdを直接取得するAPIは不要（申請専用にとどめる）
- **フレンドランキングの偽装**: APIへのリクエストはCORS制限のみ。悪意あるユーザーが他人のuserIdでフレンドランキングを閲覧できる（現状のランキング全体閲覧と同レベルのリスク）

### Turso/libSQLの制約
- `ALTER TABLE ADD COLUMN` はサポートされている（SQLite互換）
- 外部キー制約はデフォルト無効（SQLiteの仕様）。`PRAGMA foreign_keys = ON` が必要だが、libsqlでは接続ごとに実行が必要
- Tursoは現在（2024-2025）WALモードで運用されており、並列書き込みに対応

### フレンド機能のUX上の制約
- **双方向確認フロー必須**: 一方的にフレンド追加は不可にするべき（ランキング公開の意味合いがあるため）
- **フレンド上限**: 不特定多数のフレンドはランキングのパフォーマンス劣化につながる。上限50人程度を推奨
- **LINEシェアのみ**: Web版（PC）ではLINEシェアURLが使えない場合、URLコピーでの代替が必要

### Capacitor固有の考慮事項
- `window.open` はCapacitorのWebViewで制限される場合がある（`@capacitor/browser`プラグイン推奨）
- ただし `line://` スキームより `https://line.me/R/share` の方が汎用的で確実

---

## 設計者への申し送り

### 実装推奨方針

1. **DBマイグレーション**: `ALTER TABLE users ADD COLUMN friend_code TEXT UNIQUE` と `CREATE TABLE friendships (...)` を `scripts/migrate-schema.ts` に追加

2. **新規APIエンドポイント（推奨）**:
   - `GET /api/friends/my-code?userId=<uuid>` — 自分のフレンドコード取得（存在しなければ生成）
   - `POST /api/friends/request` — フレンド申請 `{ userId, friendCode }`
   - `POST /api/friends/respond` — 申請承認/拒否 `{ userId, requestId, action: 'accept'|'reject' }`
   - `GET /api/friends/list?userId=<uuid>` — フレンド一覧取得
   - `GET /api/friends/ranking?userId=<uuid>` — フレンドランキング取得

3. **`/api/sync` の拡張は避ける**: 既存の5並列クエリに友人ランキングを追加するとレスポンスタイムが増大する。フレンド画面専用のAPIを別途用意する方が無難。

4. **フレンドランキングの実装**: `lib/db-scores.ts:getRankingsFromDb()` の全ユーザー向けSQLに `WHERE s.user_id IN (?, ?, ...)` を追加するだけで実現できる。関数名は `getFriendRankingsFromDb(userId: string)` にして `lib/db-scores.ts` に追加。

5. **フロントエンド**:
   - `/friends` ページを新規追加（フレンドコード表示・シェア・申請・承認・フレンドランキング）
   - `app/page.tsx` ヘッダーエリアに「👥 フレンド」リンクを追加
   - `app/rankings/page.tsx` のタブに「👥 フレンド」を追加（フレンドがいない場合は非表示）

6. **型定義の追加** (`lib/db-types.ts`):
   ```typescript
   export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';
   export interface Friendship {
     id: number;
     requesterId: string;
     addresseeId: string;
     status: FriendshipStatus;
     createdAt: string;
     updatedAt: string;
   }
   export interface FriendEntry {
     userId: string;
     nickname: string;
     status: FriendshipStatus;
   }
   ```

7. **LINEシェアの実装**: `navigator.share` を第一候補、`https://line.me/R/share?text=...` をフォールバックとして実装。フレンドコードとURLの両方を含むテキストにする。

8. **既存の `SyncResponse` 型は変更不要**: フレンドランキングは専用の `/api/friends/ranking` エンドポイントで返す。

### 潜在的な問題点
- フレンドコードは大文字で表示するが、入力時は大文字小文字を正規化して検索すること（`WHERE UPPER(friend_code) = UPPER(?)`）
- フレンド申請の通知機能は現時点で実装不可（プッシュ通知基盤なし）。ポーリングで「申請が届いています」バナーを表示する形になる
- フレンドが0人の場合、フレンドランキングページは「フレンドがいません」の空状態を表示する
