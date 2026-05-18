---
project_id: "2026-05-12-0900-rewarded-ad-monetization"
phase: design/detailed
created: "2026-05-12"
---
# 詳細設計書: リワード広告マネタイズ機能

---

## 1. 概要

BrainGame Android アプリにリワード広告（動画広告視聴）によるプレイ回数追加機能を実装する。

- 各ゲームの1日あたり無料プレイ上限は 3回
- 上限到達後、ユーザーは広告を視聴することで最大 3回追加プレイが可能になる
- AdMob SDK（`@capacitor-community/admob@^8.0.0`）を Capacitor ブリッジ経由で利用する
- プレイ回数管理はクライアント localStorage とサーバー DB の二層構造で行う
- Web 環境（Vercel）では広告をスキップして常にリワードを付与するバイパスが存在する

本設計書は**実装済みコードを正として**作成されており、将来の再実装・変更の参照仕様として機能する。

---

## 2. 影響範囲（編集 / 新規ファイル一覧）

| ファイルパス | 種別 | 説明 |
|---|---|---|
| `lib/admob.ts` | 新規 | AdMob SDK 初期化・リワード広告表示ロジック |
| `lib/daily.ts` | 編集（追加） | `rewardedPlays` フィールド追加・関連関数追加 |
| `components/AdMobInit.tsx` | 新規 | SDK 初期化専用副作用コンポーネント |
| `components/WatchAdButton.tsx` | 新規 | 広告視聴ボタン UI コンポーネント |
| `app/layout.tsx` | 編集 | `AdMobInit` コンポーネントを全ページ共通に追加 |
| `app/games/calculation/page.tsx` | 編集 | `remaining` / `rewardedRemaining` state・`WatchAdButton` 組み込み |
| `app/games/memory-number/page.tsx` | 編集 | 同上 |
| `app/games/stroop/page.tsx` | 編集 | 同上 |
| `app/games/reaction/page.tsx` | 編集 | 同上 |
| `app/games/pattern/page.tsx` | 編集 | 同上 |
| `app/api/record-score/route.ts` | 編集（追加） | サーバー側プレイ上限チェック（`MAX_PLAYS_PER_DAY = 6`）追加 |
| `android/app/src/main/AndroidManifest.xml` | 編集 | AdMob App ID `<meta-data>` 追加・パーミッション追加 |

---

## 3. ファイル別変更詳細

---

### 3.1 `lib/admob.ts`（新規作成）

**実装内容**

- `@capacitor-community/admob` の `AdMob` クラスと `RewardAdPluginEvents` を使用
- `"use client"` ディレクティブを先頭に宣言（Next.js クライアントコンポーネント専用モジュール）
- テスト用広告 ID を定数として定義し、本番差し替え時の変更箇所を一箇所に集約する
- `initAdMob()`: SDK 初期化関数。ネイティブ環境のみ動作。
- `showRewardedAd()`: 広告表示関数。Promise で結果を返す。先着イベントを採用する `settled` フラグパターンを使用。

**定数定義**

```typescript
const TEST_APP_ID = "ca-app-pub-3940256099942544~3347511713";   // テスト用（未使用・参照用）
const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917"; // テスト用リワード広告ユニット ID

export const REWARDED_AD_UNIT_ID = TEST_REWARDED_ID; // 本番差し替え時はここを変更
```

**関数シグネチャと処理ロジック**

```typescript
export async function initAdMob(): Promise<void>
```

処理手順:
1. `Capacitor.isNativePlatform()` が `false` の場合、即リターン（Web 環境は何もしない）
2. `AdMob.initialize({ testingDevices: [], initializeForTesting: true })` を呼ぶ
3. 例外が発生した場合は `console.warn("[AdMob] initialize failed:", e)` を出力してサイレント続行

```typescript
export async function showRewardedAd(): Promise<boolean>
```

