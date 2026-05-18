---
project_id: "2026-05-11-1500-turso-user-sync"
phase: engineering
---
# 実装ログ - 2026-05-11-1500-turso-user-sync

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| lib/db.ts | 新規 | ✅ | Turso クライアント初期化 |
| lib/db-types.ts | 新規 | ✅ | 共通型定義（設計書では lib/db-types.ts として切り出し可と記載） |
| lib/db-user.ts | 新規 | ✅ | ユーザー CRUD |
| lib/db-scores.ts | 新規 | ✅ | スコア CRUD |
| app/actions/user.ts | 新規 | ✅ | Server Actions（upsertUser, recordScore） |
| app/api/sync/route.ts | 新規 | ✅ | GET /api/sync エンドポイント |
| hooks/useDbSync.ts | 新規 | ✅ | ポーリング hook |
| scripts/migrate-schema.ts | 新規 | ✅ | DBスキーマ作成スクリプト |
| lib/nickname.ts | 変更 | ✅ | getUserId / setUserId / getOrInitUserId を追加 |
| lib/scores.ts | 変更 | ✅ | saveScore に userId オプション引数を追加し DB 保存を fire-and-forget で呼ぶ |
| components/NicknameModal.tsx | 変更 | ✅ | handleSubmit を async 化し upsertUser を fire-and-forget で呼ぶ |
| app/page.tsx | 変更 | ✅ | useDbSync hook 組み込み・フッターテキスト変更 |
| app/rankings/page.tsx | 変更 | ✅ | useDbSync hook 組み込み（30秒ポーリング）・ポーリング中インジケーター |

## ファイル別詳細

### lib/db.ts
- 操作: 新規
- 実装内容: `import "server-only"` でクライアントバンドル保護。`@libsql/client/web` を使用。モジュールスコープのシングルトンパターン。環境変数未設定時は Error をスロー。
- 設計との差異: なし

### lib/db-types.ts
- 操作: 新規
- 実装内容: `User`, `DbScoreEntry`, `DailyPlay`, `DailyHistoryRecord`, `SyncResponse` の型定義。既存の `RankEntry`, `OverallEntry`, `DailyHistoryEntry` は既存 lib からの re-export で重複定義を避けた。
- 設計との差異: 型を独立ファイルに切り出し（設計書で「lib/db-types.ts として切り出しても可」と明記されていたため採用）

### lib/db-user.ts
- 操作: 新規
- 実装内容: `getUser`, `getOrCreateUser`, `updateUser` の 3 関数。`INSERT OR IGNORE` パターン。`updateUser` は `nickname` と `age` の有無に応じた SQL 分岐。
- 設計との差異: なし

### lib/db-scores.ts
- 操作: 新規
- 実装内容: `saveScoreToDb`, `getPersonalBestsFromDb`, `getRankingsFromDb`, `recordDailyPlay`, `updateDailyHistory`, `getDailyPlaysFromDb`, `getDailyHistoryFromDb` の 7 関数。
- 設計との差異: `getRankingsFromDb` の総合ランキング詳細は `Partial<Record<GameId, number>>` 型で保持（`OverallEntry.details` と整合させた）

### app/actions/user.ts
- 操作: 新規
- 実装内容: `"use server"` ディレクティブ。`upsertUser`（バリデーション + getOrCreateUser + updateUser）、`recordScore`（バリデーション + DB 書き込み 3 ステップ + revalidatePath）。
- 設計との差異: なし

### app/api/sync/route.ts
- 操作: 新規
- 実装内容: UUID 正規表現バリデーション。Promise.all による並列フェッチ。Cache-Control: no-store ヘッダー付与。
- 設計との差異: なし

### hooks/useDbSync.ts
- 操作: 新規
- 実装内容: `useState` + `useCallback` + `useEffect` によるポーリング実装。タブ非表示時スキップ（visibilityState チェック）。localStorage キャッシュ更新。
- 設計との差異: なし

### scripts/migrate-schema.ts
- 操作: 新規
- 実装内容: dotenv で .env.local を読み込み、6 つの SQL ステートメントを順次実行。べき等（IF NOT EXISTS）。
- 設計との差異: なし

### lib/nickname.ts
- 操作: 変更（追加）
- 実装内容: `KEY_USER_ID` 定数と `getUserId`, `setUserId`, `getOrInitUserId` の 3 関数を既存コードの末尾に追加。既存の公開 API は一切変更なし。
- 設計との差異: なし

### lib/scores.ts
- 操作: 変更
- 実装内容: `saveScore` のシグネチャに `userId?: string` を追加。`userId` が渡された場合は dynamic import で `recordScore` を fire-and-forget 呼び出し。既存の localStorage 処理・戻り値は変更なし。
- 設計との差異: 設計書では `import { recordScore } from "@/app/actions/user"` を静的 import する例が記載されていたが、`lib/scores.ts` がクライアントサイドでも使用されるため、dynamic import (`import("@/app/actions/user")`) パターンを採用した。静的 import だと `server-only` で保護された `lib/db.ts` が `lib/scores.ts` 経由でクライアントバンドルに含まれるリスクがある。動的 import による遅延評価でサーバー側でのみ解決されるため安全。

### components/NicknameModal.tsx
- 操作: 変更
- 実装内容: `import { upsertUser }` と `import { getOrInitUserId }` を追加。`handleSubmit` を `async` 化。`setAge(age)` の条件分岐を設計書通りに修正（age が設定された場合のみ）。`upsertUser` を fire-and-forget で呼び出し。
- 設計との差異: 既存の `handleSubmit` では `setAge` が条件なく呼ばれていたが、設計書の通り `ageValue !== ""` 時のみ `setAge(age)` を呼ぶように整理（機能的に同等、0 呼び出し防止）

### app/page.tsx
- 操作: 変更
- 実装内容: `useDbSync` import 追加、`GAME_IDS` import 追加。`useDbSync({ interval: null })` でホームは初回フェッチのみ。`syncData` で `bests` と `remainingPlays` を上書きする `useEffect` 追加。フッターテキストを同期状態に応じて切り替え。
- 設計との差異: なし

### app/rankings/page.tsx
- 操作: 変更
- 実装内容: `useDbSync` import 追加。`useDbSync({ interval: 30000 })` で 30 秒ポーリング。初期値は localStorage から、DB データが届いたら上書き。ヘッダーにポーリング中インジケーター（`animate-pulse` テキスト）を追加。
- 設計との差異: なし

## 全体サマリー
- 影響範囲: 13 ファイル（新規 8、変更 5）
- 設計通り完了: 12 ファイル
- 部分完了・要相談: 1 ファイル（lib/scores.ts の import 方式を dynamic import に変更。理由は上記詳細を参照）
- npm install が必要なパッケージ: `@libsql/client`, `server-only`, `dotenv`（scripts/migrate-schema.ts 用）
- 次フェーズ（QA）への申し送り:
  1. `@libsql/client` と `server-only` パッケージが未インストールのため、`npm install @libsql/client server-only dotenv` を実行してからビルドすること
  2. `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` が `.env.local` に未設定の場合、Server Action 呼び出し時に Error がスローされる。テスト前に設定するか、設定なしで localStorage フォールバックのみ動作することを確認すること
  3. T-27（npm run build）は `@libsql/client` インストール後に実行すること
  4. lib/scores.ts の dynamic import パターンが TypeScript 的に問題ないか型チェックを確認すること（`import()` の戻り値の型推論）
  5. `scripts/migrate-schema.ts` の実行は `npx ts-node scripts/migrate-schema.ts` で行うが、`ts-node` も必要に応じてインストールすること
