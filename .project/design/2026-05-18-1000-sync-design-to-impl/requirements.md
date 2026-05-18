---
project_id: "2026-05-18-1000-sync-design-to-impl"
phase: design
doc_type: requirements
created: "2026-05-18"
---

# 要件定義書: 詳細設計書と実装の差分同期

## 1. 背景・目的

情報収集フェーズ（research/topics/2026-05-18-1000-sync-design-to-impl.md）により、
既存の詳細設計書 6 本と実装コードの間に差分があることが判明した。

差分の主な原因は「設計書策定後に追加実装された機能」であり、設計書が実装を追い切れていない状態。
これを解消し、設計書を「現状の正しい仕様書」として機能させることが本プロジェクトの目的。

---

## 2. 修正対象設計書一覧と優先度

| # | 設計書 ID | ステータス | 優先度 | 修正理由 |
|---|-----------|-----------|--------|---------|
| 1 | 2026-05-11-1500-turso-user-sync | 要修正 | 高 | ランキング上限の不一致（30件→20件）、設計書にない関数・フィールドが複数追加されている。最も差分が多い。 |
| 2 | 2026-05-11-2357-bug-fix-play-count-ranking | 要修正 | 中 | DailyRecord 型に `rewardedPlays?` フィールドが未記載。テスト観点コメントと実装ロジックの不一致（`>=` vs `>`）。 |
| 3 | 2026-05-12-0900-rewarded-ad-monetization | 要修正 | 中 | `app/layout.tsx` の変更後仕様に BGMProvider の追加が未記載。 |
| 4 | 2026-05-11-1400-codebase-review-qa | 修正不要 | — | 実装と完全一致。変更なし。 |
| 5 | 2026-05-11-1600-mobile-security-audit | 修正不要 | — | 実装と完全一致。変更なし。（app/api/sync/route.ts の「完全な After」コードに getUserRanksFromDb が既に含まれており、実装と一致している） |
| 6 | 2026-05-12-1000-privacy-policy | 修正不要 | — | 実装と完全一致。変更なし。 |

---

## 3. 新規設計書の要否（設計書未記載の新規実装）

| 機能 | ファイル | 新規設計書の要否 | 判断根拠 |
|------|---------|----------------|---------|
| BGM 機能（BGMProvider） | `components/BGMProvider.tsx` | 必要（別チケット） | 独立した機能で本タスクの設計書修正スコープ外。別プロジェクト ID で設計書を新規作成すること。本タスクでは影響箇所（app/layout.tsx）に参照メモを追記するのみとする。 |
| ランキング画面スケルトン表示 | `app/rankings/page.tsx` | 不要 | `2026-05-11-1500-turso-user-sync` の §12 に rankings/page.tsx の変更仕様が記載されており、スケルトン表示はその UI 実装詳細として同設計書の修正内に含めて記載できる。 |
| `remainingPlays` 計算の不整合 | `app/page.tsx` | 不要（現状追認） | 現在の実装（MAX_PLAYS_PER_DAY=3 固定）は `rewardedPlays` を考慮しないため厳密には仕様と乖離しているが、DB 同期後の残り回数表示という用途において致命的バグではない。設計書で「既知の制限事項」として記録するにとどめる。 |
| `app/actions/user.ts` の `recordScore` 残留 | `app/actions/user.ts` | 不要（廃止方針記載） | 実際の呼び出しルートは `/api/record-score` に移行済みで、Server Action 版は実質的に未使用。設計書に「廃止予定」として記録する。 |

---

## 4. 受け入れ条件

| ID | 条件 | 検証方法 |
|---|------|---------|
| AC-01 | `2026-05-11-1500-turso-user-sync/detailed-design.md` のランキング上限が「30件」から「20件」に修正されている | ファイル全文の「30件」が「20件」に変更されていることを確認 |
| AC-02 | `2026-05-11-1500-turso-user-sync/detailed-design.md` に `getUserRanksFromDb()` 関数仕様が記載されている | §3 に関数シグネチャ・処理フロー・戻り値型が追記されていることを確認 |
| AC-03 | `2026-05-11-1500-turso-user-sync/detailed-design.md` の `SyncResponse` 型に `myGameRanks` / `myOverallRank` フィールドが追記されている | §0 の `SyncResponse` 定義を確認 |
| AC-04 | `2026-05-11-1500-turso-user-sync/detailed-design.md` に `getUserGameRankEntry()` / `getUserOverallRankEntry()` 関数仕様が記載されている | §8 に追記されていることを確認 |
| AC-05 | `2026-05-11-1500-turso-user-sync/detailed-design.md` に `/api/sync` の5並列フェッチ（`getUserRanksFromDb` 追加）が記載されている | §4 の Promise.all が5引数になっていることを確認 |
| AC-06 | `2026-05-11-1500-turso-user-sync/detailed-design.md` に `remainingPlays` 計算の既知制限が「注記」として記載されている | §10 に注記が追加されていることを確認 |
| AC-07 | `2026-05-11-1500-turso-user-sync/detailed-design.md` に rankings/page.tsx のスケルトン表示が記載されている | §12 に記載されていることを確認 |
| AC-08 | `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md` の `DailyRecord` 型に `rewardedPlays?` フィールドが追記されている | データ構造定義セクションを確認 |
| AC-09 | `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md` の T-12 テスト観点コメントが実装通りの「`>` 条件（同値は上書きしない）」に修正されている | テスト観点テーブルを確認 |
| AC-10 | `2026-05-12-0900-rewarded-ad-monetization/detailed-design.md` の §3.5 に BGMProvider が追記されている | `<body>` 内のコード例を確認 |
| AC-11 | 修正後の設計書間に型定義の矛盾がない（SyncResponse, DailyRecord） | 設計書を横断してフィールド定義を照合 |
