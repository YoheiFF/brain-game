---
project_id: "2026-05-12-0900-rewarded-ad-monetization"
phase: qa
overall_status: pass
---
# テストレポート - 2026-05-12-0900-rewarded-ad-monetization

## 総合判定
- 結果: pass（軽微な問題を修正済み）
- 設計準拠率: 12/12（全ファイル）

---

## テスト観点別結果

| # | 観点 | 種別 | 結果 | 詳細 |
|---|------|------|------|------|
| 1 | `lib/admob.ts` の export・処理ロジック | 設計書照合 | PASS | `initAdMob()` / `showRewardedAd()` / `REWARDED_AD_UNIT_ID` が設計通りに実装。settled フラグパターン・Web バイパスも確認済み |
| 2 | `lib/daily.ts` の定数・型・関数 | 設計書照合 | PASS | `MAX_PLAYS_PER_DAY=3` / `MAX_REWARDED_PLAYS_PER_DAY=3`・DailyRecord の `rewardedPlays?` フィールド・`getRemainingPlays()` / `getRewardedRemaining()` / `recordRewardedPlay()` が全て設計通り |
| 3 | `components/AdMobInit.tsx` の実装 | 設計書照合 | PASS | `"use client"` + `useEffect` 1回のみ呼び出し + `return null` が設計通り |
| 4 | `components/WatchAdButton.tsx` の実装 | 設計書照合 | PASS | Props 型・`loading`/`failed` state・`handleClick` ロジック（`recordRewardedPlay` 呼び出し → `onRewarded` コールバック）・レンダリング分岐が設計通り |
| 5 | `WatchAdButton.tsx` 内で `recordRewardedPlay` を実際に呼んでいるか | コード検証 | PASS | `recordRewardedPlay(gameId)` が `handleClick` の報酬付与パスで呼ばれていることを確認（行 22） |
| 6 | ゲームページの `recordRewardedPlay` import が未使用か | コード検証 | FIX済み | WatchAdButton が自身で import・呼び出しを行うため、ゲームページ側の import は不要。5ファイルから削除済み |
| 7 | `lib/daily.ts` の `MAX_REWARDED_PLAYS_PER_DAY=3` と `app/api/record-score/route.ts` の `MAX_PLAYS_PER_DAY=6` の整合性 | 境界値 | PASS | `6 = 3（base）+ 3（rewarded）` が `route.ts` のコメントで明示されており整合している |
| 8 | `WatchAdButton` 表示文字列 `本日のプレイ上限（{MAX_REWARDED_PLAYS_PER_DAY * 2}回）` | 正常系 | PASS | `MAX_REWARDED_PLAYS_PER_DAY = 3` → `3 * 2 = 6` → 「本日のプレイ上限（6回）に達しました」と正しく表示される |
| 9 | `app/layout.tsx` に `<AdMobInit />` が存在するか | 設計書照合 | PASS | `<body>` 先頭に `<AdMobInit />` が配置されている |
| 10 | 全5ゲームページの `remaining` / `rewardedRemaining` state | 設計書照合 | PASS | 全5ページで `useState<number>(MAX_PLAYS_PER_DAY)` / `useState(0)` による初期化を確認 |
| 11 | 全5ゲームページの `WatchAdButton` 表示条件 | 設計書照合 | PASS | `remaining > 0` でスタートボタン、`remaining === 0` で `WatchAdButton` の条件分岐が全5ページで正しく実装されている |
| 12 | `onRewarded` コールバックで両 state を更新しているか | 設計書照合 | PASS | 全5ページで `setRemaining(getRemainingPlays(...))` と `setRewardedRemaining(getRewardedRemaining(...))` の両方を呼んでいることを確認 |
| 13 | `app/api/record-score/route.ts` の上限チェック（サーバー側） | 設計書照合 | PASS | `MAX_PLAYS_PER_DAY = 6`・`currentPlayCount >= MAX_PLAYS_PER_DAY` のチェック・HTTP 429 返却が設計通り実装されている |
| 14 | `android/app/src/main/AndroidManifest.xml` の AdMob 設定 | 設計書照合 | PASS | AdMob App ID の `<meta-data>` と `INTERNET`/`ACCESS_NETWORK_STATE` パーミッションが追加済み。パーミッションの配置は `<application>` 後の manifest ブロック内で XML 仕様上 valid |
| 15 | `"use client"` ディレクティブの存在 | 品質要件 | PASS | `lib/admob.ts` / `components/AdMobInit.tsx` / `components/WatchAdButton.tsx` 全て先頭に `"use client"` が存在する |
| 16 | イベントリスナーの除去 | 品質要件 | PASS | `done()` 関数内で `rewardHandle.then(h => h.remove())` / `dismissHandle.then(h => h.remove())` が確実に呼ばれる |

---

## 静的検証

- 型チェック（`npx tsc --noEmit`）: **PASS**（エラーなし・未使用 import 削除後も PASS 維持）
- ビルド（`npx next build`）: **PASS**（13ページ全て生成成功。コンパイルエラーなし）

---

## 発見した問題と対応

### 問題1: 全5ゲームページでの `recordRewardedPlay` 未使用 import

- **症状**: `app/games/{calculation,reaction,stroop,memory-number,pattern}/page.tsx` の5ファイルで `recordRewardedPlay` が import されているが、当ファイル内で一度も使用されていない
- **期待**: ゲームページ側では `recordRewardedPlay` を使用しない。`WatchAdButton.tsx` が自身で `import { recordRewardedPlay } from "@/lib/daily"` を行い、内部の `handleClick` で呼び出すため、ゲームページ側の import は不要
- **原因**: 設計書（section 3.6）のコメント「WatchAdButton 内で使用するため import（ゲームページ側では直接呼ばない）」が誤解を招く記述になっており、エンジニアが不要な import を追加した。実際には `WatchAdButton.tsx` が自己完結的に import しているため、ゲームページ側への伝播は不要
- **対応**: 修正済み。5ファイル全ての import 行から `recordRewardedPlay` を削除。`npx tsc --noEmit` / `npx next build` ともに PASS 確認済み

---

## PM への申し送り

- **完了とみなしてよいか**: yes
- **残課題**:
  1. **[本番リリース前・必須]** `lib/admob.ts` の `REWARDED_AD_UNIT_ID` をテスト ID から本番 ID に差し替えること（設計書 section 7 参照）
  2. **[本番リリース前・必須]** `lib/admob.ts` の `initializeForTesting: true` を削除または `false` に変更すること
  3. **[本番リリース前・必須]** `android/app/src/main/AndroidManifest.xml` の AdMob App ID を本番 ID に差し替えること
  4. **[仕様確認]** Web 環境（Vercel）では `showRewardedAd()` が常に `true` を返すため、Web ユーザーが広告なしで追加プレイを取得できる。これが意図的な仕様かどうかを確認すること（設計書 注意3 参照）
  5. **[実機テスト]** T01-T19 の手動テスト観点（設計書 section 8）は実機で確認が必要。特に T12（広告スキップ時に残り回数が増えない）と T18（ボタン連打の二重付与防止）は `settled` フラグ・`loading` state の動作に依存するため実機検証を推奨
