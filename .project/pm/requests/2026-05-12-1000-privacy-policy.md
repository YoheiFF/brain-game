---
project_id: "2026-05-12-1000-privacy-policy"
created: "2026-05-12"
---

# 依頼: プライバシーポリシーの調査・実装

## 依頼内容
BrainGame（Next.js 14 + Capacitor Android）においてプライバシーポリシーが未実装。
Google PlayストアへのAPK提出・AdMob利用に必要なプライバシーポリシーの内容を調査し、実装する。

## 前提条件
- アプリ: 脳トレゲームアプリ（Next.js 14 + Capacitor Android）
- 配信方法: Google Playストア（Android APK）
- マネタイズ: AdMob リワード広告
- DB: Turso（ユーザーID・スコア・ニックネームを保存）
- デプロイ先: Vercel（https://brain-game-opal.vercel.app）
- appId: com.braingame.app

## 成功条件
1. プライバシーポリシーページが /privacy-policy に存在する
2. Google Play提出要件・AdMob要件を満たす内容が記載されている
3. タイトル画面からリンクされている
4. ビルドが通る