処理手順:
1. `Capacitor.isNativePlatform()` が `false` の場合、即 `true` を返す（Web バイパス）
2. `AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID })` を呼ぶ
3. `new Promise<boolean>` を作成し、内部で以下を実行する:
   a. `settled = false` フラグを初期化する
   b. `done(result: boolean)` ヘルパーを定義する:
      - `settled === true` の場合: 何もせずリターン（先着イベント以外を無視）
      - `settled = true` にセットする
      - `rewardHandle` / `dismissHandle` の両リスナーを `.remove()` で除去する
      - `resolve(result)` で Promise を解決する
   c. `RewardAdPluginEvents.Rewarded` リスナーを登録し、発火時に `done(true)` を呼ぶ
   d. `RewardAdPluginEvents.Dismissed` リスナーを登録し、発火時に `done(false)` を呼ぶ
   e. `AdMob.showRewardVideoAd()` を呼ぶ
4. `prepareRewardVideoAd` またはその後の処理で例外が発生した場合: `console.warn` を出力し `false` を返す

---

### 3.2 `lib/daily.ts`（編集：`rewardedPlays` 対応追加）

**実装内容**

- 既存の `DailyRecord` インターフェースに `rewardedPlays` フィールドを追加する
- `getRemainingPlays()` の残り回数計算式に `rewardedEarned` を加算する
- `getRewardedRemaining()` 新規追加: 広告視聴で残り追加可能回数を返す
- `recordRewardedPlay()` 新規追加: 広告視聴で得たプレイ権利を localStorage に記録する

**定数定義**

```typescript
export const MAX_PLAYS_PER_DAY = 3
export const MAX_REWARDED_PLAYS_PER_DAY = 3

const KEY_DAILY = "braingame_daily"
const KEY_HISTORY = "braingame_daily_history"
```

**データ構造定義**

```typescript
interface DailyRecord {
  date: string                                      // "YYYY-MM-DD" 形式
  plays: Partial<Record<GameId, number>>            // ゲームIDごとのプレイ済み回数
  bestScores: Partial<Record<GameId, number>>       // 本日のゲームIDごとのベストスコア
  rewardedPlays?: Partial<Record<GameId, number>>   // 広告視聴で獲得した追加プレイ権利数
}
```

`rewardedPlays` フィールドは省略可能（`?`）であり、広告機能追加前の既存 localStorage データとの後方互換性を確保している。

**関数シグネチャと処理ロジック**

```typescript
function loadDaily(): DailyRecord
```
処理手順:
1. `typeof window === "undefined"` の場合（SSR）: `{ date: today(), plays: {}, bestScores: {} }` を返す
2. `localStorage.getItem(KEY_DAILY)` で JSON を取得する
3. パース結果の `date` が `today()` と一致する場合: パース結果をそのまま返す
4. 一致しない場合（日付変更）または null の場合: `{ date: today(), plays: {}, bestScores: {} }` を返す（リセット）
5. 例外発生時: `{ date: today(), plays: {}, bestScores: {} }` を返す

```typescript
function saveDaily(record: DailyRecord): void
```
処理手順:
1. `localStorage.setItem(KEY_DAILY, JSON.stringify(record))` を呼ぶ

```typescript
export function getRemainingPlays(gameId: GameId): number
```
処理手順:
1. `loadDaily()` で DailyRecord を取得する
2. `totalPlays = record.plays[gameId] ?? 0` を計算する
3. `rewardedEarned = record.rewardedPlays?.[gameId] ?? 0` を計算する
4. `Math.max(0, MAX_PLAYS_PER_DAY + rewardedEarned - totalPlays)` を返す
   - 基本3回 + 広告で獲得した回数 - 既にプレイした回数（最小値 0）

```typescript
export function getRewardedRemaining(gameId: GameId): number
```
処理手順:
1. `loadDaily()` で DailyRecord を取得する
2. `used = record.rewardedPlays?.[gameId] ?? 0` を計算する
3. `Math.max(0, MAX_REWARDED_PLAYS_PER_DAY - used)` を返す
   - まだ広告視聴で追加できる回数（最小値 0）

