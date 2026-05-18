---
project_id: "2026-05-12-1000-privacy-policy"
created: "2026-05-12"
status: completed
overall_qa: pass
---

# PM最終報告: 2026-05-12-1000-privacy-policy

## 依頼
プライバシーポリシーが未実装のため、Google Play提出・AdMob利用要件を満たす内容を調査し実装する。

## 情報収集
- AdMob利用アプリはGoogle Playへのプライバシーポリシー登録が必須（URL形式、全世界からアクセス可能）
- 収集データは2系統: アプリ自身（UUID・ニックネーム・年齢・スコア）+ AdMob自動収集（広告ID・IP・操作ログ）
- Turso（米国 ChiselStrike, Inc.）・Vercel・Google への第三者提供として個人情報保護法上の開示が必要
- NicknameModal に同意UIがなかったため、Google Playの「認識しやすい開示と同意」要件に対応が必要

## 設計
影響範囲: 3ファイル（新規1・変更2）
- 新規: `app/privacy-policy/page.tsx`（全12セクション、Server Component、SSG）
- 変更: `app/page.tsx`（フッターにリンク追加）
- 変更: `components/NicknameModal.tsx`（同意チェックボックス追加）

## 実装
完了: 3 / 3ファイル、追加パッケージなし

## テスト
総合判定: **PASS**（17/17チェック項目PASS）
- TypeScript: エラー0件
- ビルド: 14ページ成功（/privacy-policy が SSG として生成）

## 残課題（本番リリース前）
1. Google Play Console「アプリのコンテンツ > プライバシーポリシー」に `https://brain-game-opal.vercel.app/privacy-policy` を登録
2. Play Console「データセーフティ」フォームに収集データを記入（AdMob自動収集分を含む）
3. 実機（Android WebView）でのリンク動作確認（`target="_blank"` の挙動）
4. AdMobテストID → 本番IDへの差し替え（別プロジェクト既出のP0課題）
