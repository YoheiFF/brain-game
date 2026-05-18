---
project_id: "2026-05-12-1000-privacy-policy"
phase: research
created: "2026-05-12"
---
# 情報収集レポート: プライバシーポリシー実装

## 結論サマリー

- AdMob（Google Mobile Ads SDK）を使用するため、プライバシーポリシーはGoogle Playへの提出必須要件であり、アプリ内からもリンクしなければならない。
- 収集データは「ユーザーID（UUID）・ニックネーム・年齢・ゲームスコア・プレイ回数（Turso DB保存）」と「AdMobが自動収集する広告ID・IPアドレス・デバイス情報・ユーザー操作ログ」の2系統に分けて開示する必要がある。
- 日本の個人情報保護法上、Tursoサーバーへのユーザーデータ送信と、AdMobへのデータ提供はいずれも第三者提供に該当し、利用目的と提供先の明示が必要。
- 現在のコードには同意ダイアログが存在しないため、プライバシーポリシー実装と同時に初回起動時の同意UI追加を検討すべき。
- Google Play Console への URL 登録は「アプリのコンテンツ > プライバシーポリシー」から行う。URL は全世界からアクセス可能な公開 URL（PDF 不可）であること。

---

## 確認済み事実

- **appId**: `com.braingame.app`（出典: `android/app/src/main/AndroidManifest.xml` line 29）
- **AdMob SDK 初期化**: `initializeForTesting: true` で初期化（テストモード）（出典: `lib/admob.ts` line 14-18）
- **AdMob APPLICATION_ID**: `ca-app-pub-3940256099942544~3347511713`（テスト用 ID）（出典: `AndroidManifest.xml` line 28-29）
- **Androidパーミッション**: `INTERNET`・`ACCESS_NETWORK_STATE` のみ宣言（出典: `AndroidManifest.xml` line 44-45）
- **ユーザーID生成**: `crypto.randomUUID()` でクライアント側生成 → localStorage 保存（出典: `lib/nickname.ts` line 37-43）
- **DB接続先**: Turso（libSQL/WebAPI）、接続情報は環境変数（出典: `lib/db.ts`）
- **API エンドポイント**: `/api/sync`（GET）・`/api/record-score`（POST）（出典: `app/api/` ディレクトリ）
- **ランキングへの公開データ**: ニックネームとスコアはランキングに全ユーザー分公開（出典: `lib/db-scores.ts` line 51-108）
- **年齢**: localStorage のみ保存。DB の `users` テーブルには `age` カラムが存在するが `upsertUser` 経由で送信される（出典: `components/NicknameModal.tsx` line 46）
- **デプロイ先**: Vercel（`https://brain-game-opal.vercel.app`）

---

## 収集・処理しているデータ一覧（コードベース調査結果）

| データ種別 | 保存先 | 目的 | 第三者提供 |
|---|---|---|---|
| ユーザーID（UUID・ランダム生成） | localStorage + Turso DB（`users` テーブル） | ユーザー識別・スコア紐付け | Turso（データ処理業者） |
| ニックネーム（最大12文字・任意入力） | localStorage + Turso DB（`users` テーブル） | ランキング表示 | Turso（データ処理業者）・ランキングに全ユーザーへ公開 |
| 年齢（任意入力） | localStorage + Turso DB（`users.age`） | 年齢別ベンチマーク比較 | Turso（データ処理業者） |
| ゲームスコア（ゲームID・スコア値） | localStorage + Turso DB（`scores` テーブル） | ベスト記録・ランキング計算 | Turso（データ処理業者）・ランキングに公開 |
| 日別プレイ回数・日別ベストスコア | localStorage + Turso DB（`daily_plays` テーブル） | 1日3回制限の管理 | Turso（データ処理業者） |
| 日別総合ポイント・プレイゲーム数 | Turso DB（`daily_history` テーブル） | 過去14日分の統計グラフ | Turso（データ処理業者） |
| 広告識別子（Android Advertising ID） | Google AdMob（自動収集） | パーソナライズ広告配信 | Google LLC |
| IPアドレス | Google AdMob（自動収集） | デバイス位置推定・不正防止 | Google LLC |
| ユーザー操作ログ（タップ・動画視聴） | Google AdMob（自動収集） | 広告パフォーマンス測定 | Google LLC |
| デバイス診断情報（クラッシュ・性能） | Google AdMob（自動収集） | SDK パフォーマンス改善 | Google LLC |

---

## Google Play 必須要件

