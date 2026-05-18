---
project_id: "2026-05-18-1000-sync-design-to-impl"
phase: qa
overall_status: partial
---
# テストレポート - 2026-05-18-1000-sync-design-to-impl

## 総合判定
- 結果: partial
- 設計準拠率: 6/8

---

## テスト観点別結果

| # | 観点 | 結果 | 根拠 |
|---|------|------|------|
| 1 | ランキング上限20件 | ✅ pass | 設計書1500 §3 ステップ2c「上位 20 件」(行274)・T-24「21 ユーザー分」(行1031)ともに修正済み。設計書内に「30件」の記述はGrepで0件確認。実装 `lib/db-scores.ts` の `.slice(0, 20)` (行101, 135) と一致。 |
| 2 | getUserRanksFromDb 関数仕様の追記と実装一致 | ⚠️ partial | 設計書1500 §3 末尾(行381-401)に関数仕様は追記されている。ただし設計書の「処理フロー手順1: `getRankingsFromDb()` が返す結果から検索する」という記述は実装と乖離している。実装(`lib/db-scores.ts` 行142-217)は `getRankingsFromDb()` を呼ばず、独立したDBクエリを直接実行して全件ソートしている。関数シグネチャ・引数・戻り値型は一致。 |
| 3 | SyncResponse 型の myGameRanks / myOverallRank フィールド記載 | ✅ pass | 設計書1500 §0 SyncResponse インターフェース(行75-76)に `myGameRanks` と `myOverallRank` が追記されている。実装 `lib/db-types.ts` 経由で `app/api/sync/route.ts` (行69-70) の構造と一致している。 |
| 4 | /api/sync の Promise.all が5引数(getUserRanksFromDb含む) | ✅ pass | 設計書1500 §4 ステップ5(行429-435)に `getUserRanksFromDb(userId)` を含む5引数の Promise.all が記載されている。実装 `app/api/sync/route.ts`(行56-63)と一致。 |
| 5 | DailyRecord 型に rewardedPlays フィールド追記 | ✅ pass | 設計書2357 「データ構造定義 > DailyRecord」(行665-670)に `rewardedPlays?: Partial<Record<GameId, number>>` が追記されている。実装 `lib/daily.ts`(行14)と一致。 |
| 6 | BGMProvider の追記が rewarded-ad 設計書に含まれているか | ✅ pass | 設計書0900 §3.5(行292-304)に BGMProvider の import とラップ構造が追記され、注意書きも記載されている。実装 `app/layout.tsx`(行3-4, 14-18)と一致。 |
| 7 | 修正不要設計書(1400, 1600, 1000-privacy-policy)が変更されていないか | ✅ pass | work-log.md に「実装コードへの変更: なし（設計書のみ修正）」と明記されており、これら3設計書は修正対象外として記録されている。変更対象は 1500, 2357, 0900 の3ファイルのみ。 |
| 8 | 設計書内の記述に矛盾や誤字がないか | ❌ fail | 以下2件の矛盾を検出。詳細は「発見した問題」セクションを参照。 |

---

## 発見した問題

### 問題1: getUserRanksFromDb の処理フロー記述が実装と乖離（設計書1500 §3）

**深刻度**: 中

**設計書の記述**（行389-401、特に行389）:
> 1. `getRankingsFromDb()` が返す `gameRankings` と `overallRanking` を取得する（内部で再計算するのではなく、全体ランキングの結果から検索する）

> 注意: `getRankingsFromDb()` の内部では全スコアを取得してメモリ上でソートしているため、`getUserRanksFromDb()` は必ず `getRankingsFromDb()` の後に、またはその結果を受け取る形で呼び出すこと（`/api/sync` では Promise.all で並列実行し、結果から順位を検索している）。

**実装の実態**（`lib/db-scores.ts` 行142-217）:
- `getUserRanksFromDb()` は `getRankingsFromDb()` を呼ばず、独立したSQLクエリ（全件取得）を実行している
- 全体ランキングと同一の集計・ソート処理をこの関数内でも行っている（DBアクセスが2倍になる設計）
- `/api/sync` の Promise.all では並列実行しているため、「結果から順位を検索」という記述は実際には行われていない

**影響**: 設計書を読んだ開発者が将来 `getUserRanksFromDb()` を修正する際、`getRankingsFromDb()` の結果を渡すよう実装しようとする可能性があり、バグや再実装の混乱を招く。

---

### 問題2: `getUserGameRankEntry()` / `getUserOverallRankEntry()` の関数シグネチャが設計書と実装で不一致（設計書1500 §8）

**深刻度**: 高

**設計書の記述**（行691-704）:
```typescript
export function getUserGameRankEntry(
  syncData: SyncResponse,
  gameId: GameId
): RankEntry | undefined {
  return syncData.myGameRanks?.[gameId];
}

export function getUserOverallRankEntry(
  syncData: SyncResponse
): OverallEntry | null {
  return syncData.myOverallRank ?? null;
}
```

**実装の実態**（`lib/scores.ts` 行219-286）:
```typescript
export function getUserGameRankEntry(gameId: GameId, nickname: string): RankEntry | null
export function getUserOverallRankEntry(nickname: string): OverallEntry | null
```

- 引数が全く異なる（`SyncResponse` 引数ではなく `nickname: string` ベース）
- これらの関数は localStorage のランキングデータから nickname で検索する実装である
- `app/rankings/page.tsx`(行7)でimportはされているが、実際の呼び出しはなく、`syncData.myGameRanks` / `syncData.myOverallRank` を直接使用している（行42-43）

