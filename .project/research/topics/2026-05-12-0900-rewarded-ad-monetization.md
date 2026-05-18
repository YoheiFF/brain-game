---
project_id: "2026-05-12-0900-rewarded-ad-monetization"
phase: research
created: "2026-05-12"
---
# 情報収集レポート: リワード広告マネタイズ実装調査

## 結論サマリー

- 実装は基本的に正しく機能する設計だが、**`initializeForTesting: true` が本番コードに残っている**のが最大のリスク。本番リリース前に必ず除去しなければ AdMob ポリシー違反・収益不発生につながる。
- **テスト用広告 ID（`ca-app-pub-3940256099942544/5224354917`）も本番 ID に差し替えが必要**。AndroidManifest.xml の App ID も同様。
- `RewardAdPluginEvents.Dismissed` は「報酬確定後のクローズ」でも発火するため、現在の実装（`settled` フラグで最初のイベントを採用）は**競合状態対策として妥当**だが、順序は「Rewarded → Dismissed」が Google 保証（ただしメディエーション時は非保証）。
- デイリー制限管理は **localStorage のみ**で行われており、サーバー側では `MAX_PLAYS_PER_DAY = 6` での上限チェックのみ。クライアント改ざんに対する防御はサーバー側バリデーションに依存している。
- `@capacitor-community/admob@8.0.0` は Capacitor 8 系対応版（2024年12月リリース）。`@capacitor/android@8.3.2` と同メジャーで一致しており互換性は問題なし。

---

## 確認済み事実

