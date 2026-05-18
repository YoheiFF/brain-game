---
project_id: "2026-05-18-1000-sync-design-to-impl"
phase: design
doc_type: detailed-design
created: "2026-05-18"
---

# 詳細設計書: 詳細設計書と実装の差分同期

---

## 設計書別 修正指示

---

### 修正不要の設計書

以下の設計書は実装と完全一致しており、修正は不要。

- `2026-05-11-1400-codebase-review-qa`: GRID=5 関連の全実装、ベンチマーク値が設計書通り。変更なし。
- `2026-05-11-1600-mobile-security-audit`: UUID バリデーション、スコア範囲チェック、CORS ヘッダー、Turso タイムアウト、app/api/sync/route.ts の完全な After コードに getUserRanksFromDb が既に含まれており、実装と一致している。変更なし。
- `2026-05-12-1000-privacy-policy`: app/privacy-policy/page.tsx、app/page.tsx リンク追加、NicknameModal 同意チェックボックスすべて設計書通り。変更なし。

---

### 修正 1: `2026-05-11-1500-turso-user-sync/detailed-design.md`

**対象ファイル**: `C:\project\BrainGame\.project\design\2026-05-11-1500-turso-user-sync\detailed-design.md`

---

#### 修正箇所 1-A: SyncResponse 型への2フィールド追加

- **対象セクション**: `## 0. 前提・パッケージ・環境変数` の `### 共通型定義` 内の `SyncResponse` インターフェース
- **現在の記載** (行 69-75):
  ```typescript
  // /api/sync レスポンス全体
  export interface SyncResponse {
    personalBests: Partial<Record<GameId, number>>;
    gameRankings: Partial<Record<GameId, RankEntry[]>>;
    overallRanking: OverallEntry[];
    dailyPlays: Partial<Record<GameId, { playCount: number; bestScore: number | null }>>;
    dailyHistory: DailyHistoryEntry[];
  }
  ```
- **修正後**:
  ```typescript
  // /api/sync レスポンス全体
  export interface SyncResponse {
    personalBests: Partial<Record<GameId, number>>;
    gameRankings: Partial<Record<GameId, RankEntry[]>>;
    overallRanking: OverallEntry[];
    dailyPlays: Partial<Record<GameId, { playCount: number; bestScore: number | null }>>;
    dailyHistory: DailyHistoryEntry[];
    myGameRanks: Partial<Record<GameId, RankEntry>>;   // ユーザー個別のゲーム別順位
    myOverallRank: OverallEntry | null;                 // ユーザー個別の総合順位
  }
  ```
- **変更内容**: `myGameRanks` と `myOverallRank` の2フィールドを末尾に追加する。

---

#### 修正箇所 1-B: ランキング上限値を30件から20件に修正（全体）

- **対象セクション**: 複数箇所（以下に列挙）
- **変更内容**: 「30件」「上位 30 件」「30 件」と記載されているすべての箇所を「20件」「上位 20 件」「20 件」に変更する。

具体的な修正箇所:

1. `## 3. lib/db-scores.ts` の `getRankingsFromDb` 処理フロー ステップ2c:
   - 変更前: `c. 上位 30 件を RankEntry[]（{ rank, nickname, score, date }）に変換`
   - 変更後: `c. 上位 20 件を RankEntry[]（{ rank, nickname, score, date }）に変換`

2. `## 13. テスト観点リスト` の境界値テスト T-24:
   - 変更前: `| T-24 | ランキング 30 件上限 | 31 ユーザー分のスコアを登録する | ランキングは上位 30 件のみ返る |`
   - 変更後: `| T-24 | ランキング 20 件上限 | 21 ユーザー分のスコアを登録する | ランキングは上位 20 件のみ返る |`

---

#### 修正箇所 1-C: `getUserRanksFromDb()` 関数の追加

- **対象セクション**: `## 3. lib/db-scores.ts — スコア CRUD` の `### 関数仕様` 末尾（`getDailyHistoryFromDb` の後）
- **追加内容**: 以下のブロックを `getDailyHistoryFromDb` の説明の後に追記する。

