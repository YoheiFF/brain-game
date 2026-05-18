---
project_id: "2026-05-18-1000-sync-design-to-impl"
phase: engineering
---
# 実装ログ - 2026-05-18-1000-sync-design-to-impl

## 編集ファイル一覧

| ファイル | 操作 | 完了 | 備考 |
|---------|------|------|------|
| `.project/design/2026-05-11-1500-turso-user-sync/detailed-design.md` | 編集 | ✅ | 修正 1-A〜1-H（8箇所） |
| `.project/design/2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md` | 編集 | ✅ | 修正 2-A〜2-B（3箇所） |
| `.project/design/2026-05-12-0900-rewarded-ad-monetization/detailed-design.md` | 編集 | ✅ | 修正 3-A（1箇所） |

---

## ファイル別詳細

### `2026-05-11-1500-turso-user-sync/detailed-design.md`

#### 修正 1-A: SyncResponse 型への2フィールド追加
- `myGameRanks: Partial<Record<GameId, RankEntry>>` を追加
- `myOverallRank: OverallEntry | null` を追加
- 実装（`lib/db-types.ts`）と一致させた

#### 修正 1-B: ランキング上限値を30件→20件に修正（全出現箇所）
- §3 `getRankingsFromDb` の処理フロー ステップ2c: 「上位 30 件」→「上位 20 件」
- §13 境界値テスト T-24: 「ランキング 30 件上限 / 31 ユーザー」→「ランキング 20 件上限 / 21 ユーザー」
- 整合性確認: 「30件」の記載が設計書内でゼロになったことをGrepで確認済み

#### 修正 1-C: `getUserRanksFromDb()` 関数の追加
- `getDailyHistoryFromDb` の後に新規関数仕様を追記
- 引数・戻り値・処理フロー5ステップ・注意事項を記載
- 実装（`lib/db-scores.ts` 行142-217）と照合済み

#### 修正 1-D: `/api/sync` の5並列フェッチへの修正
- ステップ5の `Promise.all` に `getUserRanksFromDb(userId)` を3番目に追加
- ステップ6のレスポンス構築に `myGameRanks` / `myOverallRank` を追加
- 実装（`app/api/sync/route.ts` 行56-73）と照合済み

#### 修正 1-E: `scores.ts` の新規関数を §8 に追記
- `getUserGameRankEntry()` / `getUserOverallRankEntry()` の関数仕様を §8 末尾に追記
- 実装（`app/rankings/page.tsx` での利用）と照合済み

#### 修正 1-F: `app/page.tsx` の既知制限事項を注記として追加
- `syncData` 処理のコード例の後に注記ブロックを追加
- `remainingPlays` 計算で `rewardedPlays` が考慮されていない旨を記録
- 「実害は限定的」「後続フェーズで修正予定」を明記

#### 修正 1-G: ランキング画面のスケルトン表示を §12 に追記
- `RankingSkeleton` コンポーネントの表示条件（`loading && !syncData`）を記述
- localStorage フォールバック方針からスケルトン表示方針への変更理由を記録
- 実装（`app/rankings/page.tsx` 行79）と照合済み

#### 修正 1-H: `recordScore` Server Action の廃止予定注記を追加
- §5 `recordScore` 関数説明の末尾に Deprecated 注記を追加
- `/api/record-score` への移行済み・`MAX_PLAYS_PER_DAY=3` が実質未使用の事実を記録
- 将来的な `recordScore` 削除の推奨を記載

---

### `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md`

#### 修正 2-A: DailyRecord 型に `rewardedPlays?` フィールドを追記
- `rewardedPlays?: Partial<Record<GameId, number>>` を型定義に追加
- `lib/daily.ts` の実際の型定義と一致させた（省略可フィールド）

#### 修正 2-B: T-12 テスト観点のコメントを修正
- T-12の期待結果: 「`>` 条件で弾く」→「`>` 条件: DB > ローカルの場合のみ上書き。同値は上書きしない」
- `mergeDailyPlaysToStorage` JSDoc コメント: 「`>=`」→「`>`」条件に修正
- 実装（`hooks/useDbSync.ts` 行425）の `>` 条件と一致させた

---

### `2026-05-12-0900-rewarded-ad-monetization/detailed-design.md`

#### 修正 3-A: §3.5 の `app/layout.tsx` コード例に BGMProvider を追加
- `BGMProvider` の import 追加（コード例に反映）
- `<body>` 内のコード例を `BGMProvider` でラップした形に更新
- `AdMobInit` が `BGMProvider` 外側に配置される構造を維持
- 注記「BGMProvider は本設計書スコープ外・別途設計書作成予定」を追記
- 実装（`app/layout.tsx`）と照合済み

---

## 「設計書未記載の新規実装」セクション追記の記録

