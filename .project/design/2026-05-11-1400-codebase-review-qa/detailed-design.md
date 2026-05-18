---
project_id: "2026-05-11-1400-codebase-review-qa"
phase: design
doc_type: detailed-design
created: "2026-05-11"
---

# 詳細設計: 図形記憶ゲーム グリッド変更 QA 設計書

## 1. 変更対象ファイル一覧

| ファイル | 変更 | 理由 |
|---------|------|------|
| `app/games/pattern/page.tsx` | GRID 定数 + セルサイズ変更 | グリッド 5×5 化 |
| その他すべてのファイル | 変更なし | GRID に非依存 |

---

## 2. 変更内容 Before / After

### 2.1 GRID 定数

ファイル: `app/games/pattern/page.tsx` L13

```typescript
// Before
const GRID = 4;  // 4×4 = 16マス

// After
const GRID = 5;  // 5×5 = 25マス
```

**影響する派生値（コード変更不要、自動連動）:**

| コード | Before (GRID=4) | After (GRID=5) |
|--------|----------------|----------------|
| `const TOTAL = GRID * GRID` | 16 | 25 |
| `Math.min(lvl + 2, TOTAL - 1)` 最大値 | 15 | 24 |
| `repeat(${GRID}, 1fr)` | 4列 | 5列 |
| `Array.from({ length: TOTAL })` | 16セル | 25セル |

### 2.2 セルサイズ

ファイル: `app/games/pattern/page.tsx` L159

```typescript
// Before
let cellClass = "w-14 h-14 rounded-lg transition-all duration-150 cursor-pointer border-2 ";

// After
let cellClass = "w-12 h-12 rounded-lg transition-all duration-150 cursor-pointer border-2 ";
```

**変更の根拠:**
- `w-14`（56px）× 5列 = 280px + gap-2 × 4 = 312px → max-w-sm(384px) 内に収まるが padding 考慮で不安定
- `w-12`（48px）× 5列 = 240px + gap-2 × 4 = 272px + padding(48px) = 320px → 最小幅端末(320px)ギリギリ収まる

---

## 3. 変更しないファイルと理由

| ファイル | 理由 |
|---------|------|
| `lib/scores.ts` | `POINTS_REF["pattern"] = 18` はスコア値を受け取るだけ。GRID 不問 |
| `lib/daily.ts` | `REFERENCE["pattern"] = 18` 同上。`MAX_PLAYS_PER_DAY = 3` も変更なし |
| `lib/game-points.ts` | `REFERENCE["pattern"] = 18` 同上 |
| `lib/benchmarks.ts` | `BENCHMARKS["pattern"]` の年代別値は現時点では変更しない（5×5 での実績値収集後に再評価） |
| `components/ResultModal.tsx` | props 経由でスコアを受け取るため変更不要 |
| `components/GameHeader.tsx` | 変更対象外 |

---

## 4. テスト観点リスト（QA チーム用）

### 4.1 静的検証

| # | 観点 | 確認方法 | 合否判定基準 |
|---|------|---------|------------|
| S-01 | TypeScript 型チェック | `npx tsc --noEmit` を実行 | エラー 0 件で終了すること |
| S-02 | GRID 定数値 | `app/games/pattern/page.tsx` L13 を確認 | `const GRID = 5` であること |
| S-03 | セルクラス | `app/games/pattern/page.tsx` L159 を確認 | `w-12 h-12` を含むこと |
| S-04 | TOTAL の派生式 | `app/games/pattern/page.tsx` L14 を確認 | `const TOTAL = GRID * GRID` であること（ハードコードなし）|
| S-05 | パターン上限式 | L42, L96 を確認 | `Math.min(lvl + 2, TOTAL - 1)` で TOTAL-1 を上限としていること |
| S-06 | グリッド列数式 | L152 を確認 | `repeat(${GRID}, 1fr)` であること（ハードコードなし）|
| S-07 | lib 層の GRID 非依存性 | `lib/scores.ts`, `lib/daily.ts`, `lib/benchmarks.ts`, `lib/game-points.ts` を grep | `GRID` 変数の参照がないこと |

### 4.2 UI・レイアウト確認

