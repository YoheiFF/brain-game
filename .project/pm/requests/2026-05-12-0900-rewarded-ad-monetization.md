---
project_id: "2026-05-12-0900-rewarded-ad-monetization"
created: "2026-05-12"
---

# 依頼内容

## 概要
リワード広告（動画広告視聴でプレイ回数回復）マネタイズ機能を実装済み。
PMパイプラインを遡及実行し、情報収集・設計書作成・実装検証・QAを行う。
問題が発見された場合は設計書および必要に応じてコードを修正する。

## 背景
- `@capacitor-community/admob@8.0.0` を使用
- 各ゲームで1日3回基本プレイ + 広告視聴で最大3回追加（計6回/日）
- 実装はすでに完了済みだがPMパイプラインを経由していなかった

## 対象ファイル（実装済み）
- `lib/admob.ts` (新規)
- `lib/daily.ts` (変更)
- `components/WatchAdButton.tsx` (新規)
- `components/AdMobInit.tsx` (新規)
- `app/layout.tsx` (変更)
- `app/games/*/page.tsx` 5ファイル (変更)
- `app/api/record-score/route.ts` (変更)
- `android/app/src/main/AndroidManifest.xml` (変更)

## 成功条件
- 設計書が実装を正確に記述している
- QAで問題なし（型チェック・ビルド・コードレビュー）
- 問題があれば修正完了
