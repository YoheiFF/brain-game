---
project_id: "2026-05-12-0900-rewarded-ad-monetization"
phase: engineering
---
# 実装ログ - 2026-05-12-0900-rewarded-ad-monetization

## 編集ファイル一覧
| ファイル | 操作 | 完了 | 設計との差異 |
|---------|------|------|------------|
| `lib/admob.ts` | 新規 | ✅ | なし |
| `lib/daily.ts` | 変更 | ✅ | なし |
| `components/WatchAdButton.tsx` | 新規 | ✅ | なし |
| `components/AdMobInit.tsx` | 新規 | ✅ | なし |
| `app/layout.tsx` | 変更 | ✅ | なし |
| `app/games/calculation/page.tsx` | 変更 | ✅ | あり: `recordRewardedPlay` を import しているが同ファイル内では直接呼び出していない（設計コメントと一致） |
| `app/games/reaction/page.tsx` | 変更 | ✅ | あり: `recordRewardedPlay` を import しているが同ファイル内では直接呼び出していない（設計コメントと一致） |
| `app/games/stroop/page.tsx` | 変更 | ✅ | あり: `recordRewardedPlay` を import しているが同ファイル内では直接呼び出していない（設計コメントと一致） |
| `app/games/memory-number/page.tsx` | 変更 | ✅ | あり: `recordRewardedPlay` を import しているが同ファイル内では直接呼び出していない（設計コメントと一致） |
| `app/games/pattern/page.tsx` | 変更 | ✅ | あり: `recordRewardedPlay` を import しているが同ファイル内では直接呼び出していない（設計コメントと一致） |
| `app/api/record-score/route.ts` | 変更 | ✅ | なし |
| `android/app/src/main/AndroidManifest.xml` | 変更 | ✅ | あり: `<uses-permission>` の配置が設計書の「manifest ブロック内」指定通りだが、実コードではコメント `<!-- Permissions -->` を伴う形式で末尾に配置（機能上の差異なし） |

---

## ファイル別詳細

### `lib/admob.ts`
- 操作: 新規
- 実装内容:
  - `"use client"` ディレクティブ付きのクライアント専用モジュール
  - テスト用定数 `TEST_APP_ID` / `TEST_REWARDED_ID` を定義し、`REWARDED_AD_UNIT_ID` としてエクスポート
  - `initAdMob()`: `Capacitor.isNativePlatform()` が false の場合は即リターン。ネイティブ時は `AdMob.initialize({ testingDevices: [], initializeForTesting: true })` を呼び出し、例外は `console.warn` でサイレント処理
  - `showRewardedAd()`: Web 環境は即 `true` を返すバイパス実装。ネイティブ環境では `prepareRewardVideoAd` → `settled` フラグパターンで `Rewarded` / `Dismissed` イベント先着採用 → Promise 解決
- 設計との差異: なし

### `lib/daily.ts`
- 操作: 編集（追加）
- 実装内容:
  - `MAX_PLAYS_PER_DAY = 3` / `MAX_REWARDED_PLAYS_PER_DAY = 3` を export 定数として定義
  - `DailyRecord` インターフェースに `rewardedPlays?: Partial<Record<GameId, number>>` を追加（省略可能で後方互換性確保）
  - `getRemainingPlays()`: `Math.max(0, MAX_PLAYS_PER_DAY + rewardedEarned - totalPlays)` の計算式で実装
  - `getRewardedRemaining()`: `Math.max(0, MAX_REWARDED_PLAYS_PER_DAY - used)` の計算式で実装
  - `recordRewardedPlay()`: rewardedPlays を未定義時に `{}` 初期化してからインクリメント・保存
  - `canPlay()`: `getRemainingPlays(gameId) > 0` を返す
- 設計との差異: なし

### `components/AdMobInit.tsx`
- 操作: 新規
- 実装内容:
  - `"use client"` ディレクティブ付き
  - `useEffect(() => { initAdMob(); }, [])` で初回マウント時のみ SDK 初期化
  - `return null` でレンダリング出力なし
- 設計との差異: なし

### `components/WatchAdButton.tsx`
- 操作: 新規
- 実装内容:
  - `"use client"` ディレクティブ付き
  - Props: `gameId: GameId` / `rewardedRemaining: number` / `onRewarded: () => void`
  - `loading` / `failed` の2つのローカル state を管理
  - `handleClick`: `setLoading(true)` → `showRewardedAd()` → 成功時 `recordRewardedPlay(gameId)` + `onRewarded()` / 失敗時 `setFailed(true)` → `setLoading(false)`
  - レンダリング: 上限到達メッセージ（`MAX_REWARDED_PLAYS_PER_DAY * 2` = 6回表示）→ `rewardedRemaining > 0` 時はボタン（disabled 中は「広告読み込み中...」、failed 時はエラーメッセージ）→ `rewardedRemaining === 0` 時は「明日また挑戦しよう！」
- 設計との差異: なし

### `app/layout.tsx`
- 操作: 変更
- 実装内容:
  - `AdMobInit` を import し、`<body>` 先頭に `<AdMobInit />` を配置
  - 全ルートで AdMob SDK が自動初期化される
- 設計との差異: なし