```markdown
#### `getUserRanksFromDb(userId: string): Promise<{ gameRanks: Partial<Record<GameId, RankEntry>>; overallRank: OverallEntry | null }>`

| 項目 | 内容 |
|---|---|
| 引数 | `userId`: UUID |
| 戻り値 | ゲーム別個人順位 + 総合個人順位 |

処理フロー:
1. `getRankingsFromDb()` が返す `gameRankings` と `overallRanking` を取得する（内部で再計算するのではなく、全体ランキングの結果から検索する）
2. ゲーム別順位の算出:
   - 各 `gameId` について `gameRankings[gameId]` の配列を走査する
   - `entry.userId === userId`（または nickname ではなく userId で照合）の最初のエントリを取得する
   - 実装上は `rank` フィールドを含む `RankEntry` オブジェクトを `gameRanks[gameId]` にセットする
   - 該当なしの場合は `gameRanks[gameId]` を未定義のままにする（`Partial` のため省略可）
3. 総合順位の算出:
   - `overallRanking` 配列から `entry.userId === userId` のエントリを取得する
   - 該当なしの場合は `overallRank: null` を返す
4. `{ gameRanks, overallRank }` を返す
5. 例外は呼び出し元に伝播させる

> 注意: `getRankingsFromDb()` の内部では全スコアを取得してメモリ上でソートしているため、`getUserRanksFromDb()` は必ず `getRankingsFromDb()` の後に、またはその結果を受け取る形で呼び出すこと（`/api/sync` では Promise.all で並列実行し、結果から順位を検索している）。
```

---

#### 修正箇所 1-D: `/api/sync` の5並列フェッチへの修正

- **対象セクション**: `## 4. app/api/sync/route.ts — GET エンドポイント` の `#### GET 処理フロー`
- **現在の記載** (ステップ5・6):
  ```typescript
  // ステップ5
  const [personalBests, rankings, dailyPlays, dailyHistory] = await Promise.all([
    getPersonalBestsFromDb(userId),
    getRankingsFromDb(),
    getDailyPlaysFromDb(userId),
    getDailyHistoryFromDb(userId, 14),
  ]);

  // ステップ6
  const body: SyncResponse = {
    personalBests,
    gameRankings: rankings.gameRankings,
    overallRanking: rankings.overallRanking,
    dailyPlays,
    dailyHistory,
  };
  ```
- **修正後**:
  ```typescript
  // ステップ5
  const [personalBests, rankings, myRanks, dailyPlays, dailyHistory] = await Promise.all([
    getPersonalBestsFromDb(userId),
    getRankingsFromDb(),
    getUserRanksFromDb(userId),
    getDailyPlaysFromDb(userId),
    getDailyHistoryFromDb(userId, 14),
  ]);

  // ステップ6
  const body: SyncResponse = {
    personalBests,
    gameRankings: rankings.gameRankings,
    overallRanking: rankings.overallRanking,
    myGameRanks: myRanks.gameRanks,
    myOverallRank: myRanks.overallRank,
    dailyPlays,
    dailyHistory,
  };
  ```
- **変更内容**: Promise.all に `getUserRanksFromDb(userId)` を3番目（rankings の直後）に追加。レスポンス構築に `myGameRanks` / `myOverallRank` を追加。

---

#### 修正箇所 1-E: `scores.ts` の新規関数を §8 に追記

- **対象セクション**: `## 8. lib/scores.ts — DB 優先・localStorage フォールバックへの変更` の末尾
- **追加内容**: 以下のブロックを §8 の末尾に追記する。

```markdown
### `getUserGameRankEntry()` / `getUserOverallRankEntry()`（追加実装）

`/api/sync` から受け取った `SyncResponse` の `myGameRanks` / `myOverallRank` を
ランキングページで「あなたの順位」として表示するためのヘルパー関数。

```typescript
// lib/scores.ts に追加された実装
// SyncResponse.myGameRanks から特定ゲームのエントリを返す
export function getUserGameRankEntry(
  syncData: SyncResponse,
  gameId: GameId
): RankEntry | undefined {
  return syncData.myGameRanks?.[gameId];
}

