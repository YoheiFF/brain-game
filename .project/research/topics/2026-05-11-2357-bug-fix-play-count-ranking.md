---
project_id: "2026-05-11-2357-bug-fix-play-count-ranking"
phase: research
created: "2026-05-11"
---
# 情報収集レポート: プレイ回数・ランキング・統計バグ調査

## 結論サマリー

- **バグ1（残りプレイ回数が減らないことがある）**: `recordPlay()` はゲーム終了時に1回だけ呼ばれるが、`saveScore()` が呼ばれた後に `recordPlay()` が続けて呼ばれる設計のため、React StrictMode（開発環境）では `useEffect` が二重実行されず、ゲームロジックは問題ないように見える。ただし `recordPlay` と `getRemainingPlays` がともに localStorage の `braingame_daily` を読むため、**日付をまたいで localStorage が残っている場合でも `loadDaily()` が正しく日付判定して初期化する**ので通常は問題ない。根本原因は `useDbSync` の localStorage 上書き処理（後述バグ2と同じ）。
- **バグ2（ランキング/統計に遷移して戻ると残り回数が3に復活）**: `useDbSync` が rankings ページでマウント時に `/api/sync` を呼び、レスポンスの `dailyPlays` を **localStorage の `braingame_daily` に書き戻していない**にもかかわらず、`braingame_rankings`（ランキング用 localStorage）は DB 値で上書きする。戻った後の `getRemainingPlays()` は `braingame_daily` を読むが、`useDbSync` は `braingame_daily` キーを更新しないため表示値は変わらないはずに見える。実際の原因は **`useDbSync` が `braingame_scores`（personalBests）と `braingame_rankings` を DB の値で毎回上書きする**ことで、`braingame_daily` の plays カウントが影響を受けることはないが、**rankings ページからホームに戻ると `useEffect([], [])` が再実行されて `getRemainingPlays()` が localStorage から読み直す**。問題は `useDbSync` にある：`dailyPlays` はレスポンスに含まれているが、localStorage の `braingame_daily` に書き戻す処理が実装されていないため、DB 上の実績プレイ回数がクライアント側 localStorage に同期されない。別デバイス・アプリ再起動後はこのズレが発生する。
- **バグ3（ランキング・統計未反映）**: `saveScore()` はゲーム終了時に `recordScore` Server Action を `fire-and-forget`（`.catch` のみ）で呼ぶが、Server Action の呼び出し先は Next.js Server Action（`"use server"`）であり、Capacitor Android 上では **Server Action のエンドポイント（`/_next/static/...` ではなく POST リクエスト）が `capacitor://localhost` オリジンから到達できない可能性が高い**。また `recordScore` は DB 側でも `currentPlayCount >= MAX_PLAYS_PER_DAY` チェックをするが、クライアントの localStorage カウントとの二重管理により、DB 側カウントが 0 のまま（未同期）のためスコアが弾かれることがある。統計ページは localStorage（`braingame_scores` / `braingame_daily`）だけを読んでおり、DB への書き込みに失敗していても localStorage には書き込まれているため統計は表示されるが、他プレイヤーの DB 上のランキングは `useDbSync` → `/api/sync` GET が成功しなければ取得できない。

---

## バグ1・2: プレイ回数の根本原因

### 残りプレイ回数の管理フロー

全ゲームページで共通して以下のパターンを取っている（calculation/page.tsx を代表例として示す）：

```typescript
// app/games/calculation/page.tsx 行83-86
useEffect(() => {
  setBest(getPersonalBest("calculation"));
  setRemaining(getRemainingPlays("calculation"));   // ← mount時に1回読む
}, []);
```

```typescript
// app/games/calculation/page.tsx 行63-72
const endGame = useCallback((currentScore: number) => {
  ...
  recordPlay("calculation", currentScore);           // ← ゲーム終了時に localStorage へ書く
  setRemaining(getRemainingPlays("calculation"));    // ← 書いた直後に再読み
  ...
}, []);
```

`getRemainingPlays` / `recordPlay` の実装は `lib/daily.ts` の localStorage 操作：

```typescript
// lib/daily.ts 行59-65
export function getRemainingPlays(gameId: GameId): number {
  return Math.max(0, MAX_PLAYS_PER_DAY - getPlayCount(gameId));
}

export function recordPlay(gameId: GameId, score: number): void {
  const record = loadDaily()
  record.plays[gameId] = (record.plays[gameId] ?? 0) + 1
  ...
  saveDaily(record)   // localStorage.setItem("braingame_daily", ...)
}
```

### バグ2の根本原因: useDbSync が dailyPlays を localStorage に書き戻さない

`hooks/useDbSync.ts` の fetchData では以下を localStorage に書いている：

```typescript
// hooks/useDbSync.ts 行41-59
localStorage.setItem("braingame_scores", JSON.stringify(json.personalBests));
localStorage.setItem("braingame_rankings", JSON.stringify(...));
// ← "braingame_daily" への書き込みは一切ない
```

`/api/sync` のレスポンス（`SyncResponse`）には `dailyPlays` フィールドが存在する（`lib/db-types.ts` 行43-51）にもかかわらず、`useDbSync` はこれを localStorage の `braingame_daily` に反映しない。

