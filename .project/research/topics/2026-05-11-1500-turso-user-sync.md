---
project_id: "2026-05-11-1500-turso-user-sync"
phase: research
created: "2026-05-11"
---
# 情報収集レポート: Turso DB 統合・リアルタイム同期

## 結論サマリー

- 現在の BrainGame は localStorage のみでデータを管理しており、スコア・ランキングは端末内に閉じている。Turso + @libsql/client を Next.js 14 App Router の Server Actions / Route Handlers に組み込むことで、クロスデバイス同期と真のマルチプレイヤーランキングが実現できる。
- パッケージは `@libsql/client`（安定版）または新世代の `@tursodatabase/serverless` が使用可能。2026年時点で `@libsql/client` はレガシー扱いになりつつあるため、新規実装では `@tursodatabase/serverless` の採用を推奨。
- リアルタイム同期の手段として Turso 側のネイティブ WebSocket Push はない。**ポーリング（30秒間隔）が最もシンプルで Vercel Serverless と相性が良く、推奨度が最高**。SSE は Edge Runtime 限定で実現可能だが制約が多い。
- Embedded Replicas（syncInterval）は**サーバーレス環境（Vercel など）では利用不可**（ファイルシステムが必要）。VPS / コンテナ環境なら利用可能。
- 既存コードの影響は大きく、`lib/scores.ts`・`lib/daily.ts`・`lib/nickname.ts` の読み書き関数をサーバーサイド API に差し替える必要がある。クライアントコンポーネントは全て useState + useEffect の非同期フェッチ方式に移行する。

---

## 確認済み事実

- [ファクト] Next.js 14 App Router + `@libsql/client` の統合方法は Turso 公式ドキュメントに記載あり。`createClient({ url, authToken })` でクライアント生成し、Server Components / Server Actions から `client.execute(sql)` を呼び出す。（出典: https://docs.turso.tech/sdk/ts/guides/nextjs）
- [ファクト] `@libsql/client` は 2026年4月時点でレガシーセクションへ移行。新推奨パッケージは `@tursodatabase/serverless`・`@tursodatabase/database`・`@tursodatabase/sync`。（出典: WebSearch 結果 codenote.net）
- [ファクト] Embedded Replicas は `syncUrl` + `url: "file:..."` + `syncInterval` を使うが、「サーバーレス環境（ファイルシステムなし）では使用不可」と公式ドキュメントに明記。（出典: https://docs.turso.tech/features/embedded-replicas/introduction）
- [ファクト] Embedded Replicas はレガシー機能となり、新規プロジェクトには Turso Sync (`@tursodatabase/sync`) が推奨されている。（出典: Turso embedded replicas docs）
- [ファクト] Turso Sync は `longPollTimeoutMs`（デフォルト5秒）のロングポーリングをサポート。`pull()`・`push()`・`checkpoint()` をバックグラウンドループで実行する方式。競合解決は "Last-Push-Wins"。（出典: https://turso.tech/blog/introducing-databases-anywhere-with-turso-sync）
- [ファクト] Next.js App Router の Route Handler で SSE を実装する場合、Edge Runtime では長時間接続が維持できるが、Node.js Runtime は Vercel で10秒制限がある。（出典: WebSearch 結果 Vercel Community）
- [ファクト] `app/page.tsx`・`app/rankings/page.tsx`・`app/stats/page.tsx` は全て `"use client"` で、`useEffect` 内で localStorage を直接参照している。（出典: C:\project\BrainGame\app\page.tsx, rankings\page.tsx, stats\page.tsx）
- [ファクト] 現在の `package.json` に DB 関連パッケージは未導入。Next.js ^14.2.0、React ^18.3.0、TypeScript ^5。（出典: C:\project\BrainGame\package.json）
- [ファクト] ランキングデータはニックネームごとのベストスコアを localStorage の `braingame_rankings` キーに JSON で保存している。現在はデバイス内のみ有効で他ユーザーのデータは含まれない。（出典: C:\project\BrainGame\lib\scores.ts）

---

## 推測・未確認

