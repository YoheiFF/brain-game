---
project_id: "2026-05-11-1400-codebase-review-qa"
phase: research
created: "2026-05-11"
---
# 情報収集レポート: BrainGame コードベース確認・pattern game グリッド変更検証

## 結論サマリー

チケット `2026-05-11-pattern-game-grid-5x5.md` に記載された変更内容と、未コミットの `app/games/pattern/page.tsx` の実装は **完全一致**している。`GRID = 5`・セルサイズ `w-12 h-12` の両変更が正確に適用されている。スコア記録・デイリー管理・ベンチマーク参照の各 lib は GRID 定数に無依存であり、今回の変更による影響を受けない。プロジェクト管理ファイル・секретарьTODO もチケット完了として正しく更新済み。コード品質・型安全性に問題は見当たらない。

---

## 確認済み事実

- [ファクト] `app/games/pattern/page.tsx` L13: `const GRID = 5` に変更済み（出典: `app/games/pattern/page.tsx`）
- [ファクト] `app/games/pattern/page.tsx` L159: セルクラスが `w-12 h-12` に変更済み（出典: `app/games/pattern/page.tsx`）
- [ファクト] `TOTAL = GRID * GRID` により総マス数は自動的に 25 になる（出典: `app/games/pattern/page.tsx` L14）
- [ファクト] グリッドレイアウトは `gridTemplateColumns: repeat(${GRID}, 1fr)` で動的生成のため 5 列レンダリングに自動対応（出典: `app/games/pattern/page.tsx` L152）
- [ファクト] パターン生成上限 `Math.min(lvl + 2, TOTAL - 1)` で最大 24 マスに制限される（出典: `app/games/pattern/page.tsx` L42, L96）
- [ファクト] `lib/scores.ts` の `POINTS_REF["pattern"] = 18`（20代平均基準）は GRID 変数に無依存（出典: `lib/scores.ts` L142）
- [ファクト] `lib/daily.ts` の `REFERENCE["pattern"] = 18` も GRID 変数に無依存（出典: `lib/daily.ts` L116）
- [ファクト] `lib/benchmarks.ts` の `BENCHMARKS["pattern"]` 全年代値は GRID 変数に無依存（出典: `lib/benchmarks.ts` L48-55）
- [ファクト] `.company/pm/projects/braingame.md` にチケット `2026-05-11-pattern-game-grid-5x5.md` が `[x]`（done）として登録済み（出典: `.company/pm/projects/braingame.md` L57）
- [ファクト] `.company/secretary/todos/2026-05-11.md` に「図形記憶グリッドを4×4→5×5に変更（難易度改善）完了: 2026-05-11」追記済み（出典: git diff）
- [ファクト] `getTotalPlayCount()` はゲーム種別ごとの履歴配列長を合計するため、GRID 変更の影響なし（出典: `lib/scores.ts` L202-209）
- [ファクト] デイリー残プレイ数管理（`MAX_PLAYS_PER_DAY = 3`）は pattern ゲームにも適用中（出典: `lib/daily.ts` L4）

---

## 推測・未確認

- [推測] セルサイズ `w-12`（48px）× 5列 + gap-2×4（8px）= 248px で `max-w-sm`（384px）に収まる計算はチケットに記載あり（336px 内に収まる旨）だが、実際のモバイル端末でのレイアウト崩れは未テスト（要検証）
- [推測] ベンチマーク値（20代平均 18点）はグリッド 4×4 時代の実績値に基づく可能性あり。5×5 化で難易度が変化したため平均スコアが変動する可能性あり（ベンチマーク値の再調整が必要か要観察）
- [推測] `npx tsc --noEmit` 実行でエラーなしとチケット完了条件に記載があるが、実行確認は未実施（要検証）

---

## 既存コードベースの関連箇所

- `app/games/pattern/page.tsx`: 図形記憶ゲーム本体。GRID 定数・パターン生成・セルレンダリング・スコア保存ロジック
- `lib/scores.ts`: スコア保存 (`saveScore`)・個人ベスト取得 (`getPersonalBest`)・ランキング計算。GRID に無依存
- `lib/daily.ts`: 1日3回プレイ制限管理・デイリー履歴記録 (`recordPlay`, `getRemainingPlays`)。GRID に無依存
- `lib/benchmarks.ts`: 年代別平均スコア参照 (`getBenchmark`)。pattern の 20代平均 = 18点。GRID に無依存
- `components/ResultModal.tsx`: ゲーム終了時リザルト表示コンポーネント（pattern ゲームで使用）
- `components/GameHeader.tsx`: ゲームヘッダ共通コンポーネント

---

## チケット設計 vs 実装の差分

| 項目 | チケット設計 | 現在の実装 | 一致 |
|------|------------|----------|------|
| GRID 定数 | `const GRID = 5` | `const GRID = 5` (L13) | ✅ |
| セルサイズ | `w-12 h-12`（48px） | `w-12 h-12` (L159) | ✅ |
| 最大マス数 | 24（TOTAL-1 = 25-1） | `Math.min(lvl+2, TOTAL-1)` (L42) | ✅ |
| グリッド列数 | 5列自動対応 | `repeat(${GRID}, 1fr)` (L152) | ✅ |
| tsc エラーなし | 完了条件に記載 | 未実行（推測: 問題なし） | 未確認 |
| スコア記録に影響なし | 完了条件に記載 | lib 側に GRID 依存なし | ✅ |

---

## 制約・前提・リスク

- [リスク] ベンチマーク値の陳腐化: 5×5 化でゲーム難度が実質変化したため、現在の 20代平均 18点が適切かは今後のプレイデータで検証が必要。影響度: 低（UI 表示値のみ）
- [リスク] モバイル表示確認不足: w-12×5 + gap-2×4 のレイアウトが実機（特に 320px 幅端末）で崩れないか未確認。影響度: 中（UX に直接影響）
- [前提] localStorage ベースのため、既存スコアデータは 4×4 時代のスコア（最大 15点前後）と 5×5 時代のスコアが混在する。ランキング上の比較が不公平になる可能性あるが、現設計では対処なし
- [制約] `MAX_PLAYS_PER_DAY = 3` の制限は変更なし。高難度化により 1プレイの重みが増す

---

## 設計者への申し送り

- GRID 定数は 1箇所のみで管理されており、グリッド関連ロジック（TOTAL・generatePattern・CSS グリッド列数）が全て GRID に連動する設計は良好。今後グリッドサイズを変更する場合も 1行変更で対応可能
- ベンチマーク値（`lib/benchmarks.ts`）と POINTS_REF（`lib/scores.ts`・`lib/daily.ts`）の pattern 値（20代: 18点）は 4×4 時代から引き継いだ値。5×5 での実際のスコア分布を一定期間収集後、必要に応じて調整を検討すること
- localStorage に蓄積された旧 4×4 時代のスコアとの混在問題は現時点では未対処。将来的にスコアにバージョンタグを付与するか、マイグレーション処理を検討する価値あり
- `npx tsc --noEmit` による型チェックをコミット前に実施して完了条件を全充足させること