その結果：
1. ゲームをプレイ → localStorage の `braingame_daily.plays[gameId]` がインクリメント → 残り回数が減る
2. ランキングページへ遷移 → `useDbSync` が mount し `/api/sync` を呼ぶ → **`braingame_daily` は更新されない**
3. ホームに戻ると各ゲームページが mount → `useEffect([], [])` で `getRemainingPlays()` が再実行 → localStorage の `braingame_daily` から正しい値（減った値）を読む

ただし、**localStorage をクリアした直後・別デバイス・アプリ再インストール後**は `braingame_daily` が空のため、DB 上では `daily_plays` にカウントが記録されていても、クライアントは残り3回と表示してしまう（バグ1の「減らないことがある」はこの状況に相当する可能性が高い）。

### バグ1の追加原因: DB と localStorage の二重カウント

`recordScore` (Server Action) は DB 側でも `daily_plays` を管理（`app/actions/user.ts` 行117-127）しているが、成功/失敗に関わらず `recordPlay()` は必ず localStorage へ書く。

DB への書き込みが失敗した場合：
- localStorage のカウントは増える（残り回数は減って見える）
- DB 上のカウントは増えない
- 次回アプリ起動時 or localStorage クリア時：残り回数が復活する（バグ1の再現条件）

---

## バグ3: ランキング・統計未反映の根本原因

### saveScore → recordScore の呼び出しフロー

```
ゲーム終了
  ↓
saveScore(gameId, score, nickname, getOrInitUserId())   [lib/scores.ts 行63]
  ├── localStorage "braingame_scores" 更新（個人ベスト）
  ├── localStorage "braingame_rankings" 更新（ランキング）
  └── fire-and-forget で recordScore Server Action 呼び出し [行92-98]
        ↓
        recordScore(input)   [app/actions/user.ts 行98]
          ├── DB daily_plays チェック（行117-127）
          ├── saveScoreToDb → scores テーブルに INSERT [行129]
          ├── recordDailyPlay → daily_plays テーブルに UPSERT [行130]
          ├── updateDailyHistory → daily_history テーブルに UPSERT [行131]
          └── revalidatePath("/rankings")  [行132]
```

### 問題点1: fire-and-forget でエラーが握りつぶされる

```typescript
// lib/scores.ts 行91-98
if (userId) {
  import("@/app/actions/user").then(({ recordScore }) => {
    recordScore({ userId, gameId, score }).catch((e) => {
      console.warn("[saveScore] recordScore failed:", e);   // ← warningのみ、リトライなし
    });
  }).catch((e) => {
    console.warn("[saveScore] import failed:", e);          // ← warningのみ
  });
}
```

Capacitor Android 環境では Next.js Server Action は内部的に特定エンドポイントへの POST リクエストとして送信される。`capacitor://localhost` からの通信は、API Route（GET）はカスタム CORS ヘッダーで制御できるが、Server Action の POST エンドポイントには CORS 設定が存在しない。`app/api/sync/route.ts` で `ALLOWED_ORIGINS` を設定している（行14-17）ものの、Server Action（`app/actions/user.ts`）には対応するヘッダー設定がないため、**Android Capacitor ビルドではブラウザの CORS ポリシーによって Server Action が常にブロックされる可能性がある**。

### 問題点2: ランキングページが localStorage を初期値として使い、DB sync で上書きする設計

```typescript
// app/rankings/page.tsx 行33-51
useEffect(() => {
  // 初期値は localStorage から
  for (const id of GAME_IDS) gr[id] = getGameRanking(id);   // lib/scores.ts のlocalStorage読み取り
  setGameRankings(gr);
  ...
}, []);

// DB データで上書き
useEffect(() => {
  if (!syncData) return;
  setGameRankings(syncData.gameRankings);   // useDbSync の結果で上書き
  ...
}, [syncData]);
```

DB への書き込みが失敗している場合、`/api/sync` で取得できるのは他プレイヤーのデータのみで、自分のスコアが DB に入っていないため自分のランキングエントリが反映されない。

### 問題点3: 統計ページは localStorage のみを参照（DB 同期なし）

```typescript
// app/stats/page.tsx 行29-35
useEffect(() => {
  setMounted(true)
  setBests(getAllPersonalBests())    // localStorage "braingame_scores" のみ
  setDailyBests(getDailyBests())    // localStorage "braingame_daily" のみ
  setAge(getAge())
  setTotalPlays(getTotalPlayCount()) // localStorage "braingame_rankings" のみ
}, [])
```

`useDbSync` は stats ページでは使用されていない。DB との同期は行われず、**localStorage が最新であれば正常に表示されるが、別デバイスやアプリ再起動後は反映されない**。

---

## 既存コードの関連箇所