- **プライバシーポリシー URL の登録**: Play Console「アプリのコンテンツ > プライバシーポリシー」でURLを登録必須（出典: https://support.google.com/googleplay/android-developer/answer/9859455?hl=ja）
- **URL 要件**: 全世界からアクセス可能な公開 URL（PDF 不可、地域制限不可）
- **アプリ内リンク**: ストアページへの掲載に加え、アプリ内からもプライバシーポリシーへリンクすること
- **プライバシーポリシーと明記**: タイトルや見出しに「プライバシーポリシー」と明示すること
- **データセーフティセクション**: Play Console のデータセーフティフォームに、収集データ・共有先・暗号化有無・削除可否を正確に記入する義務あり（AdMob が自動収集するデータも含めて開発者の責任で申告）
- **認識しやすい開示と同意**: バックグラウンドでのデータ収集や予期を超えるデータ利用には、アプリ通常使用時に目立つ形で開示 + 明示的な同意取得が必須
- **データ販売禁止**: ユーザーデータを売買してはならない
- **機密データの追加要件**: 個人情報・財務情報・位置情報・健康データは特に保護義務あり（本アプリでは年齢が該当する可能性）

---

## AdMob 必須記載事項

- **データ収集の開示**: AdMob 使用によって生じるデータ収集・共有・利用を明示すること（出典: https://developers.google.com/admob/android/privacy/play-data-disclosure）
- **第三者クッキー開示**: 広告配信の結果としてサードパーティがクッキーを設置することがある旨を開示
- **自動収集データの列挙**: Google Mobile Ads SDK が自動収集する以下のデータを開示
  - IPアドレス（位置情報推定に使用）
  - ユーザー操作情報（アプリ起動・タップ・動画視聴）
  - 診断情報（パフォーマンス・クラッシュログ）
  - デバイス・アカウント識別子（Android 広告ID・アプリセットIDなど）
- **パーソナライズ広告の説明**: Google が広告 ID と人口統計カテゴリを興味関心ベース広告に使用することを説明
- **オプトアウト手段**: ユーザーが広告のパーソナライズをオプトアウトできる手段または方法を記載（Google の広告設定ページへのリンク等）
- **Google プライバシーポリシーへのリンク**: `https://policies.google.com/privacy` へのリンクを含めること
- **TCF v2.3 対応**: 2026年2月28日 期限で IAB Europe の Transparency and Consent Framework v2.3 への移行が必須（EEA/英国向けだが、グローバル配信の場合は考慮が必要）
- **データ暗号化**: AdMob はすべてのデータを TLS で暗号化送信している旨を開示可能（Play のデータセーフティで「転送中に暗号化」に該当）

---

## 日本の個人情報保護法 対応要件

（根拠法: 個人情報の保護に関する法律、2024年4月1日施行の改正施行規則含む）

- **個人情報取扱事業者の記載**: 開発者の氏名または名称・住所・連絡先（メールアドレス等）を必ず記載
- **利用目的の特定・明示**: 収集する個人情報の利用目的を具体的に記載（「ゲームスコアの記録・ランキング表示・広告配信の最適化」等）
- **第三者提供の明示**: Turso（データ処理受託）および Google AdMob（広告目的）への提供を明示。提供先の名称・所在国・利用目的を記載
  - Turso: 米国法人（ChiselStrike, Inc.）へのデータ移転に該当
  - Google AdMob: 米国 Google LLC へのデータ提供（第三者提供または委託）
- **外国にある第三者への提供**: 個人情報保護法第28条により、日本から外国の第三者へデータ提供する場合は、相手国の個人情報保護制度の情報提供が必要
- **保有個人データの開示等請求対応**: 開示・訂正・削除・利用停止の請求窓口と手順を記載
- **安全管理措置**: データ漏洩防止のための安全管理措置について記載（暗号化・アクセス制御等）
- **苦情・問い合わせ窓口**: 連絡先メールアドレスまたはフォームURLを記載
- **保存期間**: データの保存期間または保存期間を決定する基準を記載
- **個人情報保護委員会**: 個人情報に関する苦情は個人情報保護委員会（https://www.ppc.go.jp/）に申し出可能であることを記載（任意だが推奨）
- **2026年改正動向**: 2026年通常国会に改正法案提出予定（課徴金制度導入・16歳未満保護強化）。現時点では現行法に準拠すれば足りる

---

## プライバシーポリシーに含めるべき必須セクション