- [推測] Vercel にデプロイする場合、Turso の HTTP ドライバ（`@libsql/client/web` または `@tursodatabase/serverless`）を使う必要がある。Node.js ネイティブの `@libsql/client` はビルドエラーになる可能性がある。（要検証: Vercel ビルド環境で native bindings が使えるかどうか）
- [推測] スコア保存時に Server Action 経由で Turso に書き込むと、ゲーム結果画面のレスポンスに数百ms の待機が発生する可能性がある。楽観的更新（useOptimistic）の実装が必要になる場合がある。（要検証）
- [推測] Capacitor（@capacitor/android が package.json に存在）向けのモバイルビルドでは、Turso への HTTP アクセスにネットワーク権限の追加が必要になる可能性がある。（要検証）
- [推測] 現在の `braingame_daily` はデバイス単位の「1日3回制限」だが、Turso に移行した場合はユーザー識別子（ニックネーム + デバイス ID など）でサーバー側でも制限を実装しないと不正プレイが可能になる。（設計要検討）
- [推測] `braingame_daily_history` のポイント計算ロジック（`lib/daily.ts:updateDailyHistory`）はサーバー側で再実装が必要になるが、複雑度は低い。（確認済みに近いが実装前に再検証推奨）

---

## 現在の localStorage データ構造

| キー | 型 | 用途 | 管理ファイル |
|---|---|---|---|
| `braingame_nickname` | `string` | プレイヤーのニックネーム | `lib/nickname.ts` |
| `braingame_age` | `string`（数値を文字列化） | プレイヤーの年齢 | `lib/nickname.ts` |
| `braingame_scores` | `JSON: Partial<Record<GameId, number>>` | 種目ごとの個人ベストスコア（高速表示用キャッシュ） | `lib/scores.ts` |
| `braingame_rankings` | `JSON: Partial<Record<GameId, ScoreEntry[]>>` | 全プレイヤーのスコア履歴（ニックネーム・スコア・日付） | `lib/scores.ts` |
| `braingame_daily` | `JSON: DailyRecord { date, plays, bestScores }` | 当日の種目別プレイ回数・ベスト（日付が変わるとリセット） | `lib/daily.ts` |
| `braingame_daily_history` | `JSON: Record<date, { totalPoints, gamesPlayed }>` | 過去 N 日分のポイント履歴（成長グラフ用） | `lib/daily.ts` |

**補足:**
- `benchmarks.ts`・`brain-age.ts`・`brain-type.ts`・`game-points.ts`・`titles.ts` は localStorage を一切使用しない純粋な計算ロジック。移行不要。
- `braingame_rankings` がランキング機能の核。現在は全員のデータが各デバイスに分散しており、真の共有ランキングにはなっていない。

---

## Turso 統合方法

### パッケージ

| パッケージ | 用途 | 状態 |
|---|---|---|
| `@libsql/client` | 基本的な HTTP/WebSocket 接続（旧来） | レガシー（動作するが非推奨化傾向） |
| `@libsql/client/web` | ブラウザ・Edge 対応 HTTP ドライバ | レガシー |
| `@tursodatabase/serverless` | Vercel/Edge 向け新世代ドライバ | 推奨（2026年時点） |
| `drizzle-orm` | ORM（型安全なクエリビルダー） | オプション（推奨） |
| `drizzle-kit` | マイグレーション CLI | オプション（推奨） |

### 接続方法

```typescript
// lib/turso.ts（サーバー専用）
import { createClient } from "@libsql/client/web"; // または @tursodatabase/serverless

export const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
```

環境変数（`.env.local`）:
```
TURSO_DATABASE_URL=libsql://<db-name>-<org>.turso.io
TURSO_AUTH_TOKEN=<token>
```

### Server Actions での使い方

```typescript
// app/actions/score.ts
"use server";
import { turso } from "@/lib/turso";

export async function saveScoreAction(
  gameId: string, score: number, nickname: string
) {
  await turso.execute({
    sql: "INSERT INTO scores (game_id, nickname, score, created_at) VALUES (?, ?, ?, ?)",
    args: [gameId, nickname, score, new Date().toISOString()],
  });
}

export async function getRankingAction(gameId: string) {
  const result = await turso.execute({
    sql: `SELECT nickname, MAX(score) as best_score, MAX(created_at) as date
          FROM scores WHERE game_id = ?
          GROUP BY nickname ORDER BY best_score DESC LIMIT 30`,
    args: [gameId],
  });
  return result.rows;
}
```

