---
project_id: "2026-05-11-1600-mobile-security-audit"
phase: qa
overall_status: conditional-pass
---
# テストレポート - 2026-05-11-1600-mobile-security-audit

## 総合判定

**conditional-pass（条件付き合格）**

全 7 要件の実装コードが設計書と一致していることを確認した。TypeScript 型チェックもエラーなし。
ただし `capacitor.config.ts` の `server.url` が未置換プレースホルダーのままであり、
APK としてのリリース前に Vercel URL を確定・置換する作業が残留している。
この条件を満たせば本番リリース可能と判断する。

---

## 修正確認結果

| # | 修正内容 | 結果 | 詳細 |
|---|---------|------|------|
| REQ-01 | SCORE_LIMITS に全5ゲームの上限定義 | PASS | `app/actions/user.ts` L29-35: calculation/memory-number/stroop/reaction/pattern の全5ゲームが Record<GameId,{min,max}> 型で定義済み |
| REQ-01 | recordScore でスコア上限チェック実装 | PASS | L109-112: `SCORE_LIMITS[input.gameId]` を参照し min/max 両端チェック。既存の `score<0` チェックも包含して置換済み |
| REQ-04 | recordScore で DB からプレイ回数取得しレート制限 | PASS | L116-127: `daily_plays` テーブルへの SELECT を try ブロック先頭で実行。play_count >= 3 で即時拒否 |
| REQ-03 | upsertUser に UUID 形式チェック | PASS | L58-61: `UUID_REGEX.test(input.id)` を関数先頭で実行。正規表現は `/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i` |
| REQ-07 | upsertUser に nickname 文字種チェック（Unicode regex） | PASS | L71-74: `NICKNAME_REGEX.test(trimmedNickname)` を長さチェック後に実行。`/u` フラグ付き Unicode モード |
| REQ-05 | lib/db.ts にタイムアウト設定 | PASS | `lib/db.ts` L22-27: AbortController + setTimeout(10_000) + .finally(clearTimeout) パターンを確認 |
| REQ-06 | app/api/sync/route.ts に CORS ヘッダー・OPTIONS ハンドラ | PASS | L14-35: ALLOWED_ORIGINS 定数、getCorsHeaders() ヘルパー、OPTIONS 関数（204）、GET での origin 付与を全て確認 |
| REQ-02 | capacitor.config.ts に server.url 追加 | PASS（要置換） | L7-12: `server.url` と `cleartext: false` が追加済み。URL は `REPLACE_WITH_VERCEL_URL` プレースホルダーのまま（リリース前に要置換） |

---

## 静的検証

- **npx tsc --noEmit**: 出力なし（エラーゼロ）
- **型エラー分類**: 該当なし
- **import チェック**: `GAME_META` が `app/actions/user.ts` でインポートされているが実装内で未使用。`tsconfig.json` に `noUnusedLocals` が未設定のため型エラーには至っていない。実害なし（work-log に既記録）。
- **SCORE_LIMITS 型安全性**: `Record<GameId, ...>` 型により、GameId に新ゲームが追加された際はコンパイルエラーで検知可能。設計意図通り。

---

## セキュリティコードレビュー結果