| # | 観点 | 確認方法 | 合否判定基準 |
|---|------|---------|------------|
| U-01 | グリッドセル数 | ブラウザで pattern ゲームを開始してグリッドを目視確認 | 5列 × 5行 = 25 マスが表示されること |
| U-02 | グリッド列数 | Chrome DevTools で `.grid` 要素の `grid-template-columns` を確認 | `repeat(5, 1fr)` が適用されていること |
| U-03 | セルサイズ | DevTools で任意のセル要素のサイズを確認 | 幅 48px × 高さ 48px であること |
| U-04 | モバイル幅 375px | DevTools のレスポンシブモード（375px）で確認 | 横スクロールバーが発生しないこと |
| U-05 | 最小幅 320px | DevTools のレスポンシブモード（320px）で確認 | グリッドが画面内に収まること（はみ出し・重なりなし）|
| U-06 | セル点灯（showing フェーズ） | ゲーム開始直後に光るマスを目視確認 | 正しい数のマスが紫色で点灯すること |
| U-07 | フィードバック色（wrong フェーズ） | 意図的に誤答して結果を確認 | 誤選択セルが赤、未選択の正解セルが紫（透明）、正解選択済みセルが緑で表示されること |

### 4.3 ゲームロジック確認

| # | 観点 | 確認方法 | 合否判定基準 |
|---|------|---------|------------|
| G-01 | レベル 1 のパターンマス数 | レベル 1 でゲーム開始して表示中のマス数を確認 | 3 マス（lvl + 2 = 1 + 2）が点灯すること |
| G-02 | レベル 5 のパターンマス数 | レベル 5 まで連続正解してマス数を確認 | 7 マス（lvl + 2 = 5 + 2）が点灯すること |
| G-03 | 上限マス数（レベル 22 以上） | レベル 22 以上で上限が 24 マスになることを確認 | 24 マス以上は表示されないこと（TOTAL-1 = 24 が上限）|
| G-04 | 正解フロー | 正しいマスを選択して「決定」ボタンを押す | フェーズが "correct" → "showing" に遷移し、レベルが +1 されること |
| G-05 | 不正解フロー | 誤ったマスを選択して「決定」ボタンを押す | フェーズが "wrong" → "result" に遷移すること |
| G-06 | 「決定」ボタンの活性状態 | 選択マス数が patternCount と一致しない間 | ボタンが disabled（opacity-40）で押せないこと |
| G-07 | 選択マス数カウンタ | セルを選択・解除しながら確認 | 「決定 (x/y)」の x が選択数、y が patternCount と一致すること |

### 4.4 スコア・データ永続化確認

| # | 観点 | 確認方法 | 合否判定基準 |
|---|------|---------|------------|
| D-01 | スコア保存 | ゲーム終了後に DevTools > Application > localStorage で確認 | `braingame_scores` の `pattern` キーにスコアが保存されていること |
| D-02 | ランキング保存 | `braingame_rankings` を確認 | `pattern` キーに `{ nickname, score, date }` エントリが追記されていること |
| D-03 | 個人ベスト更新 | 2回プレイして 2回目のスコアが 1回目より高い場合 | リロード後にベストスコア表示が更新されていること |
| D-04 | デイリープレイ回数 | pattern を 3回プレイして残り回数を確認 | 3回目終了後に残り 0回となり「スタート」ボタンが「プレイ上限」メッセージに切り替わること |
| D-05 | localStorage 構造破壊なし | グリッド変更前後で `braingame_scores` の構造を比較 | キー名・値の型が変化していないこと |
| D-06 | 旧スコアとの共存 | 4×4 時代のスコアが localStorage に残存する環境でプレイ | エラーなく動作し、旧スコアをベストと比較表示できること |

### 4.5 ベンチマーク・ポイント換算確認

| # | 観点 | 確認方法 | 合否判定基準 |
|---|------|---------|------------|
| B-01 | ResultModal のベンチマーク表示 | 年齢設定済みプロフィールでゲーム終了 | 年代別平均スコアと比較テキストが表示されること |
| B-02 | 20代平均 18点の参照 | `lib/benchmarks.ts` の `pattern["20代"]` を確認 | `18` であること |
| B-03 | ポイント換算（REFERENCE=18） | スコア 18点でゲーム終了したとき | ResultModal に「10点 / 20点」と表示されること（18/18 × 10 = 10）|
| B-04 | ベンチマーク陳腐化リスクの記録 | 5×5 化後の実際のスコア分布を観察 | 将来的に 20代平均が 18点から乖離する場合は `lib/benchmarks.ts`・`lib/scores.ts`・`lib/daily.ts`・`lib/game-points.ts` の 4箇所を更新すること（現バージョンでは変更しない）|

