---
project_id: "2026-05-18-1000-sync-design-to-impl"
phase: research
created: "2026-05-18"
---

# 情報収集レポート: 詳細設計書と実装の差分調査

## 結論サマリー

- 全6設計書の主要機能は実装済みであり、設計書との乖離は概ね「設計書を超えた追加機能」に起因する
- 最大の差分は `2026-05-11-1500-turso-user-sync` と `2026-05-11-1600-mobile-security-audit` で、設計書にない `getUserRanksFromDb()` 関数・`myGameRanks`/`myOverallRank` フィールドが追加実装されている
- ランキング上限は設計書の「30件」ではなく実装では「20件」が採用されている（scores.ts・db-scores.ts 両方）
- `app/actions/user.ts` の `recordScore` は設計書通り残存しているが、実際の呼び出しルートは `app/api/record-score/route.ts` に切り替わっており、recordScore の MAX_PLAYS_PER_DAY = 3 制限は実質的に機能していない
- BGM 機能（BGMProvider）は設計書が存在しない新規実装
- `useDbSync` の `DailyRecord` 型は設計書が `rewardedPlays` フィールドを含むよう定義しているが、実装では省略されている（軽微な型不一致）

---

## 設計書別 差分サマリー

### 2026-05-11-1400-codebase-review-qa
- 状態: 一致
- 差分概要: GRID=5、セルサイズ w-12 h-12、TOTAL=GRID*GRID、repeat(${GRID}, 1fr) いずれも設計書通り実装済み。ベンチマーク値変更なし（設計書でも変更しない方針）も一致。

### 2026-05-11-1500-turso-user-sync
- 状態: 要修正（設計書を超えた追加実装あり）
- 差分概要:
  - ランキング上限が設計書「30件」に対し実装「20件」
  - `db-scores.ts` に設計書にない `getUserRanksFromDb()` 関数が追加
  - `db-types.ts` の `SyncResponse` に設計書にない `myGameRanks`・`myOverallRank` フィールドが追加
  - `scores.ts` にも設計書にない `getUserGameRankEntry()`・`getUserOverallRankEntry()` 関数が追加
  - `/api/sync` が設計書の4並列フェッチに加え `getUserRanksFromDb()` を5番目に追加
  - `app/page.tsx` の syncData 処理で `remainingPlays` の計算が `MAX_PLAYS_PER_DAY` 固定（リワード考慮なし）

### 2026-05-11-1600-mobile-security-audit
- 状態: 一致（設計書通り）
- 差分概要: uuid バリデーション・スコア範囲チェック・ニックネーム文字種チェック・Turso タイムアウト・CORS ヘッダー・OPTIONS ハンドラ、すべて設計書通り実装済み。`capacitor.config.ts` の server.url 追加も実装済みと推定（未確認ファイル）。

### 2026-05-11-2357-bug-fix-play-count-ranking
- 状態: 一致（設計書通り）
- 差分概要: `app/api/record-score/route.ts` 新規作成、`lib/scores.ts` の fetch 切り替え、`hooks/useDbSync.ts` の `mergeDailyPlaysToStorage` 追加、いずれも設計書通り実装済み。`app/stats/page.tsx` への `useDbSync` 追加も確認済み。

### 2026-05-12-0900-rewarded-ad-monetization
- 状態: 一致（設計書通り）
- 差分概要: `lib/admob.ts`・`components/AdMobInit.tsx`・`components/WatchAdButton.tsx` 新規作成、全5ゲームページへの `WatchAdButton` 組み込み、`app/api/record-score/route.ts` の `MAX_PLAYS_PER_DAY = 6` 設定、いずれも設計書通り実装済み。

### 2026-05-12-1000-privacy-policy
- 状態: 一致（設計書通り）
- 差分概要: `app/privacy-policy/page.tsx` 新規作成（全12セクション完備）、`app/page.tsx` のプライバシーポリシーリンク追加、`NicknameModal.tsx` の同意チェックボックス追加・disabled 条件変更、すべて設計書通り実装済み。

---

## 設計書に未記載の新規実装

### BGM 機能（BGMProvider）
- ファイル: `components/BGMProvider.tsx`
- 内容: `/music/gameplay_town_theme.mp3` をループ再生する BGMProvider コンポーネント。ミュート状態を localStorage (`bgm_muted`) で永続化。ゲームプレイ中は `pause()`、結果画面・準備画面では `resume()` が各ゲームページから呼ばれる。`app/layout.tsx` に組み込まれ全ページ共通適用。Android の play() Promise 競合回避ロジックも実装済み。
- 設計書: 存在しない

