---
project_id: "2026-05-11-1500-turso-user-sync"
phase: qa
overall_status: conditional-pass
---
# テストレポート - 2026-05-11-1500-turso-user-sync

## 総合判定
- 結果: conditional-pass（パッケージインストール後にビルド検証が必要）
- 設計準拠率: 13/13（設計書に記載された全ファイルが実装されている）

## テスト観点別結果
| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | lib/db.ts — server-only import / フォールバックなしの Error スロー | 正常系 | PASS | `import "server-only"` あり。環境変数未設定時は Error をスロー。設計通り。isConfigured フラグは設計書に存在しないため不要（設計書では Error スロー方式）。 |
| 2 | lib/db.ts — シングルトンパターン | 正常系 | PASS | モジュールスコープの `let client` で正しく実装。 |
| 3 | lib/db-user.ts — getOrCreateUser の UUID 生成ロジック | 正常系 | PASS | UUID は呼び出し元（NicknameModal / upsertUser）で生成し、引数として受け取る。`INSERT OR IGNORE` で重複防止後に `getUser` で返す設計通り。 |
| 4 | lib/db-user.ts — updateUser の条件分岐 | 正常系 | PASS | `hasNickname && hasAge` / `hasNickname` / `hasAge` の 3 分岐が設計通りに実装。空オブジェクト時は早期 return。 |
| 5 | lib/db-scores.ts — saveScoreToDb の引数型 | 正常系 | PASS | `(userId: string, gameId: GameId, score: number): Promise<void>` で設計通り。 |
| 6 | lib/db-scores.ts — getPersonalBestsFromDb の lowerIsBetter 分岐 | 正常系 | PASS | `MAX(score) as max_s, MIN(score) as min_s` で取得し、`lowerIsBetter` に応じて選択。設計通り。 |
| 7 | lib/db-scores.ts — recordDailyPlay の UPSERT と bestScore 計算 | 正常系 | PASS | `ON CONFLICT DO UPDATE` パターン。lowerIsBetter 対応あり。設計通り。 |
| 8 | lib/db-scores.ts — getRankingsFromDb 総合ランキング最大点の不一致 | 境界値 | WARN | 設計書 §3 では「`points = Math.min(20, Math.max(1, ...))` / 合算最大100」と明記。実装も同方式で `Math.min(20, Math.max(1, Math.round(ratio * 10)))` を使用。一方 `updateDailyHistory` 内では `Math.min(100, Math.round(ratio * 50))` を使用（設計書 §3.5 の `lib/daily.ts` と同ロジックと明記されている）。2 つの計算方式は意図的な仕様差異であり設計書通り。問題なし。 |
| 9 | app/actions/user.ts — "use server" ディレクティブ | 正常系 | PASS | ファイル先頭 1 行目に `"use server"` あり。設計通り。 |
| 10 | app/actions/user.ts — upsertUser のバリデーション | 境界値 | PASS | nickname 空・12文字超・年齢 1〜120 の 3 条件すべて実装。設計通り。 |
| 11 | app/actions/user.ts — recordScore の実行順序 | 正常系 | PASS | saveScoreToDb → recordDailyPlay → updateDailyHistory → revalidatePath の順序が設計通り。 |
| 12 | app/api/sync/route.ts — UUID バリデーション | 異常系 | PASS | UUID_REGEX による正規表現チェックあり。空文字・null も 400 を返す。設計通り。 |
| 13 | app/api/sync/route.ts — Promise.all 並列フェッチ | 正常系 | PASS | 4 関数を `Promise.all` で並列実行。Cache-Control: no-store あり。設計通り。 |
| 14 | hooks/useDbSync.ts — ポーリング間隔・タブ非表示時スキップ | 正常系 | PASS | `setInterval` + `document.visibilityState === "visible"` チェックで設計通りに実装。 |
| 15 | hooks/useDbSync.ts — localStorage キャッシュ更新 | 正常系 | PASS | `braingame_scores` / `braingame_rankings` の両キーを更新。設計通り。 |
| 16 | lib/nickname.ts — 既存 API 維持（getNickname/setNickname/getAge/setAge）| 正常系 | PASS | 既存 4 関数は一切変更なし。getUserId/setUserId/getOrInitUserId が末尾に追加されている。設計通り。 |
| 17 | lib/scores.ts — saveScore の既存シグネチャ維持 | 正常系 | PASS | `(gameId, score, nickname, userId?)` で設計通り。localStorage 処理・戻り値も変更なし。 |
| 18 | lib/scores.ts — dynamic import パターン | 設計差異 | PASS | 設計書では静的 import の例が記載されていたが、実装ではクライアントバンドル汚染防止のため `import()` 動的インポートを採用。work-log に記録済み。安全性・機能面で問題なし。 |
| 19 | components/NicknameModal.tsx — upsertUser の fire-and-forget 呼び出し | 正常系 | PASS | `upsertUser({...}).catch(...)` で fire-and-forget。handleSubmit は `async` 関数。設計通り。 |
| 20 | components/NicknameModal.tsx — getOrInitUserId 呼び出し | 正常系 | PASS | `const userId = getOrInitUserId()` が setNickname の後に呼ばれている。設計通り。 |
| 21 | app/page.tsx — useDbSync 組み込み（interval: null） | 正常系 | PASS | `useDbSync({ interval: null })` で初回フェッチのみ。syncData で bests/remainingPlays を上書き。設計通り。 |
| 22 | app/page.tsx — フッターテキスト切り替え | 正常系 | PASS | `syncLoading ? "サーバーと同期中..." : "スコアはクラウドに保存されます"` の実装を確認。設計通り。 |
| 23 | app/rankings/page.tsx — 30秒ポーリング + ポーリング中インジケーター | 正常系 | PASS | `useDbSync({ interval: 30000 })` + `loading && <span className="... animate-pulse">同期中...</span>`。設計通り。 |
| 24 | scripts/migrate-schema.ts — IF NOT EXISTS によるべき等性 | 正常系 | PASS | 全 CREATE 文に `IF NOT EXISTS`。dotenv で .env.local を読み込み。設計通り。 |
| 25 | T-14: 無効な userId（/api/sync） | 異常系 | PASS（静的） | UUID_REGEX でフィルタ。`invalid_string` は正規表現に一致しないため 400 を返す。 |
| 26 | T-15: 空の userId（/api/sync） | 異常系 | PASS（静的） | `!userId \|\| userId.trim() === ""` チェックで 400 を返す。 |
| 27 | T-23: スコア負の値 | 境界値 | PASS（静的） | `input.score < 0` で `{ success: false, error: "invalid score" }` を返す。 |