以下のセクションを設計書末尾に追記した（本作業ログに記録）:
- `2026-05-11-1500-turso-user-sync/detailed-design.md` §8末尾: `getUserGameRankEntry()` / `getUserOverallRankEntry()` 関数仕様
- `2026-05-11-1500-turso-user-sync/detailed-design.md` §12末尾: ランキング画面スケルトン表示仕様
- `2026-05-12-0900-rewarded-ad-monetization/detailed-design.md` §3.5末尾: BGMProvider 参照メモと注意事項

BGM 機能（`components/BGMProvider.tsx`）は設計書が存在しない新規実装のため、
別プロジェクト ID（推奨: `2026-05-18-XXXX-bgm-provider`）での設計書新規作成を推奨する。

---

## QA 指摘対応（2026-05-18）

### 修正 QA-1: `getUserRanksFromDb()` 処理フローを実装に合わせて書き直し

- **対象**: `2026-05-11-1500-turso-user-sync/detailed-design.md` §3 `getUserRanksFromDb()` 処理フロー
- **修正前**: 「`getRankingsFromDb()` の結果を受け取って検索する」という記述（全体ランキング関数への委譲モデル）
- **修正後**: 独立した DB クエリを直接実行するフローを詳細記述
  - SQL（`getRankingsFromDb()` と同一クエリ）を明示
  - `gameMap` / `userBests` 構築 → ゲーム別 `findIndex` → 総合 `sortedOverall.find` の処理ステップを明確化
  - `/api/sync` での `Promise.all` 並列実行のため独立クエリ化していることを注意書きに追記
  - ロジック同期の必要性（将来の変更時）も注意書きに明記

### 修正 QA-2: `getUserGameRankEntry()` / `getUserOverallRankEntry()` の仕様を実装に合わせて書き直し

- **対象**: `2026-05-11-1500-turso-user-sync/detailed-design.md` §8 `getUserGameRankEntry()` / `getUserOverallRankEntry()` セクション
- **修正前**: 引数が `syncData: SyncResponse` であり `syncData.myGameRanks` を参照するラッパー関数として記述
- **修正後**:
  - 実際のシグネチャ `(gameId: GameId, nickname: string): RankEntry | null` / `(nickname: string): OverallEntry | null` に変更
  - localStorage のランキングデータから指定ニックネームを検索する関数である旨を正確に記述
  - 各関数の処理フロー（`loadRankings()` → `bestMap` 構築 → ソート → `findIndex/find`）を追記
  - `app/rankings/page.tsx` での実際の利用方法を注意書きに追記:
    - `rankings/page.tsx` はこれらの関数を使わず `syncData.myGameRanks` / `syncData.myOverallRank` を直接参照している
    - `myGameRanks` / `myOverallRank` は `/api/sync` → `getUserRanksFromDb()` が DB から取得する
    - `getUserGameRankEntry` / `getUserOverallRankEntry` は `lib/scores.ts` に定義済みだが現在 `rankings/page.tsx` から未使用

---

## 全体サマリー

- 修正完了: 3 ファイル（初回）+ 1 ファイル（QA 対応）
- 修正箇所: 合計 14 箇所（1-A〜1-H, 2-A〜2-B, 3-A, QA-1〜QA-2）
- 実装コードへの変更: なし（設計書のみ修正）

### 修正内容の要点
1. `SyncResponse` 型・`/api/sync` エンドポイント・`getUserRanksFromDb()` 関数の追加実装を設計書に反映
2. ランキング上限「30件」→「20件」を全出現箇所で統一（設計書1500のみ）
3. `DailyRecord` 型への `rewardedPlays?` フィールド追加を設計書に反映
4. `mergeDailyPlaysToStorage` の `>` 条件（同値は上書きしない）を正確に記述
5. `app/layout.tsx` に BGMProvider が追加された実装を設計書に反映
6. 廃止予定の `recordScore` Server Action・既知制限事項・スケルトン表示方針変更を注記として記録
7. [QA対応] `getUserRanksFromDb()` 処理フローを「独立 DB クエリ」ベースの実装に合わせて書き直し
8. [QA対応] `getUserGameRankEntry` / `getUserOverallRankEntry` を localStorage/nickname ベースの実際のシグネチャ・処理フローに修正し、`rankings/page.tsx` が syncData を直接参照している旨を注記

### QA への申し送り
- 設計書1500の「30件」記載がゼロになったことを全文検索で確認すること
- 設計書1500の `SyncResponse` と設計書1600の `SyncResponse` 型に矛盾がないか確認すること（1600は設計書通りであり修正不要だが、整合性チェックとして）
- 設計書2357と設計書0900の両方に `rewardedPlays?` が含まれていることを確認すること
- BGM 機能の設計書新規作成が後続タスクとして登録されているか確認すること
- `app/page.tsx` の `remainingPlays` 計算（リワード未考慮）の修正チケットが必要かどうかを PM に確認すること
- `getUserGameRankEntry` / `getUserOverallRankEntry` の未使用状態（`rankings/page.tsx` から呼ばれていない）について、将来的な削除または活用方針を PM に確認すること