### ランキングページの「あなたの順位」表示機能
- ファイル: `app/rankings/page.tsx`、`lib/db-scores.ts`、`lib/db-types.ts`
- 内容: ログインユーザーが全件ランキングで何位かを取得・表示する `getUserRanksFromDb()` / `getUserGameRankEntry()` / `getUserOverallRankEntry()` 関数群。SyncResponse に `myGameRanks`・`myOverallRank` フィールドを追加。ランキングページで「あなたの順位」セクションを表示する。
- 設計書 2026-05-11-1500 ではランキング取得は `getRankingsFromDb()` のみで、ユーザー個別順位取得は記載なし

### ランキング画面のスケルトン表示
- ファイル: `app/rankings/page.tsx`
- 内容: DB 取得完了まで `RankingSkeleton` コンポーネントを表示。`loading && !syncData` 条件でスケルトンが出現し、データ取得後に実データに切り替わる。
- 設計書: 記載なし（設計書では localStorage をフォールバックとして使用する方針だった）

### ランキング上限の20件化
- ファイル: `lib/scores.ts`（行136-137）、`lib/db-scores.ts`（行101、136）
- 内容: ゲーム別ランキングも総合ランキングも `.slice(0, 20)` で20件に制限
- 設計書 2026-05-11-1500 では「上位30件」と明記

### app/page.tsx の remainingPlays 計算方法の乖離
- ファイル: `app/page.tsx` 行59-63
- 内容: syncData から残り回数を計算する際に `MAX_PLAYS_PER_DAY`（=3）固定で計算しており、リワードプレイ数（rewardedPlays）を加算していない
- 設計書 2026-05-11-1500 では `getAllRemainingPlays()` を使う方針だったが、syncData 経由では `play?.playCount` のみ参照している

---

## 設計書別 詳細差分

---

### 2026-05-11-1400-codebase-review-qa の差分詳細

#### 一致している点
- `app/games/pattern/page.tsx`: `const GRID = 5`（L15）
- `const TOTAL = GRID * GRID`（L16）
- `Math.min(lvl + 2, TOTAL - 1)`（L54、L108）
- `gridTemplateColumns: repeat(${GRID}, 1fr)`（L166）
- セルクラス `w-12 h-12`（L173）
- `lib/scores.ts`・`lib/daily.ts`・`lib/benchmarks.ts` に GRID 参照なし

#### 差分なし
設計書通りに完全実装済み。リグレッションリスクも現時点では問題なし。

---

### 2026-05-11-1500-turso-user-sync の差分詳細

#### record-score API の実際のシグネチャ
設計書では `app/actions/user.ts` の Server Action `recordScore` を直接呼び出す設計だったが、後続の `2026-05-11-2357-bug-fix-play-count-ranking` 設計書で `/api/record-score` API Route に切り替え済み。
現在の実際の呼び出しルート: `lib/scores.ts` の `saveScore()` 内の `fetch("/api/record-score", { method: "POST", ... })`

#### db-scores.ts の実際の関数一覧
設計書記載の関数:
- `saveScoreToDb()` - 実装済み（一致）
- `getPersonalBestsFromDb()` - 実装済み（一致）
- `getRankingsFromDb()` - 実装済み（ランキング上限20件 ≠ 設計書30件）
- `recordDailyPlay()` - 実装済み（一致）
- `updateDailyHistory()` - 実装済み（一致）
- `getDailyPlaysFromDb()` - 実装済み（一致）
- `getDailyHistoryFromDb()` - 実装済み（一致）

設計書にない追加関数:
- `getUserRanksFromDb(userId)` - 新規追加。全ランキング内でのユーザー個別順位を返す

#### scores.ts のランキング上限
| 箇所 | 設計書 | 実装 |
|------|--------|------|
| `getGameRanking()` | 30件 | **20件**（`.slice(0, 20)` L136） |
| `getOverallRanking()` | 30件 | **20件**（`.slice(0, 20)` L215） |
| `db-scores.ts` `getRankingsFromDb()` | 30件 | **20件**（`.slice(0, 20)` L101、L136） |

#### daily.ts の実際のプレイ上限値
- `MAX_PLAYS_PER_DAY = 3`（設計書通り）
- `MAX_REWARDED_PLAYS_PER_DAY = 3`（設計書通り）