| ファイルパス | 行番号 | 役割 |
|---|---|---|
| `lib/daily.ts` | 26-36 | `loadDaily()`: localStorage から今日の DailyRecord を読む（日付変わると自動リセット） |
| `lib/daily.ts` | 55-65 | `getPlayCount` / `getRemainingPlays`: localStorage のプレイ回数を返す |
| `lib/daily.ts` | 67-82 | `recordPlay()`: localStorage にプレイ回数・ベストスコアを書き込む |
| `lib/scores.ts` | 63-102 | `saveScore()`: localStorage + DB (fire-and-forget) へスコア保存 |
| `lib/scores.ts` | 91-98 | `recordScore` の fire-and-forget 呼び出し（エラーは warn のみ） |
| `app/actions/user.ts` | 98-138 | `recordScore` Server Action: DBへのスコア保存・レート制限チェック |
| `app/actions/user.ts` | 117-127 | DB 側 `daily_plays` によるレート制限チェック（localStorage と二重管理） |
| `hooks/useDbSync.ts` | 41-59 | `braingame_scores` と `braingame_rankings` のみ上書き（`braingame_daily` は更新しない） |
| `app/api/sync/route.ts` | 14-17 | `ALLOWED_ORIGINS`: Capacitor CORS 許可リスト（Server Action には適用されない） |
| `app/rankings/page.tsx` | 33-51 | localStorage 初期値 → useDbSync 上書きパターン |
| `app/stats/page.tsx` | 29-35 | localStorage のみ参照（useDbSync 未使用） |
| `app/games/*/page.tsx` | mount useEffect | `getRemainingPlays()` を mount 時に1回読む（ページ遷移で再実行される） |

---

## 制約・前提

### React StrictMode の影響
`app/layout.tsx` を確認したところ `<React.StrictMode>` は使用されていない（Next.js 14 App Router はデフォルトで StrictMode を使用しない）。よってこの影響は本番では発生しない。開発環境（`next dev`）は Next.js 14 では App Router で StrictMode が有効になるため、`useEffect` が二重実行される。`gameEndedRef` で二重実行を防ぐ実装は memory-number のみで行われているが（`page.tsx` 行74, 76）、他ゲームは対応していない。

### localStorage と DB の二重管理
プレイ回数は `lib/daily.ts`（localStorage）と `app/actions/user.ts` + `lib/db-scores.ts`（DB）で独立して管理されている。クライアント側は localStorage を正となし、DB 側は独立してカウントする設計。この二重管理により：
- localStorage クリア時：クライアントは残り3回と表示するが、DB 上の recordScore は `daily play limit exceeded` を返してスコアが DB に保存されない
- DB 書き込み失敗時：localStorage は更新されるが DB は更新されず、ランキングに反映されない

### Capacitor モバイル環境での動作
`capacitor://localhost` からは：
- `/api/sync` (GET): `getCorsHeaders()` で `Access-Control-Allow-Origin: capacitor://localhost` が返る → 動作する
- Server Action (POST `/_next/static/...`): CORS ヘッダーがない → **ブロックされる可能性が高い**

Server Action がブロックされると `recordScore` が呼ばれないため、スコアが DB に保存されず、ランキングに反映されない（バグ3の主因）。

---

## 設計者への申し送り

### 優先度: 高

1. **Server Action の CORS 問題（バグ3主因）**  
   Capacitor Android ビルドでは Server Action が使えない可能性が高い。`recordScore` を Server Action から通常の API Route（`/api/record-score`）に変更し、CORS ヘッダーを追加するか、または `useDbSync` の `fetchData` 内でスコア送信をまとめて行う設計に変更する。

2. **useDbSync が dailyPlays を localStorage に書き戻さない（バグ1・2主因）**  
   `hooks/useDbSync.ts` の fetchData で `json.dailyPlays` を受け取った後、`braingame_daily` の `plays` フィールドを更新する処理を追加する。ただし日付チェックが必要（`json.dailyPlays` は今日のデータであることを確認してから上書きする）。  
   **注意**: `braingame_daily` の構造（`{ date, plays, bestScores }`）に合わせてマッピングが必要。`SyncResponse.dailyPlays` は `Partial<Record<GameId, { playCount, bestScore }>>` 形式。

3. **localStorage がない状態での残り回数復活防止（バグ1・2補完）**  
   ゲームページ mount 時に `getRemainingPlays()` を localStorage から読むだけでなく、DB の `dailyPlays`（`useDbSync` の結果）と突合して最も厳しい値（残り回数が少ない方）を採用する。

### 優先度: 中

4. **statsページへの useDbSync 追加（バグ3補完）**  
   `app/stats/page.tsx` は localStorage のみを参照しており、DB との同期がない。`useDbSync({ interval: null })` を追加して初回マウント時のみ DB から最新データを取得し、localStorage を更新する。

5. **recordPlay と recordScore の成功/失敗の整合（バグ1補完）**  
   `recordScore` が DB への書き込みに失敗した場合、localStorage の `recordPlay()` の呼び出しもスキップする、またはリトライキューを設けることを検討する。現状は「localStorage には書くが DB には書けない」状態が発生する。

### 優先度: 低

6. **gameEndedRef による二重実行防止を全ゲームに統一**  
   `memory-number/page.tsx` のみ `gameEndedRef` で二重実行を防いでいるが、他ゲームは実装されていない。開発環境の StrictMode でのテスト品質向上のために統一を推奨。