### 推奨 DB スキーマ（設計案）

```sql
-- ユーザーテーブル
CREATE TABLE users (
  id TEXT PRIMARY KEY,         -- デバイス UUID or ニックネーム
  nickname TEXT NOT NULL,
  age INTEGER,
  created_at TEXT NOT NULL
);

-- スコアテーブル
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  game_id TEXT NOT NULL,       -- calculation, memory-number, stroop, reaction, pattern
  score REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- デイリー管理テーブル
CREATE TABLE daily_plays (
  user_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  play_date TEXT NOT NULL,     -- YYYY-MM-DD
  play_count INTEGER DEFAULT 0,
  best_score REAL,
  PRIMARY KEY (user_id, game_id, play_date)
);

-- デイリー履歴テーブル
CREATE TABLE daily_history (
  user_id TEXT NOT NULL,
  play_date TEXT NOT NULL,
  total_points INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, play_date)
);
```

---

## リアルタイム同期の実現方法比較

| 方式 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| **クライアントポーリング（setInterval）** | 実装が最もシンプル。Vercel Serverless と完全互換。追加インフラ不要。Turso の HTTP ドライバと相性最良 | リアルタイム性は低い（30秒〜60秒遅延）。不要なリクエストが発生する | ★★★★★（最推奨） |
| **SSE（Server-Sent Events） + Route Handler** | HTTP/1.1 で動作。ポーリングより低レイテンシ。実装がWebSocketより簡単 | Vercel Node.js Runtime で10秒制限。Edge Runtime 必須で制約あり。Next.js App Router での SSE は一部バグ報告あり | ★★★（条件付き推奨） |
| **Turso Embedded Replicas（syncInterval）** | ローカルSQLiteから超高速読み取り。オフライン対応可能 | **サーバーレス環境（Vercel）で使用不可**。ファイルシステムが必要。レガシー機能 | ★（VPS専用） |
| **Turso Sync（@tursodatabase/sync）** | Long-polling 内蔵（5秒）。push/pull/checkpoint で制御可能 | Next.js サーバーレスでの動作未検証。Node.js 優先サポートでブラウザ未対応。ベータ段階 | ★★（要検証） |
| **WebSocket（外部サービス: Pusher等）** | 真のリアルタイム。双方向通信可能 | 追加の外部サービスと費用が必要。実装複雑度が高い | ★★（ランキング用途には過剰） |
| **Next.js revalidatePath / revalidateTag** | Server Actions 後に自動再取得。追加ライブラリ不要 | サーバー起点のみ。クライアントから手動トリガーが必要 | ★★★★（書き込み後の即時反映に有効） |

**結論:** ランキングのリアルタイム性は「他プレイヤーのスコアを数秒〜数十秒で反映」で十分と考えられるため、**ポーリング（30秒間隔）+ Server Actions 書き込み後の revalidatePath** の組み合わせが最もバランスが良い。

---

## 既存コードへの影響範囲

| ファイル/関数 | 変更の必要性 |
|---|---|
| `lib/scores.ts` - `saveScore()`, `getGameRanking()`, `getOverallRanking()`, `getTotalPlayCount()` | **必須**: Server Actions または API Route Handlers に完全移行 |
| `lib/daily.ts` - `recordPlay()`, `getPlayCount()`, `getDailyHistory()`, `getDailyBests()` | **必須**: サーバーサイドで再実装（daily_plays / daily_history テーブルを参照） |
| `lib/nickname.ts` - `getNickname()`, `setNickname()`, `getAge()`, `setAge()` | **必須**: ニックネーム・年齢は引き続き localStorage に保存でも可だが、users テーブルに同期することを推奨 |
| `app/page.tsx` | **必須**: `useEffect` 内の localStorage 読み書きをサーバー fetch または Server Actions 呼び出しに変更。ポーリング処理を追加 |
| `app/rankings/page.tsx` | **必須**: `getGameRanking()` / `getOverallRanking()` をサーバーフェッチに変更。ポーリングで自動更新 |
| `app/stats/page.tsx` | **必須**: `getAllPersonalBests()`, `getDailyBests()`, `getTotalPlayCount()` をサーバーフェッチに変更 |
| `app/games/*/page.tsx`（各ゲームページ） | **必須**: ゲーム結果保存時に Server Action (`saveScoreAction`) を呼び出すよう変更 |
| `lib/brain-age.ts`, `lib/brain-type.ts`, `lib/game-points.ts`, `lib/titles.ts`, `lib/benchmarks.ts` | **変更不要**: 純粋な計算関数のみ。引き続きクライアント側で利用可能 |
| `components/NicknameModal.tsx` | **軽微な変更**: ニックネーム保存時に users テーブルへの Server Action 追加 |