```typescript
export function recordRewardedPlay(gameId: GameId): void
```
処理手順:
1. `loadDaily()` で DailyRecord を取得する
2. `record.rewardedPlays` が未定義の場合: `{}` で初期化する
3. `record.rewardedPlays[gameId]` を `(現在値 ?? 0) + 1` にセットする
4. `saveDaily(record)` で保存する

```typescript
export function canPlay(gameId: GameId): boolean
```
処理手順:
1. `getRemainingPlays(gameId) > 0` を返す

---

### 3.3 `components/AdMobInit.tsx`（新規作成）

**実装内容**

- `"use client"` ディレクティブを先頭に宣言する
- `useEffect` で `initAdMob()` を1回だけ呼ぶ副作用専用コンポーネントである
- レンダリング出力は `null`（DOM に何も描画しない）

**コンポーネント定義**

```typescript
"use client";
import { useEffect } from "react";
import { initAdMob } from "@/lib/admob";

export default function AdMobInit(): null
```

処理手順:
1. `useEffect(() => { initAdMob(); }, [])` で初回マウント時に1回だけ `initAdMob()` を呼ぶ
2. `return null` で何もレンダリングしない

---

### 3.4 `components/WatchAdButton.tsx`（新規作成）

**実装内容**

- `"use client"` ディレクティブを先頭に宣言する
- `loading` / `failed` の2つのローカル state を持つ
- 広告視聴成功時: `recordRewardedPlay(gameId)` → `onRewarded()` を呼ぶ
- 広告視聴失敗時: `setFailed(true)` でエラーメッセージを表示する
- `rewardedRemaining === 0` のとき: 「明日また挑戦しよう！」に切り替わる

**Props 型定義**

```typescript
interface Props {
  gameId: GameId;           // 対象ゲームID
  rewardedRemaining: number; // 残り広告視聴可能回数
  onRewarded: () => void;   // 報酬付与後に親コンポーネントへ通知するコールバック
}
```

**コンポーネント定義**

```typescript
export default function WatchAdButton({
  gameId,
  rewardedRemaining,
  onRewarded,
}: Props): JSX.Element
```

**ローカル state**

```typescript
const [loading, setLoading] = useState(false);  // 広告ロード中フラグ
const [failed, setFailed] = useState(false);    // 広告失敗フラグ
```

**handleClick 処理ロジック**

```typescript
const handleClick = async (): Promise<void>
```
処理手順:
1. `setLoading(true)` にする
2. `setFailed(false)` にリセットする
3. `const rewarded = await showRewardedAd()` を呼ぶ
4. `rewarded === true` の場合:
   a. `recordRewardedPlay(gameId)` で localStorage に記録する
   b. `onRewarded()` で親コンポーネントへ通知する
5. `rewarded === false` の場合:
   a. `setFailed(true)` でエラーメッセージを表示する
6. `setLoading(false)` にする

**レンダリングロジック**

```
<div className="text-center space-y-3">
  上限達した旨のメッセージ:
    "本日のプレイ上限（{MAX_REWARDED_PLAYS_PER_DAY * 2}回）に達しました"  // 6回と表示

  rewardedRemaining > 0 の場合:
    <button onClick={handleClick} disabled={loading}>
      loading ? "広告読み込み中..." : `📺 広告を見て+1プレイ（あと${rewardedRemaining}回）`
    </button>
    failed === true の場合:
      <p>広告を読み込めませんでした。もう一度お試しください。</p>

  rewardedRemaining === 0 の場合:
    <p>明日また挑戦しよう！</p>
</div>
```

---

### 3.5 `app/layout.tsx`（編集）

**実装内容**

- `AdMobInit` コンポーネントを `import` し `<body>` 内の先頭に配置する
- これにより全ゲームページ・全ルートで AdMob SDK が初回マウント時に自動初期化される

**変更箇所**

```typescript
import AdMobInit from "@/components/AdMobInit";
import BGMProvider from "@/components/BGMProvider";  // BGM 機能追加により追記

// RootLayout の <body> 内:
<body>
  <AdMobInit />
  <BGMProvider>
    {children}
  </BGMProvider>
</body>
```