| 観点 | 評価 | 詳細 |
|------|------|------|
| スコア上限値の現実的妥当性 | PASS | calculation(60): GAME_TIME=30秒で1問/秒ペースが理論上限のため妥当。stroop(60): 同じ30秒タイマー。memory-number(20): スコア=桁数でありレベル3開始・無限増加式だが20桁記憶は超人的で実用上妥当。reaction(50-2000ms): 人体反応速度下限50ms・上限2000msは医学的根拠と一致。pattern(25): GRID=5(5x5=25マス)の最大値と一致。 |
| UUID regex の正確性 | PASS | `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` は RFC 4122 準拠の形式チェックとして正確。ただしバージョン・バリアントビットは検証しない（v4 以外も通過）。現状の用途では許容範囲。 |
| nickname regex の制御文字・絵文字排除 | PASS（軽微な注意点あり） | `/^[\p{L}\p{N}\p{Z}_\-\.・\s]{1,12}$/u` は `\p{L}`（Unicode 文字）・`\p{N}`（数字）・`\p{Z}`（区切り文字）のみ許可。制御文字（\x00等）・絵文字（Emoji category 非該当）は弾かれる。**注意**: `\p{Z}` と `\s` が両方含まれており `\s` は一部制御文字（\t, \n, \r）を含む。長い ZWJ 絵文字列（🏳️‍🌈等）は文字数カウント vs バイト数の差異があるが、length チェックで先に弾かれるため爆弾攻撃には至らない。 |
| ALLOWED_ORIGINS の適切性 | CONDITIONAL（注意事項あり） | 現状は `capacitor://localhost` と `http://localhost` のみ。Vercel にデプロイ後もブラウザ経由のアクセスには対応できる（サーバーレンダリングのため CORS 不要だが）。APK が `server.url` 経由でロードするため `capacitor://localhost` の許可が本質的に重要。本番ドメインを ALLOWED_ORIGINS に追加すべきかは運用形態次第（Web 公開する場合は追加が望ましい）。 |
| レート制限の TOCTOU 競合状態 | LOW RISK（設計書で認識・許容済み） | SELECT → 判定 → INSERT の間に同一ユーザーが並列リクエストを投げた場合、最大 play_count+1 回が記録される可能性がある。Turso (HTTP ベース) でのトランザクションロックは困難。詳細設計書 7.2 に明示的に記載・許容されており、ゲームの性質上（1日3回の軽微な制限超過）深刻なリスクではない。 |
| タイムアウト実装と @libsql/client/web の互換性 | PASS | `@libsql/client/web` は内部的にグローバル `fetch` を使用するため、`createClient` の `fetch` オプションでカスタム fetch を渡すパターンは公式サポートされている。AbortController + signal の組み合わせは Node.js 18+/Edge Runtime で動作確認済みの標準パターン。 |

---

## 残存リスク評価

| リスク | 現状の深刻度 | 推奨対応 | 優先度 |
|--------|------------|---------|--------|
| userId 偽装（他ユーザーとして recordScore 送信） | 中（影響範囲: ランキング汚染・不正スコア登録） | Server Actions はセッションなし設計のため、真の解決には認証基盤（NextAuth 等）が必要。短期対応として: UUID 形式チェック（実装済み）に加え、DB 側でユーザー存在確認を recordScore に追加する（外部キー制約または事前 SELECT）。 | P2（次リリースで検討） |
| recordScore の TOCTOU 競合 | 低（ゲーム性質上の軽微な超過のみ） | DB トランザクション使用または Redis ベースのアトミックカウンターへの移行。モバイルアプリの利用規模が拡大した際に再評価。 | P3（将来対応） |
| capacitor.config.ts のプレースホルダー URL | 高（APK リリースブロッカー） | Vercel デプロイ後に `REPLACE_WITH_VERCEL_URL` を実際の URL に置換すること。リリースチェックリストへの追加を強く推奨。 | P0（リリース前必須） |
| ALLOWED_ORIGINS に本番ドメイン未追加 | 低（現状は APK 経由のみ想定） | Web ブラウザ向けにも API を公開する場合、本番ドメイン（例: `https://brain-game-app.vercel.app`）を ALLOWED_ORIGINS に追加する。同一オリジンのサーバーレンダリングアクセスなら不要。 | P3（Web 公開時に対応） |
| nickname の \s による \t/\n 許容 | 極低（DB の表示問題程度） | `\s` を `\p{Z}` のみに絞るか、or \x09 等の制御文字を後段で trim する処理を追加。既に trimmedNickname で先頭末尾は除去済みのため深刻な問題ではない。 | P3（コード品質改善として） |
| GAME_META の未使用 import | 極低（ビルドサイズへの軽微な影響） | `noUnusedLocals: true` を tsconfig に追加してコンパイル時に警告化するか、不要 import を削除する。 | P4（コード整理） |

---

## PM への申し送り

- **完了とみなしてよいか**: 条件付きで YES。セキュリティ修正の実装はすべて設計書通りに完了しており、型チェックもパス。ただし **`capacitor.config.ts` の `server.url` を実際の Vercel URL に置換することがリリースの必須条件**（P0）。この作業が未完了のまま APK をビルドしても動作しない。
- **ユーザーへの説明事項**:
  1. Vercel デプロイ後に `capacitor.config.ts` の `url: 'https://REPLACE_WITH_VERCEL_URL'` を実際の URL に変更してから APK ビルドを行うこと。
  2. userId の偽装（他ユーザーとしてスコアを記録）は本修正では対処されていない。現状は「形式的に正しい UUID」を送れば別ユーザーとして記録可能。将来的な認証基盤の検討を推奨（P2）。
  3. レート制限は厳密ではない（同時送信で +1 回超過の可能性）が、モバイルゲームの性質上許容範囲内。