---

## 制約・前提・リスク

- [リスク] **Vercel デプロイ時の native bindings 問題**: `@libsql/client`（Node.js版）は Vercel のビルド環境で失敗する報告あり。`/web` サブパスまたは `@tursodatabase/serverless` を使用すること。影響度: 高（ビルドが壊れる）
- [リスク] **ニックネームの一意性**: 現在ニックネームはユーザー識別子として使用されているが、Turso 移行後に同名ニックネームの衝突が発生する。UUIDベースの user_id を別途生成する設計が必要。影響度: 高（ランキングデータの整合性に関わる）
- [リスク] **データ移行**: 既存ユーザーの localStorage データは Turso に自動移行されない。初回アクセス時に localStorage → Turso へのマイグレーション処理が必要。影響度: 中
- [リスク] **デイリー制限のバイパス**: サーバーサイドで play_count を管理しないと、localStorage 削除でデイリー制限を回避できる。Turso 側でも制限チェックが必要。影響度: 中
- [リスク] **コスト**: Turso 無料プランは 500 databases、月次 1億行読み取り、月次 2500万行書き込み。小規模アプリなら無料枠内に収まるが、アクセス増加時に注意。影響度: 低〜中
- [制約] **Capacitor（モバイル）対応**: `@libsql/client/web` は HTTP ベースのため Capacitor WebView 内でも動作するが、CORS 設定と Turso のアクセス元制限を確認する必要がある。
- [前提] **認証なし設計**: 現時点では JWT や OAuth 認証なし。Turso auth_token は環境変数（サーバーサイド専用）で管理し、クライアントに露出しないこと。

---

## 設計者への申し送り

- **user_id の設計が最重要**: 現在ニックネームがユーザー識別子の代わりになっているが、Turso 移行後は `crypto.randomUUID()` で生成した UUID を localStorage に保存し、全リクエストのヘッダーまたはリクエストボディに含める方式を推奨。これにより同名ニックネームの衝突を避けられる。
- **段階的移行を推奨**: 一度に全機能を移行すると破綻リスクが高い。まず「ランキングのみ Turso 化（写し先）」→「スコア書き込みを両方に」→「localStorage を読み取り専用キャッシュに格下げ」の順で進めると安全。
- **Server Actions + revalidatePath の活用**: ゲーム結果保存時に `revalidatePath("/rankings")` を呼び出すことで、次回アクセス時に最新データが返る。ポーリングと組み合わせることで体感的にリアルタイムに近くなる。
- **`app/games/pattern/page.tsx` が変更中**: `git status` から `app/games/pattern/page.tsx` が現在変更中（M）。このファイルもスコア保存ロジックを含むため、Turso 移行と同時変更で競合しないよう注意。
- **`lib/turso.ts` はサーバー専用**: `"server-only"` パッケージを追加し `import "server-only"` を先頭に書くことで、クライアントバンドルへの混入を防ぐことを強く推奨。auth_token のクライアント漏洩を防ぐ安全策となる。
- **Drizzle ORM の採用検討**: 生 SQL でも実装可能だが、Drizzle ORM を使うと型安全なクエリとマイグレーション管理が容易になる。スキーマ変更が多い開発初期には特に有効。
- **ポーリング間隔**: ランキング画面で 30〜60秒ポーリングが推奨。デイリー残回数は他デバイスから変わることはないためリアルタイム同期不要（ゲーム開始時の1回フェッチで十分）。