// SyncResponse.myOverallRank を返す
export function getUserOverallRankEntry(
  syncData: SyncResponse
): OverallEntry | null {
  return syncData.myOverallRank ?? null;
}
```

これらの関数は `app/rankings/page.tsx` から呼び出され、ランキング画面の「あなたの順位」セクションに利用される。
```

---

#### 修正箇所 1-F: `app/page.tsx` の既知制限事項を注記として追加

- **対象セクション**: `## 10. app/page.tsx — useDbSync hook の組み込み` の `### useDbSync hook の組み込み` 内、`syncData` 処理の useEffect コード例の後
- **追加内容**: コード例の後に以下の注記を追記する。

```markdown
> **既知の制限事項**: 上記の `syncData` 処理における `remainingPlays` 計算は `MAX_PLAYS_PER_DAY = 3` 固定であり、リワードプレイ数（`rewardedPlays`）を加算していない。
> そのため、DB 同期後にリワード済みユーザーの残り回数が過小表示される可能性がある。
> `getAllRemainingPlays()` は `rewardedPlays` を考慮した正確な値を返すが、`syncData` からの変換ではこれが反映されていない。
> この制限は後続の設計フェーズで修正予定。現時点では `app/page.tsx` 初期ロード時の `getAllRemainingPlays()` が正確な値を返すため、実害は限定的。
```

---

#### 修正箇所 1-G: `app/rankings/page.tsx` のスケルトン表示を §12 に追記

- **対象セクション**: `## 12. app/rankings/page.tsx — ポーリングへの変更` の末尾
- **追加内容**: 以下のブロックを §12 の末尾に追記する。

```markdown
### ランキング画面のスケルトン表示（追加実装）

データ取得中（`loading === true` かつ `syncData === null`）の間は `RankingSkeleton` コンポーネントを表示する。

```typescript
// 表示ロジック（JSX 内）
{loading && !syncData ? (
  <RankingSkeleton />
) : (
  // 実データのランキング表示
)}
```

`RankingSkeleton` はランキングリストのプレースホルダー UI（グレーのアニメーションブロック）。
初回ロード時のみ表示され、データ取得完了後は実データに切り替わる。
30秒ポーリングの更新時（`syncData` が既に存在する場合）はスケルトンを表示しない。

なお、設計書では「localStorage をフォールバックとして使用する方針」と記載していたが、
実装では「DB 取得完了までスケルトン表示」に方針変更された。これにより古いキャッシュデータを誤表示するリスクを低減している。
```

---

#### 修正箇所 1-H: `app/actions/user.ts` の `recordScore` 廃止予定を注記として追加

- **対象セクション**: `## 5. app/actions/user.ts — Server Actions` の `#### recordScore` 関数説明の末尾
- **追加内容**: 以下の注記を追記する。

```markdown
> **廃止予定（Deprecated）**: この `recordScore` Server Action は `2026-05-11-2357-bug-fix-play-count-ranking` で作成された `/api/record-score` API Route への移行により、実際の呼び出しルートが切り替わっている（`lib/scores.ts` の `saveScore()` は `fetch("/api/record-score", ...)` を呼ぶ）。
> 現在この Server Action は直接呼び出されていない。
> `app/actions/user.ts` の `recordScore` に含まれる `MAX_PLAYS_PER_DAY = 3` 制限は実質的に機能していない（`/api/record-score` では `MAX_PLAYS_PER_DAY = 6`）。
> 将来的には `app/actions/user.ts` から `recordScore` を削除し、`/api/record-score` に統一することを推奨する。
```

---

### 修正 2: `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md`

**対象ファイル**: `C:\project\BrainGame\.project\design\2026-05-11-2357-bug-fix-play-count-ranking\detailed-design.md`

---

#### 修正箇所 2-A: DailyRecord 型に `rewardedPlays?` フィールドを追記