> **注意**: `BGMProvider` は本設計書のスコープ外の追加実装（BGM 機能）である。`AdMobInit` が `BGMProvider` の外側に配置されていることで、AdMob 初期化は BGM の状態に依存しない。BGMProvider の仕様詳細は別途作成予定の設計書を参照すること。

---

### 3.6 `app/games/*/page.tsx`（5ファイル編集：共通パターン）

全5ゲーム（calculation / memory-number / stroop / reaction / pattern）で同一パターンを適用する。

**追加 import**

```typescript
import {
  recordPlay,
  getRemainingPlays,
  MAX_PLAYS_PER_DAY,
  getRewardedRemaining,
  recordRewardedPlay,  // WatchAdButton 内で使用するため import（ゲームページ側では直接呼ばない）
} from "@/lib/daily";
import WatchAdButton from "@/components/WatchAdButton";
```

**追加 state**

```typescript
const [remaining, setRemaining] = useState<number>(MAX_PLAYS_PER_DAY);
const [rewardedRemaining, setRewardedRemaining] = useState(0);
```

**初期化 useEffect への追加**

既存の `useEffect` 内（`[]` 依存配列の初回実行）に以下を追加する:
```typescript
setRemaining(getRemainingPlays(gameId));
setRewardedRemaining(getRewardedRemaining(gameId));
```

**endGame() 内への追加**

ゲーム終了時に `remaining` を更新する:
```typescript
recordPlay(gameId, currentScore);
setRemaining(getRemainingPlays(gameId));
```

**ready フェーズのレンダリング変更**

```typescript
{remaining > 0 ? (
  <button onClick={startGame} className="btn-primary w-full text-lg">
    スタート（残り{remaining}回）
  </button>
) : (
  <WatchAdButton
    gameId={gameId}
    rewardedRemaining={rewardedRemaining}
    onRewarded={() => {
      setRemaining(getRemainingPlays(gameId));
      setRewardedRemaining(getRewardedRemaining(gameId));
    }}
  />
)}
```

注意: 各ゲームページの `gameId` は文字列リテラルで直接指定する（例: `gameId="calculation"`）

---

### 3.7 `app/api/record-score/route.ts`（編集）

**実装内容**

- サーバー側でもプレイ上限チェックを行い、クライアント改ざんへの二重防衛とする
- 既存のスコアバリデーション・DB 書き込みロジックに加え、`MAX_PLAYS_PER_DAY = 6` での上限チェックを追加する

**追加定数**

```typescript
const MAX_PLAYS_PER_DAY = 6; // 3 base + 3 rewarded（コメントで明示）
```

**上限チェック処理（DB アクセス後に実行）**

処理手順:
1. `daily_plays` テーブルから `play_count` を取得する:
   ```sql
   SELECT play_count FROM daily_plays
   WHERE user_id = ? AND game_id = ? AND play_date = ?
   ```
2. レコードが存在しない場合は `currentPlayCount = 0` とする
3. `currentPlayCount >= MAX_PLAYS_PER_DAY` の場合: HTTP 429 を返す:
   ```json
   { "success": false, "error": "daily play limit exceeded" }
   ```
4. 上限未満の場合: `saveScoreToDb` / `recordDailyPlay` / `updateDailyHistory` を実行する

---

### 3.8 `android/app/src/main/AndroidManifest.xml`（編集）

**実装内容**

- AdMob App ID を `<meta-data>` として `<application>` ブロック内に宣言する
- ネットワーク通信に必要なパーミッションを `<manifest>` ブロック内に宣言する

**追加内容**

```xml
<!-- application ブロック内 -->
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-3940256099942544~3347511713" />
<!-- 本番リリース時はこの value を本番 App ID に差し替えること -->

<!-- manifest ブロック内 -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

## 4. データ構造定義（完全版）

### 4.1 DailyRecord（`lib/daily.ts`）

```typescript
interface DailyRecord {
  date: string
  // "YYYY-MM-DD" 形式。今日の日付と一致しない場合は全体がリセットされる