### 4.6 リグレッション確認（他ゲームへの影響なし）

| # | 観点 | 確認方法 | 合否判定基準 |
|---|------|---------|------------|
| R-01 | 計算ゲームの動作 | calculation ゲームをプレイ | スコア保存・ベスト表示が正常であること |
| R-02 | 数字記憶ゲームの動作 | memory-number ゲームをプレイ | 同上 |
| R-03 | ストループゲームの動作 | stroop ゲームをプレイ | 同上 |
| R-04 | 反応速度ゲームの動作 | reaction ゲームをプレイ | 同上 |
| R-05 | ホーム画面の年代別平均スコア | ホームに戻り各ゲームカードを確認 | pattern の年代別平均スコアが正常表示されること |
| R-06 | 総合ランキングへの影響 | ランキングページを確認 | getOverallRanking() が pattern スコアを含めて正常に計算・表示されること |

---

## 5. 完了条件チェックリスト

以下のすべてにチェックが入った状態でリリース可能とする。

### コードレビュー
- [ ] `app/games/pattern/page.tsx` L13: `const GRID = 5` が確認できる
- [ ] `app/games/pattern/page.tsx` L14: `const TOTAL = GRID * GRID` がハードコードなしで定義されている
- [ ] `app/games/pattern/page.tsx` L42/L96: `Math.min(lvl + 2, TOTAL - 1)` で上限制限がある
- [ ] `app/games/pattern/page.tsx` L152: `repeat(${GRID}, 1fr)` でグリッド列数が動的である
- [ ] `app/games/pattern/page.tsx` L159: `w-12 h-12` のセルサイズが適用されている
- [ ] `lib/scores.ts`, `lib/daily.ts`, `lib/benchmarks.ts`, `lib/game-points.ts` に `GRID` の参照がない

### 静的検証
- [ ] `npx tsc --noEmit` でエラー 0 件

### UI 動作確認
- [ ] デスクトップブラウザで 5×5 グリッドが正常表示される
- [ ] DevTools モバイル 375px で横スクロールが発生しない
- [ ] DevTools モバイル 320px でグリッドが収まる

### ゲームロジック確認
- [ ] レベル 1 で 3 マスが点灯する
- [ ] 正解→次レベル、不正解→リザルト画面 の遷移が正常
- [ ] 「決定」ボタンが選択数 = patternCount の時のみ活性になる

### データ確認
- [ ] ゲーム終了後 `braingame_scores["pattern"]` にスコアが保存される
- [ ] `braingame_rankings["pattern"]` にエントリが追記される
- [ ] 3回プレイ後にプレイ上限メッセージが表示される

### リグレッション
- [ ] 他の 4 ゲーム（calculation, memory-number, stroop, reaction）が正常動作する
- [ ] 総合ランキングが正常に表示される

---

## 6. 既知リスクと対応方針

| リスク | 深刻度 | 現在の対応 | 将来の対応候補 |
|--------|--------|-----------|--------------|
| ベンチマーク値の陳腐化（5×5 難易度変化により 20代平均 18点が不適切になる可能性） | 低 | 変更しない。実績値収集後に再評価 | `lib/benchmarks.ts`, `lib/scores.ts`, `lib/daily.ts`, `lib/game-points.ts` の 4箇所を同時更新 |
| 旧スコア（4×4 時代）と新スコア（5×5 時代）がランキングで混在 | 中 | 対処なし。現設計では混在を許容 | ScoreEntry に `gridVersion: number` フィールドを追加しバージョン別フィルタリング |
| 最小幅 320px 端末でのレイアウト崩れ | 中 | 計算上は収まるが実機未確認 | 実機または BrowserStack での検証 |
| セル数増加（16→25）によるパフォーマンス劣化 | 低 | 25 マスは軽量で影響なしと推定 | React Profiler で確認（必要であれば） |