- **対象セクション**: `## データ構造定義` の `### DailyRecord（lib/daily.ts から参照）`
- **現在の記載** (行 664-669):
  ```typescript
  interface DailyRecord {
    date: string;                          // "YYYY-MM-DD" 形式（今日の日付）
    plays: Partial<Record<GameId, number>>; // ゲーム別プレイ回数（当日）
    bestScores: Partial<Record<GameId, number>>; // ゲーム別当日ベストスコア
  }
  ```
- **修正後**:
  ```typescript
  interface DailyRecord {
    date: string;                                     // "YYYY-MM-DD" 形式（今日の日付）
    plays: Partial<Record<GameId, number>>;            // ゲーム別プレイ回数（当日）
    bestScores: Partial<Record<GameId, number>>;       // ゲーム別当日ベストスコア
    rewardedPlays?: Partial<Record<GameId, number>>;   // 広告視聴で獲得した追加プレイ権利数（省略可）
  }
  ```
- **変更内容**: `rewardedPlays?` フィールドを末尾に追加する。`lib/daily.ts` の実際の型定義と一致させる。

---

#### 修正箇所 2-B: T-12 テスト観点のコメントを修正

- **対象セクション**: `## テスト観点` の `### 境界値` テーブル内 T-12
- **現在の記載**:
  ```
  | T-12 | DB のプレイ数とローカルのプレイ数が同じ場合 | localStorage を上書きしない（`>` 条件で弾く） |
  ```
- **修正後**:
  ```
  | T-12 | DB のプレイ数とローカルのプレイ数が同じ場合 | localStorage を上書きしない（`>` 条件: DB > ローカルの場合のみ上書き。同値は上書きしない） |
  ```
- **変更内容**: テスト期待結果のコメントに「同値は上書きしない」の説明を追加する。

同様に、`mergeDailyPlaysToStorage` 関数の JSDoc コメント（行 391-395）も修正する。
- **対象**: `* - DB のプレイ数 >= ローカルのプレイ数 の場合のみ上書き（DB を正として採用）`
- **修正後**: `* - DB のプレイ数 > ローカルのプレイ数 の場合のみ上書き（DB > ローカルの場合のみ採用。同値は上書きしない）`

---

### 修正 3: `2026-05-12-0900-rewarded-ad-monetization/detailed-design.md`

**対象ファイル**: `C:\project\BrainGame\.project\design\2026-05-12-0900-rewarded-ad-monetization\detailed-design.md`

---

#### 修正箇所 3-A: §3.5 の `app/layout.tsx` コード例に BGMProvider を追加

- **対象セクション**: `### 3.5 app/layout.tsx（編集）` の `**変更箇所**`
- **現在の記載** (行 292-299):
  ```typescript
  import AdMobInit from "@/components/AdMobInit";

  // RootLayout の <body> 内:
  <body>
    <AdMobInit />
    {children}
  </body>
  ```
- **修正後**:
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
- **変更内容**: `BGMProvider` の import と `<body>` 内のコード例を実装に合わせて更新する。`AdMobInit` の位置は変更しない（設計書通り `BGMProvider` の外側）。
- **注記追加**: 変更後のコード例の後に以下を追記する。

  > **注意**: `BGMProvider` は本設計書のスコープ外の追加実装（BGM 機能）である。`AdMobInit` が `BGMProvider` の外側に配置されていることで、AdMob 初期化は BGM の状態に依存しない。BGMProvider の仕様詳細は別途作成予定の設計書を参照すること。

---

## 新規設計書の作成要否判断

### BGM 機能（BGMProvider）

- **判断**: 新規設計書が必要（本タスクのスコープ外）
- **理由**: `components/BGMProvider.tsx` は独立した機能単位であり、既存設計書のいずれにも属さない。設計書なしで実装が先行している状態のため、将来の再実装・保守のために設計書を作成することを推奨する。
- **対応**: 本タスクでは `2026-05-12-0900-rewarded-ad-monetization/detailed-design.md` の §3.5 に BGMProvider への参照メモを追記するのみ。BGM 機能の設計書は別プロジェクト ID（例: `2026-05-18-XXXX-bgm-provider`）で新規作成すること。

