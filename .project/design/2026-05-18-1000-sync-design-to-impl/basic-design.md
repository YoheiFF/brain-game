---
project_id: "2026-05-18-1000-sync-design-to-impl"
phase: design
doc_type: basic-design
created: "2026-05-18"
---

# 基本設計書: 詳細設計書と実装の差分同期

## 1. 設計書修正の全体方針

### 原則

1. **実装を正として設計書を更新する**: 実装済みコードが動作していることが確認されているため、設計書を実装に合わせる方向で修正する。実装を設計書に戻す（リバート）はしない。
2. **既存の設計書構造を維持する**: セクション番号・見出し・フォーマットは既存のスタイルに合わせる。新規セクションを追加する場合は既存セクションの末尾に付加する。
3. **追加実装は「追記」で対応する**: 既存の記述を消さず、差分のある箇所に追記・修正を行う。
4. **コード例は実装と一致させる**: 設計書内のコードブロック（TypeScript / SQL）は実際の実装と一致するよう書き直す。

### 修正対象外の設計書

以下の設計書は実装と完全一致しているため、修正しない。

- `2026-05-11-1400-codebase-review-qa`（全ファイル）
- `2026-05-11-1600-mobile-security-audit`（全ファイル）
- `2026-05-12-1000-privacy-policy`（全ファイル）

---

## 2. 修正対象ファイル一覧

| # | 修正対象ファイルパス | 修正量 |
|---|---------------------|--------|
| 1 | `.project/design/2026-05-11-1500-turso-user-sync/detailed-design.md` | 大（複数セクション） |
| 2 | `.project/design/2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md` | 小（2箇所） |
| 3 | `.project/design/2026-05-12-0900-rewarded-ad-monetization/detailed-design.md` | 小（1箇所） |

---

## 3. 各設計書の修正範囲概要

### 3-1. `2026-05-11-1500-turso-user-sync/detailed-design.md`（修正量: 大）

修正範囲は以下のセクションに集中する。

#### §0「共通型定義」— SyncResponse 型の修正

`SyncResponse` インターフェースに実装で追加された2フィールドを追記する。

```typescript
// 修正前
interface SyncResponse {
  personalBests, gameRankings, overallRanking, dailyPlays, dailyHistory
}

// 修正後
interface SyncResponse {
  personalBests, gameRankings, overallRanking, dailyPlays, dailyHistory,
  myGameRanks: Partial<Record<GameId, RankEntry>>;   // 追加
  myOverallRank: OverallEntry | null;                 // 追加
}
```

#### §3「lib/db-scores.ts」— `getUserRanksFromDb()` 関数の追加

設計書に記載のない `getUserRanksFromDb(userId)` 関数の仕様を新規セクションとして追記する。

#### §4「app/api/sync/route.ts」— 5並列フェッチへの修正

`Promise.all` に `getUserRanksFromDb(userId)` を5番目に追加し、レスポンス構築に `myGameRanks` / `myOverallRank` を追加する。

#### §8「lib/scores.ts」— 新規関数の追記

設計書に記載のない `getUserGameRankEntry()` / `getUserOverallRankEntry()` 関数仕様を追記する。

#### ランキング上限値の修正（全体）

設計書全体で「上位30件」と記載されている箇所をすべて「上位20件」に修正する（T-24 テストケースも含む）。

#### §10「app/page.tsx」— 既知制限事項の注記追加

`remainingPlays` 計算が `MAX_PLAYS_PER_DAY=3` 固定（リワードプレイ未考慮）であることを既知の制限として注記する。

#### §12「app/rankings/page.tsx」— スケルトン表示の記載追加

`loading && !syncData` 条件でスケルトンコンポーネントを表示する仕様を追記する。

#### 設計書への廃止予定機能の記録

`app/actions/user.ts` の `recordScore` Server Action が現在は `/api/record-score` API Route に置き換えられており、直接呼び出しルートが存在しないことを注記する。

---

### 3-2. `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md`（修正量: 小）

#### データ構造定義セクション — DailyRecord 型の修正

`rewardedPlays?` フィールドを `DailyRecord` 定義に追記する（`lib/daily.ts` の実際の型と一致させる）。

#### テスト観点 T-12 のコメント修正

「DB のプレイ数 >= ローカルのプレイ数 の場合のみ上書き」を「DB のプレイ数 > ローカルのプレイ数 の場合のみ上書き（同値は上書きしない）」に修正する。

---

### 3-3. `2026-05-12-0900-rewarded-ad-monetization/detailed-design.md`（修正量: 小）

#### §3.5「app/layout.tsx」— BGMProvider の追記

`<body>` 内のコード例に `BGMProvider` を追加する。実装と一致した状態に更新する。

---

## 4. 修正影響のないファイル

修正作業では以下のファイルを変更しない。

- `requirements.md`（各設計書の）
- `basic-design.md`（各設計書の）
- 実装コード（`app/`, `lib/`, `components/`, `hooks/` 配下のすべて）

---

## 5. 修正後の整合性確認ポイント

### 型定義の整合性

修正後に以下の型定義がすべての設計書で一致していることを確認する。

| 型 | 修正対象設計書 | 確認内容 |
|---|--------------|---------|
| `SyncResponse` | 2026-05-11-1500 | `myGameRanks` / `myOverallRank` フィールドあり |
| `DailyRecord` | 2026-05-11-2357 | `rewardedPlays?` フィールドあり |
| ランキング上限 | 2026-05-11-1500 | 全出現箇所で「20件」 |

### ファイル間参照の整合性

| 参照元設計書 | 参照先 | 確認内容 |
|------------|--------|---------|
| 2026-05-11-1500 §4 | db-scores.ts | `getUserRanksFromDb` の呼び出しが Promise.all に含まれている |
| 2026-05-12-0900 §3.5 | layout.tsx | BGMProvider のコード例が実装と一致している |