  plays: Partial<Record<GameId, number>>
  // キー: ゲームID（例: "calculation"）
  // 値: そのゲームを本日プレイした総回数
  // リワードプレイ含む全プレイをカウント

  bestScores: Partial<Record<GameId, number>>
  // キー: ゲームID
  // 値: 本日のベストスコア

  rewardedPlays?: Partial<Record<GameId, number>>
  // キー: ゲームID
  // 値: 広告視聴によって獲得した追加プレイ権利数（消費済み回数ではない）
  // 省略可能: 未定義の場合は全ゲームで 0 として扱う
}
```

### 4.2 残り回数計算式

```
getRemainingPlays(gameId) =
  Math.max(0, MAX_PLAYS_PER_DAY + rewardedEarned - totalPlays)
  = Math.max(0, 3 + rewardedPlays[gameId] - plays[gameId])

getRewardedRemaining(gameId) =
  Math.max(0, MAX_REWARDED_PLAYS_PER_DAY - rewardedPlays[gameId])
  = Math.max(0, 3 - rewardedPlays[gameId])
```

例: plays=2, rewardedPlays=1 の場合
- getRemainingPlays = Math.max(0, 3 + 1 - 2) = 2
- getRewardedRemaining = Math.max(0, 3 - 1) = 2

例: plays=3, rewardedPlays=0 の場合（基本上限到達）
- getRemainingPlays = Math.max(0, 3 + 0 - 3) = 0 → WatchAdButton 表示
- getRewardedRemaining = Math.max(0, 3 - 0) = 3

例: plays=6, rewardedPlays=3 の場合（完全上限到達）
- getRemainingPlays = Math.max(0, 3 + 3 - 6) = 0
- getRewardedRemaining = Math.max(0, 3 - 3) = 0 → 「明日また挑戦しよう！」表示

### 4.3 WatchAdButton Props

```typescript
interface Props {
  gameId: GameId;           // "calculation" | "memory-number" | "stroop" | "reaction" | "pattern"
  rewardedRemaining: number; // 0 以上の整数。0 のとき「明日また挑戦しよう！」表示
  onRewarded: () => void;   // 報酬付与後にゲームページが remaining / rewardedRemaining state を更新するためのコールバック
}
```

---

## 5. エラー処理方針

| 状況 | 動作 | ユーザーへの表示 |
|---|---|---|
| `initAdMob()` 失敗（SDK 初期化エラー） | `console.warn` のみ。アプリは続行 | なし（サイレント） |
| `prepareRewardVideoAd()` 失敗（広告ロードエラー） | `showRewardedAd()` が `false` を返す | WatchAdButton に「広告を読み込めませんでした。もう一度お試しください。」 |
| `Dismissed` が `Rewarded` より先着 | `done(false)` → `showRewardedAd()` が `false` を返す | 同上。リトライ可能 |
| localStorage パース失敗 | `try/catch` でデフォルト `DailyRecord` を返す。ゲーム続行可能 | なし（サイレント） |
| `typeof window === "undefined"` (SSR) | デフォルト `DailyRecord` を返す | なし |
| `/api/record-score` が 429 を返す | クライアント側でのスコア保存失敗（ランキングに反映されない） | ResultModal での通知は現状なし（スコア表示自体は行われる） |
| `/api/record-score` が 500 を返す | 同上 | 同上 |

---

## 6. 注意事項（リスク事項）

### 注意1 [高] テスト ID の本番移行が必須

現在、以下の3箇所にテスト専用の値が設定されている。本番リリース前に必ず差し替えること。
詳細は「7. 本番リリース時の手順」を参照。

### 注意2 [中] Dismissed / Rewarded イベント順序問題

- Google 直接配信広告では `onUserEarnedReward（Rewarded）` が `onAdDismissedFullScreenContent（Dismissed）` の**前**に発火することが保証されている
- ただし**メディエーション（サードパーティ広告ネットワーク）利用時は順序が保証されない**
- 現実装では `settled` フラグにより**先着イベントを採用**するため、`Dismissed` が先着した場合は `done(false)` となり報酬が付与されない
- メディエーションを有効にする場合は、`Dismissed` 単独では即座に `done(false)` を呼ばず、一定時間（例: 500ms）待って `Rewarded` が来なかった場合に限り `false` にする方式に変更することを推奨する

### 注意3 [中] Web 環境での広告バイパス

- `Capacitor.isNativePlatform()` が `false` の場合（Vercel 等の Web 環境）、`showRewardedAd()` は常に `true` を返す
- Web ユーザーは広告なしで1日の追加プレイを全て取得できる状態である
- これが意図的な仕様か否かを確認の上、Web 版での制限方針を別途決定すること

---

## 7. 本番リリース時の手順

本番 APK を Google Play Store に提出する前に、必ず以下の手順を実施すること。

### 手順 1: AdMob コンソールでアプリ・広告ユニットを登録する

1. [AdMob コンソール](https://apps.admob.com/) にログインする
2. 「アプリを追加」からアプリを登録し、**本番 App ID**（形式: `ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN`）を取得する
3. 「広告ユニット」から「リワード」タイプの広告ユニットを作成し、**本番広告ユニット ID**（形式: `ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN`）を取得する

### 手順 2: `lib/admob.ts` を編集する

変更対象ファイル: `C:\project\BrainGame\lib\admob.ts`

(a) テスト広告ユニット ID を本番 ID に差し替える:
```typescript
// 変更前
const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";
export const REWARDED_AD_UNIT_ID = TEST_REWARDED_ID;