---

## テスト観点（QA フェーズ向け）

### 修正後の各設計書が実装と一致しているか

| 確認項目 | 確認方法 |
|---------|---------|
| `SyncResponse` 型に `myGameRanks` / `myOverallRank` が記載されているか | 設計書 1500 §0 の TypeScript コードを確認 |
| ランキング上限が「20件」で統一されているか | 設計書 1500 の全文を「30件」で全文検索し、該当なしを確認 |
| `getUserRanksFromDb()` 関数仕様が記載されているか | 設計書 1500 §3 末尾を確認 |
| `/api/sync` の Promise.all が5引数になっているか | 設計書 1500 §4 ステップ5のコードを確認 |
| `DailyRecord` に `rewardedPlays?` が記載されているか | 設計書 2357 のデータ構造定義セクションを確認 |
| `mergeDailyPlaysToStorage` の JSDoc コメントが `>` 条件になっているか | 設計書 2357 の関数コメントを確認 |
| T-12 の期待結果コメントが「同値は上書きしない」になっているか | 設計書 2357 のテスト観点テーブルを確認 |
| `app/layout.tsx` のコード例に BGMProvider が含まれているか | 設計書 0900 §3.5 を確認 |

### 記載の整合性（ファイル間で矛盾がないか）

| 確認項目 | 確認方法 |
|---------|---------|
| 設計書 1500 の `SyncResponse` と設計書 1600 の `SyncResponse` が一致しているか | 1600 の `app/api/sync/route.ts` 完全な After コードのレスポンス型を確認 |
| 設計書 2357 の `DailyRecord` と設計書 0900 の `DailyRecord` が一致しているか | 両設計書のインターフェース定義を照合（`rewardedPlays?` フィールドの有無） |
| ランキング上限値が設計書間で矛盾していないか | 1500 以外の設計書でランキング上限に言及している箇所がないか確認 |

---

## 完了条件チェックリスト

### 修正対象設計書の更新確認

- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` の `SyncResponse` に `myGameRanks` / `myOverallRank` が追記されている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` のランキング上限が全出現箇所で「20件」になっている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` に `getUserRanksFromDb()` の関数仕様が追記されている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` の `Promise.all` が5引数（`getUserRanksFromDb` 追加）になっている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` のレスポンス構築に `myGameRanks` / `myOverallRank` が追記されている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` に `getUserGameRankEntry()` / `getUserOverallRankEntry()` の仕様が追記されている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` に `remainingPlays` 計算の既知制限が注記として追記されている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` にスケルトン表示の仕様が §12 に追記されている
- [ ] `2026-05-11-1500-turso-user-sync/detailed-design.md` に `recordScore` Server Action の廃止予定注記が追記されている
- [ ] `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md` の `DailyRecord` に `rewardedPlays?` が追記されている
- [ ] `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md` の `mergeDailyPlaysToStorage` JSDoc コメントが `>` 条件に修正されている
- [ ] `2026-05-11-2357-bug-fix-play-count-ranking/detailed-design.md` の T-12 コメントが「同値は上書きしない」に修正されている
- [ ] `2026-05-12-0900-rewarded-ad-monetization/detailed-design.md` の §3.5 に BGMProvider が追記されている

### 整合性確認

- [ ] 修正後の設計書 1500 に「30件」の記載が残っていない（全文検索で0件）
- [ ] 設計書 1500 と設計書 1600 の `SyncResponse` 型に矛盾がない
- [ ] 設計書 2357 と設計書 0900 の `DailyRecord` 型に矛盾がない（両方 `rewardedPlays?` あり）
- [ ] 設計書未記載の新規実装（BGM機能）について、方針（別チケット作成）が 0900 設計書の §3.5 に記録されている

### 実装コードへの影響確認

- [ ] 本タスクでは実装コードを変更していない（設計書のみを修正）
- [ ] `app/`, `lib/`, `components/`, `hooks/` 配下のファイルに変更がない
