---
project_id: "2026-05-18-1000-sync-design-to-impl"
created: "2026-05-18"
status: completed
qa_result: pass
---

# 最終報告書 - 2026-05-18-1000-sync-design-to-impl

## 依頼
既存の全詳細設計書（6プロジェクト）を現時点の実装内容に合わせて修正する。

---

## 情報収集 主要発見

- 全6設計書のうち修正が必要だったのは3件（1500, 2357, 0900）
- 最大の乖離は `1500-turso-user-sync`：`getUserRanksFromDb()` 関数・`SyncResponse` 型フィールド追加・ランキング上限30件→20件など8箇所
- BGM機能（`BGMProvider`）は設計書が存在しない新規実装として検出

---

## 設計書修正結果

影響範囲: 3ファイル（設計書） / 14箇所

### 修正内容サマリー

| 設計書 | 修正箇所数 | 主な修正内容 |
|--------|-----------|-------------|
| `2026-05-11-1500-turso-user-sync` | 10箇所（初回8 + QA対応2） | ランキング上限30→20件、getUserRanksFromDb関数追記、SyncResponse型更新、Promise.all 5引数化、スケルトン表示追記、recordScore廃止注記 |
| `2026-05-11-2357-bug-fix-play-count-ranking` | 3箇所 | DailyRecord型にrewardedPlays追加、mergeDailyPlaysToStorageの>条件修正 |
| `2026-05-12-0900-rewarded-ad-monetization` | 1箇所 | layout.tsxへのBGMProvider追記 |
| `2026-05-11-1400-codebase-review-qa` | 0箇所 | 変更なし（実装と一致） |
| `2026-05-11-1600-mobile-security-audit` | 0箇所 | 変更なし（実装と一致） |
| `2026-05-12-1000-privacy-policy` | 0箇所 | 変更なし（実装と一致） |

---

## テスト

総合判定: **pass**（8/8観点 pass）
test-report: `.project/qa/2026-05-18-1000-sync-design-to-impl/test-report.md`

---

## 残課題・次のアクション提案

1. **BGM設計書の新規作成**（推奨）
   - `BGMProvider.tsx` は設計書が存在しない
   - 推奨プロジェクトID: `2026-05-18-XXXX-bgm-provider`

2. **`recordScore` Server Action の削除検討**
   - `app/actions/user.ts` の `recordScore` は `/api/record-score` に移行済みで実質未使用
   - 削除すれば `MAX_PLAYS_PER_DAY=3` の混在リスクがなくなる

3. **`remainingPlays` 計算の修正検討**
   - `app/page.tsx` の `syncData` 処理でリワードプレイ数が未考慮
   - ゲームカードの「残りN回」が過小表示になる可能性あり

4. **`getUserGameRankEntry` / `getUserOverallRankEntry` の方針決定**
   - `lib/scores.ts` に存在するが `rankings/page.tsx` から未使用
   - 削除 or 活用のいずれかを決定することを推奨