**影響**: 設計書に記述された関数シグネチャが実装と完全に異なる。設計書を参照した開発者が `syncData` を渡す形で呼び出そうとするとコンパイルエラーになる。設計書の修正（1-E）の意図（SyncResponseヘルパー関数を追記）は正しいが、既存の実装が異なる設計方針になっているため、設計書の記述内容自体が実装と合っていない。

---

## PM への申し送り

- **完了とみなしてよいか**: 条件付き。主要な観点（1〜7）のうち6/8はpassまたはpartial。問題2の `getUserGameRankEntry()` / `getUserOverallRankEntry()` のシグネチャ不一致は設計書として誤情報を含むため、再修正を推奨。

- **残課題**:
  1. **要修正（高）**: 設計書1500 §8 の `getUserGameRankEntry()` / `getUserOverallRankEntry()` の関数シグネチャを実際の実装（`nickname: string` ベース）に合わせて修正するか、あるいは実装を設計書記述通り（`SyncResponse` ベース）に変更するか、方針を決定して反映すること。
  2. **要修正（中）**: 設計書1500 §3 の `getUserRanksFromDb()` 処理フロー「手順1」および末尾の「注意」を実際の実装（独立したDBクエリを実行する）に合わせて記述を修正すること。
  3. **情報（low）**: `app/rankings/page.tsx` が `getUserGameRankEntry` / `getUserOverallRankEntry` をimportしているが呼び出していない（未使用import）。TypeScriptのビルドには影響しないが、将来の混乱を避けるためimportを削除するか使用するかを整理すること。
  4. BGM 機能（`components/BGMProvider.tsx`）の設計書新規作成が後続タスクとして未着手であることを確認・登録すること。
  5. `app/page.tsx` の `remainingPlays` 計算（リワード未考慮）の修正チケットが必要かどうかをPMに確認すること。

---

## 再検証（差し戻し後）

**再検証日時**: 2026-05-18

### 問題1: getUserRanksFromDb の処理フロー記述（設計書1500 §3）

**結果**: pass

**確認内容**:
設計書1500 §3 の `getUserRanksFromDb` 処理フロー（行381-417）を確認。
「手順1: `getRankingsFromDb()` を呼ばずに、独立した DB クエリを直接実行する」と明記されており（行389）、末尾の注意書き（行417）にも「独立した DB クエリを発行する。これにより `/api/sync` が `Promise.all` で両関数を並列実行できる」と記載されている。

実装（`lib/db-scores.ts` 行142-217）と照合:
- 独立した DB クエリ（行147-156）を直接発行 → 設計書と一致
- `gameMap` / `userBests` を構築してゲーム別・総合の順位を算出 → 設計書の手順2〜4と一致
- `sorted.findIndex((e) => e.userId === userId)` でゲーム別順位を特定 → 設計書手順3と一致
- `sortedOverall.find((e) => e.userId === userId)` で総合順位を取得 → 設計書手順4と一致

設計書の記述が実装の実態（独立クエリ方式）と完全に一致している。前回指摘の「`getRankingsFromDb()` の結果から検索する」という旧記述は修正済み。

---

### 問題2: getUserGameRankEntry / getUserOverallRankEntry のシグネチャ（設計書1500 §8）

**結果**: pass

**確認内容**:
設計書1500 §8（行699-748）を確認。関数シグネチャが以下の通り記載されている:
```typescript
export function getUserGameRankEntry(gameId: GameId, nickname: string): RankEntry | null
export function getUserOverallRankEntry(nickname: string): OverallEntry | null
```
`nickname: string` ベースのシグネチャが明示されており、旧記述（`syncData: SyncResponse` を引数に取る形）は削除されている。

実装（`lib/scores.ts` 行219・244）と照合:
- `getUserGameRankEntry(gameId: GameId, nickname: string): RankEntry | null` → 完全一致
- `getUserOverallRankEntry(nickname: string): OverallEntry | null` → 完全一致

さらに設計書には `app/rankings/page.tsx` が `syncData.myGameRanks` / `syncData.myOverallRank` を直接参照する旨も注記（行730-748）として記載されており、`rankings/page.tsx` の実装（行42-43）と一致している。

---

### 総合判定の更新

| 観点 | 初回 | 再検証 |
|------|------|--------|
| 問題1: getUserRanksFromDb 処理フロー | partial | pass |
| 問題2: getUserGameRankEntry / getUserOverallRankEntry シグネチャ | fail | pass |
| その他観点 1〜7（初回判定） | 6/8 pass/partial | 変更なし |

**総合判定**: **pass**（全8観点すべて pass）

---

### PM への最終申し送り

差し戻し対象の2件が修正済みであることを確認した。

- **問題1（中）**: 設計書1500 §3 の `getUserRanksFromDb` 処理フロー記述が「独立した DB クエリを直接実行する」方式に修正されており、実装と一致。
- **問題2（高）**: 設計書1500 §8 の `getUserGameRankEntry` / `getUserOverallRankEntry` シグネチャが `nickname: string` ベースに修正されており、実装と一致。`rankings/page.tsx` が `syncData.myGameRanks` を直接参照する旨の注記も追加されている。

本プロジェクト（2026-05-18-1000-sync-design-to-impl）の設計書-実装整合性検証はすべて完了。
初回レポートで挙げた残課題（未使用 import の整理、BGMProvider 設計書作成、remainingPlays 修正チケット）は引き続き後続タスクとして管理すること。
