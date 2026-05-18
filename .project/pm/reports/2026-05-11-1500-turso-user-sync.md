---
project_id: "2026-05-11-1500-turso-user-sync"
created: "2026-05-11"
overall_status: conditional-pass
---

# PM 最終報告: 2026-05-11-1500-turso-user-sync

## 依頼
localStorage 管理のユーザー情報を Turso DB へ移行し、デバイス間リアルタイム同期を実現する。

## 情報収集フェーズ（主要発見）
1. localStorage キーは 6 つ。全ページが "use client" で localStorage 直参照
2. @libsql/client/web が Next.js 14 で最も安全。Embedded Replicas はサーバーレス不可
3. リアルタイム同期はポーリング（30 秒）+ revalidatePath が現実的な最適解

## 設計フェーズ
- 影響範囲: 新規 8 ファイル + 変更 5 ファイル = 計 13 ファイル
- 設計書: `.project/design/2026-05-11-1500-turso-user-sync/`

## 実装フェーズ
- 完了: 13 / 13 ファイル
- 設計差異: 1 件（lib/scores.ts の dynamic import — セキュリティ上より安全な判断）
- work-log: `.project/engineering/2026-05-11-1500-turso-user-sync/work-log.md`

## QA フェーズ
- 総合判定: conditional-pass
- 設計準拠: 13 / 13 pass
- TypeScript カテゴリ B エラー（コードロジック）: 0 件
- TypeScript カテゴリ A エラー（未インストールパッケージ）: 3 件 → npm install 後に解消

## ユーザーが行うべきセットアップ手順

### Step 1: Turso CLI でデータベース作成
```bash
turso db create braingame
turso db show braingame --url   # → TURSO_DATABASE_URL
turso db tokens create braingame  # → TURSO_AUTH_TOKEN
```

### Step 2: パッケージインストール
```bash
npm install @libsql/client server-only dotenv
```

### Step 3: 環境変数設定
`.env.local` に追記:
```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

### Step 4: スキーマ作成
```bash
npx ts-node scripts/migrate-schema.ts
```

### Step 5: ビルド確認
```bash
npm run build
```

## 残課題（将来対応）
- 既存 localStorage データの移行スクリプト（現在は新規プレイ分から DB 保存）
- Turso のベンチマーク再調整（5×5 化による影響）
- Android（Capacitor）での動作確認