1. **はじめに（概要）**: アプリ名・開発者・最終更新日・有効日を記載
2. **収集する情報**: ユーザーが入力する情報（ニックネーム・年齢）と自動収集される情報（AdMob 収集データ）を区別して列挙
3. **情報の利用目的**: ゲーム機能提供・ランキング表示・広告配信・サービス改善など用途別に明記
4. **第三者へのデータ提供**:
   - Google AdMob（広告配信・分析目的）→ https://policies.google.com/privacy へリンク
   - Turso / ChiselStrike, Inc.（データベース受託処理）
   - Vercel, Inc.（ホスティング）
5. **外国への個人情報の提供**: 米国のサービス事業者（Google・Turso・Vercel）への提供と、各社のプライバシーポリシーへのリンク
6. **ユーザーの権利**: 開示・訂正・削除・利用停止の請求方法と連絡先
7. **広告について**: パーソナライズ広告の説明・AdMob のオプトアウト方法（Googleの広告設定へのリンク）・非パーソナライズ広告オプション
8. **データの保存期間**: 各データの保存期間（例: アカウント削除まで保持 / ランキングデータは〇〇期間保持）
9. **データの安全管理**: HTTPS/TLS 暗号化・アクセス制御について記載
10. **Cookie および類似技術**: AdMob によるクッキー・デバイス識別子の使用について
11. **子供のプライバシー**: 本アプリは13歳未満（COPPA）・16歳未満（2026年改正予定）の利用に関する方針
12. **プライバシーポリシーの変更**: 変更通知の方法（アプリ内通知・アプリストア更新など）
13. **お問い合わせ**: 開発者のメールアドレス・問い合わせフォームURL

---

## 設計者への申し送り

- **同意 UI が未実装**: 現在のコードでは初回起動時のプライバシーポリシー同意ダイアログが存在しない（NicknameModal でニックネーム入力のみ）。Google Play の「認識しやすい開示と同意」要件を満たすため、ニックネーム設定前または同時にプライバシーポリシー同意フローを追加すること
- **AdMob テストモード確認**: `lib/admob.ts` では `initializeForTesting: true` のままのため、本番リリース前に `false` に変更し、実際の AdMob 広告 ID（テスト ID `ca-app-pub-3940256099942544` から本番 ID）に差し替えること
- **プライバシーポリシーのホスティング先**: Vercel（brain-game-opal.vercel.app）内の `/privacy` ページとして実装するか、GitHub Pages 等の外部 URL に置く。URL は変更しないことが推奨
- **アプリ内リンク配置**: タイトル画面またはニックネーム設定モーダルの下部に「プライバシーポリシー」テキストリンクを追加する必要あり
- **Play Console データセーフティ記入**: AdMob が自動収集するデータ（広告ID・IPアドレス・操作ログ等）を含めてフォームに記入すること。`developers.google.com/admob/android/privacy/play-data-disclosure` に具体的な記入例が掲載されている
- **年齢データの扱い**: 年齢は DB に保存されている可能性があるため（`upsertUser` 参照）、プライバシーポリシー内で明示的に開示すること
- **Turso の所在地**: Turso は米国法人（ChiselStrike, Inc.）のサービスであり、日本の個人情報保護法第28条の外国第三者提供として情報提供義務がある。DB のリージョン（nrt=東京 等）を確認し、データ所在地をポリシーに反映すること
- **削除リクエスト対応**: Google Play のポリシー上、アプリがアカウントを持つ場合（本アプリは users テーブルでユーザー管理しているため該当）、アカウント削除機能またはメール等での削除依頼受付が必要。設計・実装のスコープに含めること
- **COPPA/児童対応**: 対象ユーザーに年齢制限なしの場合、13歳未満を意図的に収集しない旨を記載すれば COPPA 対応として十分

---

## 参考 URL（出典）

- Google Play データ開示（AdMob）: https://developers.google.com/admob/android/privacy/play-data-disclosure
- Google Play ユーザーデータポリシー: https://support.google.com/googleplay/android-developer/answer/10144311
- AdMob プライバシー戦略: https://support.google.com/admob/answer/11402075
- Google AdMob ポリシー透明性センター: https://transparency.google/intl/en_us/our-policies/product-terms/google-admob/
- iubenda AdMob プライバシーポリシーガイド: https://www.iubenda.com/en/blog/privacy-policy-admob/
- 個人情報保護法実務ガイド 2026年版: https://legal-gpt.com/kojin-2025-practical-guide/
- AdMob 地域別同意実装ガイド（note）: https://note.com/itquality/n/nd02569aea1a8
- Play Console 審査準備（JP）: https://support.google.com/googleplay/android-developer/answer/9859455?hl=ja
