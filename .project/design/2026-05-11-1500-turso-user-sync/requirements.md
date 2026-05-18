---
project_id: "2026-05-11-1500-turso-user-sync"
phase: design
doc_type: requirements
created: "2026-05-11"
---

# 要件定義書: Turso DB 統合・リアルタイム同期

## 1. Why（背景・目的）

現在の BrainGame は localStorage のみでスコア・ランキング・デイリー管理データを保持している。
これにより以下の問題が存在する:

- **デバイス間でスコアが引き継がれない**: スマートフォンで遊んだ結果が PC から見えない
- **ランキングがデバイス内に閉じている**: 「自分しか登録されていないランキング」であり、他ユーザーと競えない
- **データ紛失リスク**: ブラウザのキャッシュクリアで全データが消える
- **デイリー制限がバイパス可能**: localStorage を削除すれば 1 日 3 回制限を回避できる

目的は Turso DB（クラウド SQLite）をバックエンドに導入し、クロスデバイス同期と真の共有ランキングを実現することである。

---

## 2. ユーザー要件（デバイス間同期のユースケース）

### UC-01: 初回セットアップ
- ユーザーが初めてアクセスするとニックネームモーダルが表示される
- ニックネームと年齢を入力して「はじめる！」を押すと、UUID が発行されて localStorage に保存される
- 同時に Turso の `users` テーブルにレコードが作成される
- 以降このデバイスの UUID がユーザーの一意識別子となる

### UC-02: スコア記録とランキング反映
- ゲームをプレイしてスコアが確定すると、Server Action 経由で Turso の `scores` テーブルに保存される
- ランキング画面を開くと最新のグローバルランキングが表示される（30 秒ポーリングで自動更新）
- 書き込み後すぐに `revalidatePath` が走るため、次回ポーリング前でもランキングに反映される

### UC-03: 別デバイスでの再開
- 新しいデバイスでアクセスした場合、新しい UUID が発行されるため同一人物として紐付けられない
  - **現フェーズのスコープ外**: アカウントログイン機能は本リリースに含まない
  - 新デバイスでは新プレイヤーとして開始する

### UC-04: デイリー制限のサーバー側管理
- ゲーム開始時に Server Action が `daily_plays` テーブルの当日のプレイ回数を確認する
- サーバー側でも 1 日 3 回制限を適用し、localStorage 削除によるバイパスを防ぐ
- デイリー残回数はホーム画面表示時に DB から取得する（初回フェッチ 1 回のみ、ポーリング不要）

### UC-05: 統計データの複数デバイス共有
- 個人の累計スコア・デイリー履歴は DB から取得されるため、別デバイスでも同じ統計が見られる
  - ただし UUID ベースの識別のため、別デバイスは別ユーザー扱いになる（UC-03 と同様）

### UC-06: オフライン時のフォールバック
- DB への接続が失敗した場合、localStorage のキャッシュを参照して表示を維持する
- スコア保存が失敗した場合は localStorage にのみ書き込み、エラーをサイレントに処理する（ゲーム体験を損なわない）

---

## 3. システム要件

### 3-1. DB スキーマ

```sql
-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,     -- crypto.randomUUID() で生成した UUID
  nickname     TEXT NOT NULL,
  age          INTEGER,              -- NULL 許容
  created_at   TEXT NOT NULL,        -- ISO 8601 文字列
  updated_at   TEXT NOT NULL
);

-- スコアテーブル
CREATE TABLE IF NOT EXISTS scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  game_id      TEXT NOT NULL,        -- "calculation"|"memory-number"|"stroop"|"reaction"|"pattern"
  score        REAL NOT NULL,
  created_at   TEXT NOT NULL,        -- ISO 8601 文字列
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- デイリープレイ管理テーブル
CREATE TABLE IF NOT EXISTS daily_plays (
  user_id      TEXT NOT NULL,
  game_id      TEXT NOT NULL,
  play_date    TEXT NOT NULL,        -- "YYYY-MM-DD"
  play_count   INTEGER DEFAULT 0,
  best_score   REAL,
  PRIMARY KEY (user_id, game_id, play_date)
);

-- デイリー履歴テーブル（成長グラフ用）
CREATE TABLE IF NOT EXISTS daily_history (
  user_id      TEXT NOT NULL,
  play_date    TEXT NOT NULL,        -- "YYYY-MM-DD"
  total_points INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, play_date)
);
```