## 静的検証
- 型チェック（npx tsc --noEmit）:
  - カテゴリ A（@libsql/client 未インストール）: 2 件
    - `lib/db.ts(2)`: `@libsql/client/web` の型解決エラー
    - `scripts/migrate-schema.ts(1)`: `@libsql/client/web` の型解決エラー
  - カテゴリ A（dotenv 未インストール）: 1 件
    - `scripts/migrate-schema.ts(2)`: `dotenv` の型解決エラー
  - カテゴリ B（コードロジックの型エラー）: 0 件
- カテゴリ B エラー修正: なし

## 発見した問題
### なし
設計書との差異はすべて設計意図に沿ったもの（dynamic import の採用）または設計書で「可」と明記されたもの（db-types.ts の切り出し）であり、バグは発見されなかった。

---

## npm install が必要なパッケージ
```
npm install @libsql/client server-only dotenv
```
- `@libsql/client`: Turso 公式ドライバ（バージョン推奨: ^0.14.0 以降）
- `server-only`: Next.js 公式パターン用（バージョン推奨: ^0.0.1）
- `dotenv`: scripts/migrate-schema.ts 用（バージョン推奨: ^16.0.0）

## .env.local に必要な環境変数
- `TURSO_DATABASE_URL`: Turso DB の接続 URL（例: `libsql://<db-name>-<org>.turso.io`）
- `TURSO_AUTH_TOKEN`: Turso 認証トークン

## PM への申し送り
- 完了とみなしてよいか: conditional（パッケージインストールと環境変数設定後に再ビルドで pass）
- ユーザーが次に行うべきアクション:
  1. `npm install @libsql/client server-only dotenv` を実行する
  2. `.env.local` に `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` を設定する
  3. `npx ts-node scripts/migrate-schema.ts` でテーブルを作成する（ts-node が未インストールの場合は `npm install -D ts-node` も必要）
  4. `npm run build` でビルドが通ることを確認する（T-27）
  5. ブラウザで動作確認を行う（T-01〜T-06 の正常系テスト）