- `@capacitor-community/admob` バージョン: `^8.0.0`（出典: `C:\project\BrainGame\package.json`）
- `@capacitor/android` / `@capacitor/core` バージョン: `^8.3.2`（出典: `C:\project\BrainGame\package.json`）
- Next.js バージョン: `^14.2.0`（出典: `C:\project\BrainGame\package.json`）
- Capacitor AppId: `com.braingame.app`（出典: `C:\project\BrainGame\capacitor.config.ts`）
- Web配信URL: `https://brain-game-opal.vercel.app`（Capacitor server.url）（出典: `C:\project\BrainGame\capacitor.config.ts`）
- AdMob 初期化は `initAdMob()` → `AdMob.initialize({ testingDevices: [], initializeForTesting: true })`（出典: `C:\project\BrainGame\lib\admob.ts`）
- テスト用広告 ID（リワード）: `ca-app-pub-3940256099942544/5224354917`（Google 公式テスト ID）（出典: `C:\project\BrainGame\lib\admob.ts`、確認: [Google Developers](https://developers.google.com/admob/android/test-ads)）
- テスト用 App ID: `ca-app-pub-3940256099942544~3347511713`（AndroidManifest.xml にも同値が埋め込み済み）（出典: `C:\project\BrainGame\android\app\src\main\AndroidManifest.xml`）
- Web環境（非ネイティブ）では `showRewardedAd()` が常に `true` を返す開発用バイパスが実装済み（出典: `C:\project\BrainGame\lib\admob.ts` L25）
- 1日の基本プレイ上限: `MAX_PLAYS_PER_DAY = 3`、広告による追加上限: `MAX_REWARDED_PLAYS_PER_DAY = 3`（出典: `C:\project\BrainGame\lib\daily.ts`）
- サーバー側 API `/api/record-score` での上限チェック: `MAX_PLAYS_PER_DAY = 6`（= 3+3）で DB の `play_count` と照合（出典: `C:\project\BrainGame\app\api\record-score\route.ts`）
- `WatchAdButton` は `remaining === 0` かつ `rewardedRemaining > 0` のとき表示される（出典: `C:\project\BrainGame\app\games\calculation\page.tsx` L138-L151）
- WatchAdButton 内の上限回数表示テキストは `MAX_REWARDED_PLAYS_PER_DAY * 2 = 6`（出典: `C:\project\BrainGame\components\WatchAdButton.tsx` L33）
- `AdMobInit` コンポーネントが `app/layout.tsx` で全ページ共通にマウントされ、`useEffect` で `initAdMob()` を呼ぶ（出典: `C:\project\BrainGame\components\AdMobInit.tsx`、`C:\project\BrainGame\app\layout.tsx`）
- 全5ゲーム（calculation, memory-number, stroop, reaction, pattern）すべてで `WatchAdButton` が実装済み（出典: `C:\project\BrainGame\app\games\*/page.tsx`）
- Android の INTERNET / ACCESS_NETWORK_STATE パーミッションは宣言済み（出典: `C:\project\BrainGame\android\app\src\main\AndroidManifest.xml`）
- Google 保証: Google 直接配信広告では `onUserEarnedReward`（Rewarded）は `onAdDismissedFullScreenContent`（Dismissed）の**前**に発火（出典: [Google Developers - Rewarded Ads Android](https://developers.google.com/admob/android/rewarded)）
- v8.0.0 は 2024年12月27日リリース。Capacitor 8 サポートを追加（出典: [GitHub Releases](https://github.com/capacitor-community/admob/releases)）

---

## 推測・未確認

- `initializeForTesting: true` + `testingDevices: []`（空配列）の組み合わせは「全デバイスをテストモードにする」のか「特定デバイスなし」なのかドキュメント上で明確でない（要検証）。現状動作は全デバイスでテスト広告が表示されていると推測される。
- メディエーション（サードパーティ広告ネットワーク）を使用した場合、Rewarded → Dismissed の順序が逆転する可能性がある。現在実装の `settled` フラグは Dismissed が先着した場合 `false` を返すため、報酬が付与されないケースがある可能性（要実機検証）。
- `rewardedRemaining` の state は初回 `useEffect` で取得後、`onRewarded` コールバックでのみ更新される。`remaining > 0` から `remaining === 0` に変化したタイミング（`endGame` 後）での `rewardedRemaining` 再取得タイミングが各ゲームで異なる可能性あり（要確認）。
- `recordRewardedPlay` は import されているが各ゲームページで直接呼ばれていない（`WatchAdButton` 内で呼ばれる）。ゲームページ側での重複呼び出しは現在なし（確認済み）。

---

## 既存コードベースの関連箇所

- `C:\project\BrainGame\lib\admob.ts`: AdMob SDK の初期化・リワード広告の表示ロジック。テスト ID・initializeForTesting フラグ保持。
- `C:\project\BrainGame\lib\daily.ts`: デイリープレイ管理。`plays`・`rewardedPlays` を localStorage に保存。`canPlay` / `getRemainingPlays` / `getRewardedRemaining` / `recordRewardedPlay` を提供。
- `C:\project\BrainGame\components\WatchAdButton.tsx`: UI コンポーネント。広告視聴ボタン・エラー表示・`recordRewardedPlay` 呼び出し・親への `onRewarded` 通知を担う。
- `C:\project\BrainGame\components\AdMobInit.tsx`: SDK 初期化専用コンポーネント（副作用のみ、レンダリングなし）。
- `C:\project\BrainGame\app\layout.tsx`: `AdMobInit` を全ページ共通で配置。
- `C:\project\BrainGame\app\games\calculation\page.tsx`（および他4ゲーム）: ready フェーズで `remaining > 0` の分岐により `WatchAdButton` を表示。`rewardedRemaining` state 管理。
- `C:\project\BrainGame\app\api\record-score\route.ts`: スコア記録 API。DB の `daily_plays` テーブルで 6回上限チェック（サーバー側二重防衛）。
- `C:\project\BrainGame\android\app\src\main\AndroidManifest.xml`: AdMob App ID を `<meta-data>` で宣言（現在はテスト App ID）。

---

## 採用ライブラリ・技術

| 技術 | バージョン | 用途 | 注意点 |
|---|---|---|---|
| `@capacitor-community/admob` | `^8.0.0` | AdMob リワード広告表示 | 本番前に `initializeForTesting: true` を除去必須 |
| `@capacitor/core` | `^8.3.2` | Capacitor ブリッジ | admob@8 と同メジャー、互換性 OK |
| `@capacitor/android` | `^8.3.2` | Android ネイティブブリッジ | Gradle / Kotlin バージョンと要整合 |
| `next` | `^14.2.0` | アプリフレームワーク | `"use client"` 必須（admob.ts / WatchAdButton.tsx 済み） |
| `localStorage` | - | デイリープレイカウント管理 | クライアント改ざんリスクあり（サーバー側で補完） |
| Turso (SQLite) | - | DB: スコア・デイリープレイ記録 | サーバー側で MAX 6回チェック済み |

---

## 制約・前提・リスク

- **[高] テスト設定が本番に残存**: `initializeForTesting: true` および `TEST_REWARDED_ID` が本番環境に出荷されると、実際の収益が発生しない。Google ポリシー上も問題になりうる（出典: [AdMob ポリシー](https://support.google.com/admob/answer/6128543)）。
- **[高] AndroidManifest.xml のテスト App ID**: `ca-app-pub-3940256099942544~3347511713` が本番 APK に埋め込まれたまま公開すると AdMob 審査・収益に影響する。
- **[中] Dismissed イベントが Rewarded より先着するケース**: Google 直接配信では順序保証あり。メディエーション利用時は非保証。現実装の `settled` フラグは先着イベントを採用するため Dismissed 先着 → 報酬未付与になる可能性。報酬付与タイミングを Rewarded イベントのみに依存する設計が安全（現実装はほぼそうなっているが Dismissed が先着した場合 `done(false)` になる点に注意）。
- **[中] localStorage 依存のデイリー管理**: クリアやルートの書き換えで制限を回避可能。ただしサーバー側 API で DB チェックが二重防衛になっているため致命的ではない。
- **[中] Web環境バイパス**: `!Capacitor.isNativePlatform()` で常に `true` を返す。Vercel デプロイ版（Web）でユーザーが広告なしで無制限にプレイできる状態。Web 版でのプレイ制限方針を別途決定が必要。
- **[低] リスナーのメモリリーク**: `showRewardedAd()` 内で `rewardHandle.then(h => h.remove())` で cleanup しているが、`prepareRewardVideoAd` が例外を投げた場合はリスナーが登録されないため問題なし。正常系でも `done()` 内で両リスナーを削除しており設計は妥当。
- **[低] `testingDevices: []` の挙動不明**: 空配列 + `initializeForTesting: true` の組み合わせが「全デバイスがテスト扱い」か「テストデバイス未設定」かの動作をドキュメントで確認できず。

---

## 設計者への申し送り

1. **本番リリース前チェックリスト（必須）**:
   - `lib/admob.ts`: `initializeForTesting: true` → `false` に変更、または `initializeForTesting` キーを削除
   - `lib/admob.ts`: `TEST_REWARDED_ID` → 実際の AdMob リワード広告ユニット ID に差し替え
   - `android/app/src/main/AndroidManifest.xml`: `com.google.android.gms.ads.APPLICATION_ID` の value を本番 App ID に差し替え
   - 本番 ID は AdMob コンソールでアプリ登録後に発行されるものを使用

2. **Dismissed 先着問題への対策案**: `done(false)` を Dismissed 単独では呼ばず、一定時間（例: 500ms）待って Rewarded が来なかった場合に `false` にする方式も検討可。ただし Google 直接配信のみなら現状で問題ない可能性が高い。

3. **Web 版のプレイ制限**: 現状 Vercel 版は広告バイパスで制限なし。意図的か否かを確認の上、Web 版では別の制限方式（例: 広告スキップ不可・プレイ数制限を API のみで管理）を検討。

4. **`rewardedRemaining` state の更新タイミング**: 各ゲームページで `endGame` 後に `remaining` が 0 になった時点では `rewardedRemaining` は更新されない。ready フェーズに戻る際に最新値が取得される（`useEffect` は初回のみ）。`remaining` 変化時に `rewardedRemaining` も再取得する処理を追加すると UX が改善する可能性あり。

5. **GDPR / UMP 対応**: `@capacitor-community/admob` は UMP（User Messaging Platform）SDK によるコンセント取得フローをサポートしている。EU 配信を予定する場合は `AdMob.requestConsentInfo()` → `AdMob.showConsentForm()` のフローを `initAdMob` に追加が必要。現実装では未対応。

6. **iOS 対応**: `capacitor.config.ts` / `AndroidManifest.xml` は Android のみ設定済み。iOS リリースを検討する場合は `Info.plist` への `GADApplicationIdentifier` 追加と SKAdNetwork 設定が別途必要。