#### db-types.ts の SyncResponse 型
設計書記載:
```typescript
interface SyncResponse {
  personalBests, gameRankings, overallRanking, dailyPlays, dailyHistory
}
```
実装（追加フィールドあり）:
```typescript
interface SyncResponse {
  personalBests, gameRankings, overallRanking, dailyPlays, dailyHistory,
  myGameRanks: Partial<Record<GameId, RankEntry>>;   // 追加
  myOverallRank: OverallEntry | null;                 // 追加
}
```

#### hooks/useDbSync.ts の DailyRecord 型定義
設計書（2026-05-11-2357）が定義する DailyRecord:
```typescript
interface DailyRecord {
  date: string;
  plays: Partial<Record<GameId, number>>;
  bestScores: Partial<Record<GameId, number>>;
}
```
`rewardedPlays` フィールドが省略されている。`lib/daily.ts` の実際の DailyRecord は `rewardedPlays?` を含むが、`useDbSync.ts` 内の型定義では省略。`mergeDailyPlaysToStorage` は `plays` と `bestScores` のみ操作するため機能上の問題はないが、型の不一致がある。

#### app/page.tsx の syncData 処理
設計書では `getAllRemainingPlays()` でリワード込み残り回数を初期値として使う方針。
実装の syncData 処理（行59-63）は:
```typescript
remaining[id] = Math.max(0, MAX_PLAYS_PER_DAY - (play?.playCount ?? 0));
```
リワードプレイを考慮せず `MAX_PLAYS_PER_DAY = 3` 固定。DB 同期時にリワード済みユーザーの残り回数が過小表示される可能性がある。

---

### 2026-05-11-1600-mobile-security-audit の差分詳細

#### 一致している点
- `app/actions/user.ts`: UUID_REGEX、NICKNAME_REGEX、SCORE_LIMITS、MAX_PLAYS_PER_DAY=3、すべて設計書通り
- `upsertUser()`: UUID 形式チェック → ニックネームチェック → 文字種チェック → 年齢チェック の順序が一致
- `recordScore()`: gameId チェック → スコア範囲チェック → DB 参照レート制限チェック の順序が一致
- `lib/db.ts`: 10秒タイムアウト付き fetch オプションが実装済み
- `/api/sync/route.ts`: CORS ヘッダー・OPTIONS ハンドラが実装済み
- `ALLOWED_ORIGINS = ["capacitor://localhost", "http://localhost"]` が一致

#### 注意点
`app/actions/user.ts` の `recordScore` 内 `MAX_PLAYS_PER_DAY = 3` はリワード広告追加後も 3 のまま。一方 `app/api/record-score/route.ts` では `MAX_PLAYS_PER_DAY = 6`。`recordScore` Server Action は現在 `lib/scores.ts` から直接呼ばれていないため実質的には問題ないが、設計書に記載がない不整合。

---

### 2026-05-11-2357-bug-fix-play-count-ranking の差分詳細

#### 一致している点
- `app/api/record-score/route.ts`: 設計書の完全なコードと一致（POST + OPTIONS、CORS、バリデーション、DB 書き込み、429）
- `lib/scores.ts`: `fetch("/api/record-score", ...)` への切り替えが完了
- `hooks/useDbSync.ts`: `mergeDailyPlaysToStorage()` 関数追加・`fetchData` 内での呼び出し追加が完了
- `app/stats/page.tsx`: `useDbSync({ interval: null })` 追加・`syncData` 依存 useEffect 追加が完了

#### 軽微な差分
設計書の `mergeDailyPlaysToStorage` のコメント（行35）「DB のプレイ数 >= ローカルのプレイ数 の場合のみ上書き」は、実装では `>` 条件（厳密に大きい場合のみ）で実装されており、設計書コメントと実装ロジックに軽微な不一致がある。テスト観点 T-12「DB とローカルが同じ場合は上書きしない（> 条件）」は実装通りが正しい。

---

### 2026-05-12-0900-rewarded-ad-monetization の差分詳細