### 3-2. API エンドポイント

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/sync` | ユーザーデータ + スコア一括取得（ポーリング用） |

### 3-3. Server Actions

| Action | ファイル | 説明 |
|---|---|---|
| `upsertUser` | `app/actions/user.ts` | ユーザーの作成または更新（ニックネーム・年齢） |
| `recordScore` | `app/actions/user.ts` | スコア記録 + デイリー管理更新 + revalidatePath |

### 3-4. 環境変数

```
TURSO_DATABASE_URL=libsql://<db-name>-<org>.turso.io
TURSO_AUTH_TOKEN=<token>
```

- 上記 2 つはサーバーサイドのみで使用する。クライアントバンドルへの露出を `server-only` パッケージで防止する。

### 3-5. 使用パッケージ

```
@libsql/client        # @libsql/client/web サブパスを使用（Vercel 対応 HTTP ドライバ）
server-only           # lib/db.ts のクライアント混入防止
uuid                  # 不使用。crypto.randomUUID() を使用（Node 20 / ブラウザ標準）
```

> 注意: `@tursodatabase/serverless` は 2026 年推奨パッケージだが、Next.js 14 との動作検証が不十分なため、動作実績のある `@libsql/client/web` を採用する。

---

## 4. 非機能要件

### 4-1. レイテンシ
- スコア保存（Server Action）: **500ms 以内**（ユーザーはリザルト画面を見ている間に完了すること）
- ランキング取得（API ルート）: **800ms 以内**
- ポーリング間隔: **30 秒**（ランキング画面のみ）
- 初回フェッチ（ホーム画面・デイリー残回数）: ページ表示後 1 秒以内に表示を更新

### 4-2. オフライン時の挙動
- DB 接続失敗時は localStorage のキャッシュを返す（フォールバック）
- スコア保存失敗時はサイレントエラー（ゲームは続行可能）
- ポーリング失敗時は前回取得データをそのまま表示（エラーメッセージは表示しない）
- localStorage が空の状態で DB も失敗した場合: 空配列・null を返す

### 4-3. セキュリティ
- `TURSO_AUTH_TOKEN` はサーバーサイド専用変数とし、`NEXT_PUBLIC_` プレフィックスを使用しない
- `lib/db.ts` に `import "server-only"` を記述し、クライアントバンドルへの混入をビルドエラーで防ぐ
- user_id（UUID）は localStorage に保存されるが、他ユーザーの UUID を知っても書き換えることはできない（Server Action でユーザー識別のみに使用）

### 4-4. データ整合性
- 同一 user_id に対してスコアを複数保存可能（ランキング集計は MAX(score) を使用）
- ニックネームの衝突: UUID ベースのため、同名ニックネームが複数存在し得る。ランキングは nickname 表示のみで、実体は user_id で管理

### 4-5. コスト（Turso 無料枠）
- 月次 1 億行読み取り / 2500 万行書き込みの範囲内で運用
- ポーリング 30 秒間隔では 1 ユーザーあたり約 2880 リクエスト/日。1000 同時ユーザーで約 290 万リクエスト/日（無料枠内）

### 4-6. 移行期間の共存戦略
- `lib/scores.ts`・`lib/daily.ts` の既存関数は削除せず、内部実装を「DB 優先・localStorage フォールバック」に差し替える
- UI コンポーネントへのインターフェースは変えない（関数シグネチャを維持）
- localStorage の既存データは新規 DB レコードには移行しない（初回アクセス時の自動マイグレーションは実装しない）

---

## 5. 受け入れ条件

| ID | 条件 | 検証方法 |
|---|---|---|
| AC-01 | ニックネームを設定すると Turso の users テーブルにレコードが作成される | DB 直接確認 or テスト |
| AC-02 | ゲームをプレイすると scores テーブルに記録が追加される | DB 直接確認 |
| AC-03 | ランキング画面に他デバイスで記録したスコアが表示される | 2 ブラウザで検証 |
| AC-04 | DB 接続失敗時はエラー画面ではなく localStorage のキャッシュが表示される | ネットワークオフライン検証 |
| AC-05 | 1 日 3 回プレイ後にサーバー側でも制限がかかり、localStorage を削除してもバイパスできない | localhost クリア後に確認 |
| AC-06 | ランキング画面で 30 秒ポーリングが動作し、別ウィンドウからスコアを保存すると最大 30 秒以内に反映される | 2 ブラウザで検証 |
| AC-07 | `TURSO_AUTH_TOKEN` がクライアント JS バンドルに含まれない | ブラウザの DevTools → Network → JS ファイル内検索 |
| AC-08 | `npm run build` がエラーなく完了する | CI or ローカルビルド |