// 変更後（本番 ID は AdMob コンソールで取得した値を使用）
const REWARDED_AD_UNIT_ID_PROD = "ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN"; // 本番ID
export const REWARDED_AD_UNIT_ID = REWARDED_AD_UNIT_ID_PROD;
```

(b) `initializeForTesting: true` を削除または `false` に変更する:
```typescript
// 変更前
await AdMob.initialize({
  testingDevices: [],
  initializeForTesting: true,
});

// 変更後
await AdMob.initialize({
  testingDevices: [],
  initializeForTesting: false,
});
// または initializeForTesting キー自体を省略してもよい
```

### 手順 3: `android/app/src/main/AndroidManifest.xml` を編集する

変更対象ファイル: `C:\project\BrainGame\android\app\src\main\AndroidManifest.xml`

```xml
<!-- 変更前 -->
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-3940256099942544~3347511713" />

<!-- 変更後（本番 App ID に差し替え） -->
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN" />
```

### 手順 4: 実機テスト（本番 ID で動作確認）

1. `npx cap sync android` でネイティブプロジェクトを同期する
2. `npx cap run android` またはリリースビルドで実機インストールを行う
3. 広告が実際に表示されること（テスト広告ではなく実広告）を確認する
4. 広告視聴後に残りプレイ回数が増加することを確認する
5. 上限到達後に「明日また挑戦しよう！」が表示されることを確認する

---

## 8. テスト観点

### 8.1 正常系

| # | テスト内容 | 確認方法 |
|---|---|---|
| T01 | アプリ起動時に AdMob SDK が初期化される | `console.warn` が出ないこと。logcat でエラーなし |
| T02 | 残りプレイ回数が 3 の状態でスタートボタンが表示される | 初回起動後 ready 画面で確認 |
| T03 | ゲームをプレイするたびに残りプレイ回数が 1 減る | 3回プレイ後に残り 0 になること |
| T04 | 残り 0 になったとき WatchAdButton が表示される | ready 画面で「広告を見て+1プレイ（あと3回）」ボタンが出ること |
| T05 | 広告視聴後に残りプレイ回数が 1 増え、すぐプレイできる | 広告視聴後にスタートボタンが表示される |
| T06 | 広告視聴を 3 回行った後「明日また挑戦しよう！」が表示される | 6回プレイ後のスクリーンで確認 |
| T07 | 日付をまたいでアプリを起動すると制限がリセットされる | 翌日に残りプレイが 3 に戻ること |
| T08 | 5つのゲーム全てで独立したプレイ回数が管理される | ゲーム A の残り 0 がゲーム B に影響しないこと |
| T09 | Web 版（Vercel）でも広告バイパスで追加プレイができる | ブラウザで確認 |

### 8.2 異常系

| # | テスト内容 | 確認方法 |
|---|---|---|
| T10 | 広告ロード失敗時にエラーメッセージが表示される | 機内モードで広告ボタンを押す |
| T11 | エラー後にリトライが可能（ボタンが再度押せる） | T10 の後に再度押せること |
| T12 | 広告を閉じただけ（報酬なし）では残り回数が増えない | 広告をスキップ/閉じてスキップした場合 |
| T13 | サーバー側 API で 429 が返ってもアプリがクラッシュしない | localhost 制限をオーバーした状態で確認 |
| T14 | localStorage が破損していてもゲームが起動できる | localStorage を不正な JSON で上書き後に起動 |

### 8.3 境界値テスト

| # | テスト内容 | 確認方法 |
|---|---|---|
| T15 | 残りプレイ 1 の状態でプレイすると直後に残り 0 になる | 2回プレイ後の ready 画面 |
| T16 | rewardedPlays が 3 のとき getRewardedRemaining が 0 を返す | localStorage を直接確認 |
| T17 | plays > MAX_PLAYS_PER_DAY + rewardedPlays の場合 getRemainingPlays が 0 を返す（負にならない） | localStorage で plays=10 を強制設定して確認 |
| T18 | 広告視聴ボタン連打してもリワードが二重付与されない | `loading` state が `true` の間ボタンが `disabled` になること |
| T19 | サーバー API で `play_count` が 6 のとき 429 を返す | `play_count = 6` のレコードで POST を送る |

---

## 9. 完了条件チェックリスト

### 機能要件

- [ ] `lib/admob.ts` が存在し、`initAdMob()` / `showRewardedAd()` / `REWARDED_AD_UNIT_ID` を export している
- [ ] `lib/daily.ts` に `rewardedPlays` フィールドを含む `DailyRecord` が定義されている
- [ ] `lib/daily.ts` に `getRewardedRemaining()` / `recordRewardedPlay()` が存在する
- [ ] `components/AdMobInit.tsx` が存在し、`app/layout.tsx` でマウントされている
- [ ] `components/WatchAdButton.tsx` が存在し、Props 型が設計通りである
- [ ] 全5ゲームページに `remaining` / `rewardedRemaining` state が存在する
- [ ] 全5ゲームページで `remaining === 0` のとき `WatchAdButton` が表示される
- [ ] `WatchAdButton` の `onRewarded` コールバックで両 state が更新される
- [ ] `app/api/record-score/route.ts` で `MAX_PLAYS_PER_DAY = 6` のサーバー側チェックが実装されている
- [ ] `AndroidManifest.xml` に AdMob App ID の `<meta-data>` と必要なパーミッションが宣言されている

### 品質要件

- [ ] TypeScript コンパイルエラーがない（`npx tsc --noEmit` でエラーなし）
- [ ] `"use client"` が `lib/admob.ts` / `components/AdMobInit.tsx` / `components/WatchAdButton.tsx` の先頭に存在する
- [ ] `showRewardedAd()` 内でイベントリスナーが必ず除去される（`done()` 関数内）
- [ ] 正常系・異常系テスト観点 T01-T19 を全て手動確認済み

### 本番リリース前チェック（リリース時に確認）

- [ ] `lib/admob.ts` の `REWARDED_AD_UNIT_ID` が本番広告ユニット ID に差し替えられている
- [ ] `lib/admob.ts` の `initializeForTesting: true` が削除または `false` に変更されている
- [ ] `AndroidManifest.xml` の `com.google.android.gms.ads.APPLICATION_ID` が本番 App ID に差し替えられている
- [ ] 実機テスト T01-T09 が本番 ID で全て PASS している