### `app/games/calculation/page.tsx`
- 操作: 変更
- 実装内容:
  - `recordPlay` / `getRemainingPlays` / `MAX_PLAYS_PER_DAY` / `getRewardedRemaining` / `recordRewardedPlay` を `@/lib/daily` から import（`recordRewardedPlay` は WatchAdButton 内で使用するための import）
  - `WatchAdButton` を import
  - `remaining` / `rewardedRemaining` state を追加（初期値: `MAX_PLAYS_PER_DAY` / `0`）
  - 初期化 `useEffect` で `getRemainingPlays("calculation")` / `getRewardedRemaining("calculation")` を設定
  - `endGame()` 内で `recordPlay("calculation", currentScore)` 後に `setRemaining(getRemainingPlays("calculation"))` を更新
  - ready フェーズで `remaining > 0` 時はスタートボタン / `remaining === 0` 時は `WatchAdButton` を表示
  - `WatchAdButton` の `onRewarded` コールバックで `remaining` / `rewardedRemaining` 両 state を更新
- 設計との差異: `recordRewardedPlay` を import しているが当ファイル内では直接呼び出していない。設計書のコメント「WatchAdButton 内で使用するため import（ゲームページ側では直接呼ばない）」と実装が一致しており、機能上の問題はない。ただし未使用 import としてリンターが警告を出す可能性がある。

### `app/games/reaction/page.tsx`
- 操作: 変更
- 実装内容: calculation と同パターン。`gameId="reaction"` で全関数・コンポーネントに適用
- 設計との差異: `recordRewardedPlay` の未使用 import（calculation と同様）

### `app/games/stroop/page.tsx`
- 操作: 変更
- 実装内容: calculation と同パターン。`gameId="stroop"` で全関数・コンポーネントに適用
- 設計との差異: `recordRewardedPlay` の未使用 import（calculation と同様）

### `app/games/memory-number/page.tsx`
- 操作: 変更
- 実装内容: calculation と同パターン。`gameId="memory-number"` で全関数・コンポーネントに適用。タイムアウトによるゲーム終了時も `recordPlay` / `setRemaining` を呼ぶパスが存在する
- 設計との差異: `recordRewardedPlay` の未使用 import（calculation と同様）

### `app/games/pattern/page.tsx`
- 操作: 変更
- 実装内容: calculation と同パターン。`gameId="pattern"` で全関数・コンポーネントに適用
- 設計との差異: `recordRewardedPlay` の未使用 import（calculation と同様）

### `app/api/record-score/route.ts`
- 操作: 変更
- 実装内容:
  - `const MAX_PLAYS_PER_DAY = 6; // 3 base + 3 rewarded` を定数として定義
  - POST ハンドラ内でバリデーション通過後・DB 書き込み前に `daily_plays` テーブルから `play_count` を取得
  - `currentPlayCount >= MAX_PLAYS_PER_DAY` の場合 HTTP 429 + `{ success: false, error: "daily play limit exceeded" }` を返す
  - 上限未満の場合 `saveScoreToDb` / `recordDailyPlay` / `updateDailyHistory` を実行
- 設計との差異: なし

### `android/app/src/main/AndroidManifest.xml`
- 操作: 変更
- 実装内容:
  - `<application>` ブロック内に AdMob App ID の `<meta-data>` を追加（テスト用 App ID: `ca-app-pub-3940256099942544~3347511713`）
  - `<manifest>` ブロック末尾に `INTERNET` / `ACCESS_NETWORK_STATE` パーミッションを追加
- 設計との差異: パーミッション宣言の位置が `<application>` ブロックの後ろ（ファイル末尾近く）に `<!-- Permissions -->` コメントとともに配置されている。設計書では「manifest ブロック内」と記載しており実装も manifest ブロック内であるため機能上の問題はなく、XML 的に有効な配置。

---

## 全体サマリー
- 影響範囲: 12 ファイル
- 設計通り完了: 12 ファイル
- 差異あり: 6 ファイル（下記全て軽微・機能上問題なし）
  1. `app/games/calculation/page.tsx` 〜 `app/games/pattern/page.tsx`（5ファイル）: `recordRewardedPlay` を import しているが当ファイル内では直接使用していない。設計書自体が「WatchAdButton 内で使用するため import（ゲームページ側では直接呼ばない）」と注釈しており、設計通りの意図的な import。TypeScript コンパイルは通過するが、一部のリンター設定では `no-unused-vars` 警告が発生する可能性がある。
  2. `android/app/src/main/AndroidManifest.xml`: パーミッション要素の位置が `<application>` 終了タグ後のファイル末尾に配置（コメント付き）。XML 仕様・Android 仕様ともに valid な配置。

- 次フェーズ（QA）への申し送り:
  - T01〜T19 の手動テスト観点（設計書セクション 8）を全件確認すること
  - 特に T12（広告をスキップした場合に残り回数が増えないこと）と T18（ボタン連打の二重付与防止）は `settled` フラグ・`loading` state の動作に依存するため実機検証を推奨
  - 5ゲームページ共通で `recordRewardedPlay` が未使用 import として存在する。`npx tsc --noEmit` を実行してコンパイルエラーがないことを確認すること（TypeScript は未使用 import を通常エラーにしない）
  - Web 環境（Vercel）では広告バイパスが有効（設計書 注意3 参照）。Web ユーザーが広告なしで追加プレイを取得できる仕様が意図的かどうかをプロダクトオーナーに確認すること
  - 本番リリース前に設計書セクション 7 の手順（AdMob テスト ID → 本番 ID への差し替え、`initializeForTesting: false` への変更）を必ず実施すること