#### 一致している点
- `lib/admob.ts`: `initAdMob()`・`showRewardedAd()`・`REWARDED_AD_UNIT_ID` の実装が設計書通り
- `components/AdMobInit.tsx`: useEffect で initAdMob() を1回のみ呼び出し、return null
- `components/WatchAdButton.tsx`: Props 型、handleClick ロジック、レンダリング条件が設計書通り
- `lib/daily.ts`: `rewardedPlays` フィールド追加、`getRewardedRemaining()`・`recordRewardedPlay()`・`canPlay()` 関数追加が設計書通り
- `app/layout.tsx`: `<AdMobInit />` を `<body>` 先頭に配置（BGMProvider の外側）
- `app/api/record-score/route.ts`: `MAX_PLAYS_PER_DAY = 6` でサーバー側上限チェック実装済み
- 全5ゲームページ: `remaining`・`rewardedRemaining` state、`WatchAdButton` 組み込み、`onRewarded` コールバックが設計書通り

#### 設計書との微細差分
設計書の `app/layout.tsx` は:
```html
<body>
  <AdMobInit />
  {children}
</body>
```
実装の `app/layout.tsx` は:
```html
<body>
  <AdMobInit />
  <BGMProvider>
    {children}
  </BGMProvider>
</body>
```
BGMProvider が追加されているが、これは設計書にない新機能（BGM）の追加であり、AdMobInit の位置は設計書通り。

---

### 2026-05-12-1000-privacy-policy の差分詳細

#### 一致している点
- `app/privacy-policy/page.tsx`: 設計書の完全なコードと一致（12セクション、Server Component、ヘルパーコンポーネント同一ファイル定義）
- `app/page.tsx`: プライバシーポリシーリンク追加（行210-213）が設計書通り
- `components/NicknameModal.tsx`: `agreed` state、チェックボックス JSX、disabled 条件変更がすべて設計書通り
- `import Link from "next/link"` の追加も一致

#### 差分なし
設計書通りに完全実装済み。

---

## 設計者への申し送り

### 2026-05-11-1400-codebase-review-qa
- 更新不要。実装は設計書通り完了している。

### 2026-05-11-1500-turso-user-sync
1. **ランキング上限を30件→20件に修正**: 設計書本文（T-24）は「30件」と記載しているが、実装では20件が採用されている。設計書を「20件」に修正するか、実装を30件に戻すか意思決定が必要
2. **`getUserRanksFromDb()` 関数の追加を設計書に記載**: 設計書 §3 に `getUserRanksFromDb(userId)` の関数仕様を追記
3. **`SyncResponse` 型の `myGameRanks`・`myOverallRank` フィールドを追記**: 設計書 §0「共通型定義」の SyncResponse に2フィールドを追記
4. **`scores.ts` の新規関数を追記**: `getUserGameRankEntry()`・`getUserOverallRankEntry()` の追加を設計書 §8 に記載
5. **`app/page.tsx` の syncData 処理でのリワード未考慮を修正検討**: 残り回数計算が `MAX_PLAYS_PER_DAY = 3` 固定になっており、リワードプレイ済みユーザーの DB 同期後残り回数が過小表示される可能性がある

### 2026-05-11-1600-mobile-security-audit
1. **設計書更新は最小限で良い**: 実装は設計書通り完成している
2. **付記: `app/actions/user.ts` の `recordScore` の MAX_PLAYS_PER_DAY = 3 を将来設計書に記録**: 実際の呼び出しルートは `/api/record-score` になっているが、`recordScore` Server Action 自体は残存している。廃止・統合の方針を設計書に記録しておくと将来の混乱を防げる

### 2026-05-11-2357-bug-fix-play-count-ranking
1. **`hooks/useDbSync.ts` の `DailyRecord` 型定義に `rewardedPlays?` を追記**: 設計書 §データ構造定義 の DailyRecord に `rewardedPlays?: Partial<Record<GameId, number>>` フィールドを追加すること（`lib/daily.ts` の型と一致させる）
2. **テスト観点 T-12 のコメントを修正**: 「DB >= ローカルの場合のみ上書き」ではなく「DB > ローカルの場合のみ上書き（同値は上書きしない）」に修正

### 2026-05-12-0900-rewarded-ad-monetization
1. **`app/layout.tsx` の変更後仕様を更新**: 設計書 §3.5 の `<body>` 内コードに BGMProvider の追加を反映
2. **本番リリースチェックリストを定期確認**: テスト ID・`initializeForTesting: true` の本番差し替えが未実施（設計書の注意1に記載済みだが、未対応のまま）

### 2026-05-12-1000-privacy-policy
1. **更新不要**: 実装は設計書通り完全に完了している
