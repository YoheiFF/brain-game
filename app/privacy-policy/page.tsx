import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー | BrainGame",
  description:
    "BrainGame のプライバシーポリシーです。収集するデータ・利用目的・第三者提供について説明します。",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen">
      <div className="card p-6 sm:p-8 flex flex-col gap-2">

        {/* 戻るリンク */}
        <Link
          href="/"
          className="text-[#6c63ff] text-sm hover:text-purple-400 transition-colors mb-2 inline-block"
        >
          ← ホームへ戻る
        </Link>

        {/* タイトル */}
        <h1 className="text-2xl font-black text-white mb-2">プライバシーポリシー</h1>
        <p className="text-[#64748b] text-xs mb-4">最終更新日: 2026年5月12日</p>

        {/* 1. はじめに */}
        <Section title="はじめに">
          <p>
            本プライバシーポリシーは、個人開発者（以下「開発者」）が提供する脳トレアプリ「BrainGame」（以下「本アプリ」）における、ユーザーの個人情報の取り扱いについて説明します。
          </p>
          <p>
            本アプリを利用することで、本ポリシーに記載された内容に同意したものとみなします。
          </p>
          <table className="w-full text-xs mt-3 border-collapse">
            <tbody>
              <TableRow label="アプリ名" value="BrainGame" />
              <TableRow label="開発者" value="個人開発者" />
              <TableRow label="連絡先" value="creativetan@outlook.jp" />
              <TableRow label="ホスティング" value="Vercel (brain-game-opal.vercel.app)" />
            </tbody>
          </table>
        </Section>

        {/* 2. 収集する情報 */}
        <Section title="収集する情報">
          <SubHeading>ユーザーが入力する情報</SubHeading>
          <ul className="list-disc list-inside space-y-1">
            <li>ニックネーム（最大12文字、任意入力）</li>
            <li>年齢（任意入力）</li>
            <li>ゲームスコア（各ゲームのベスト記録）</li>
            <li>プレイ回数・日別プレイ履歴</li>
            <li>ユーザーID（端末内でランダム生成される UUID。ユーザーが直接入力するものではありません）</li>
          </ul>
          <p className="mt-2">
            これらの情報は端末の localStorage および Turso（クラウドデータベース）に保存されます。
            ニックネームとスコアはランキング機能で他のユーザーに公開されます。
          </p>

          <SubHeading>自動的に収集される情報（Google AdMob）</SubHeading>
          <p>
            本アプリは広告配信のために Google AdMob（Google LLC）を使用しています。
            AdMob SDK は以下の情報を自動的に収集します。
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>広告識別子（Android Advertising ID）</li>
            <li>IPアドレス（位置情報の推定に使用）</li>
            <li>ユーザー操作情報（アプリ起動・タップ・動画視聴ログ）</li>
            <li>デバイス診断情報（パフォーマンス・クラッシュログ）</li>
            <li>デバイス識別子・アプリセット ID</li>
          </ul>
          <p className="mt-2">
            これらのデータの収集・利用は Google のプライバシーポリシーに従います。
            詳細は{" "}
            <ExternalLink href="https://policies.google.com/privacy">
              https://policies.google.com/privacy
            </ExternalLink>{" "}
            をご確認ください。
          </p>
        </Section>

        {/* 3. 情報の利用目的 */}
        <Section title="情報の利用目的">
          <ul className="list-disc list-inside space-y-1">
            <li>ゲーム機能の提供（スコア記録・ランキング表示・ベンチマーク比較）</li>
            <li>1日あたりのプレイ回数制限の管理</li>
            <li>年齢別の平均スコアとの比較機能</li>
            <li>広告の配信・広告パフォーマンスの測定（AdMob 経由）</li>
            <li>アプリの品質改善・不具合対応</li>
          </ul>
        </Section>

        {/* 4. 第三者へのデータ提供 */}
        <Section title="第三者へのデータ提供">
          <p>
            開発者は以下の第三者にユーザーデータを提供または処理委託しています。
            それ以外の第三者へのデータ販売・提供は行いません。
          </p>
          <table className="w-full text-xs mt-3 border-collapse">
            <thead>
              <tr className="border-b border-[#2a2a4a]">
                <th className="text-left py-2 pr-3 text-[#64748b] font-bold">提供先</th>
                <th className="text-left py-2 pr-3 text-[#64748b] font-bold">目的</th>
                <th className="text-left py-2 text-[#64748b] font-bold">プライバシーポリシー</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#2a2a4a]">
                <td className="py-2 pr-3 text-[#94a3b8]">Google LLC (AdMob)</td>
                <td className="py-2 pr-3 text-[#94a3b8]">広告配信・分析</td>
                <td className="py-2 text-[#94a3b8]">
                  <ExternalLink href="https://policies.google.com/privacy">Google ポリシー</ExternalLink>
                </td>
              </tr>
              <tr className="border-b border-[#2a2a4a]">
                <td className="py-2 pr-3 text-[#94a3b8]">ChiselStrike, Inc. (Turso)</td>
                <td className="py-2 pr-3 text-[#94a3b8]">データベース処理委託</td>
                <td className="py-2 text-[#94a3b8]">
                  <ExternalLink href="https://turso.tech/privacy-policy">Turso ポリシー</ExternalLink>
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-[#94a3b8]">Vercel, Inc.</td>
                <td className="py-2 pr-3 text-[#94a3b8]">Webアプリホスティング</td>
                <td className="py-2 text-[#94a3b8]">
                  <ExternalLink href="https://vercel.com/legal/privacy-policy">Vercel ポリシー</ExternalLink>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* 5. 外国への個人情報の提供 */}
        <Section title="外国への個人情報の提供">
          <p>
            上記の第三者（Google LLC・ChiselStrike, Inc.・Vercel, Inc.）はいずれも米国法人であり、
            ユーザーの個人情報は米国に所在するサーバーで処理・保存される場合があります。
          </p>
          <p className="mt-2">
            個人情報保護法第28条に基づき、各社は適切なデータ保護措置を講じています。
            詳細は各社のプライバシーポリシーをご参照ください。
          </p>
        </Section>

        {/* 6. 広告について */}
        <Section title="広告について">
          <p>
            本アプリは Google AdMob を通じて広告を配信しています。
            Google は広告 ID や人口統計カテゴリを使用して、
            ユーザーの興味・関心に基づくパーソナライズ広告を配信することがあります。
          </p>
          <p className="mt-2">
            パーソナライズ広告をオプトアウトするには、お使いの Android 端末の「設定」→「Google」→「広告」から
            「広告のパーソナライズを無効にする」を選択してください。
            また、{" "}
            <ExternalLink href="https://adssettings.google.com/">
              Google 広告設定
            </ExternalLink>{" "}
            からも管理が可能です。
          </p>
          <p className="mt-2">
            広告配信の結果として、サードパーティがクッキーやデバイス識別子を設置することがあります。
          </p>
        </Section>

        {/* 7. ユーザーの権利 */}
        <Section title="ユーザーの権利">
          <p>
            ユーザーは開発者に対して、保有する個人情報の開示・訂正・削除・利用停止を請求することができます。
          </p>
          <p className="mt-2">
            請求・お問い合わせはメールにて受け付けています:
          </p>
          <p className="mt-1 font-bold text-white">
            creativetan@outlook.jp
          </p>
          <p className="mt-2">
            アカウントの削除（ユーザーID・スコア・プロフィール情報の全削除）をご希望の場合も、
            上記メールアドレスにご連絡ください。合理的な期間内に対応いたします。
          </p>
        </Section>

        {/* 8. データの保存期間 */}
        <Section title="データの保存期間">
          <ul className="list-disc list-inside space-y-1">
            <li>ユーザープロフィール・スコア: ユーザーからの削除リクエストがあるまで保持</li>
            <li>日別プレイ履歴: 直近14日分を保持</li>
            <li>AdMob が収集するデータ: Google のポリシーに従う</li>
          </ul>
        </Section>

        {/* 9. データの安全管理 */}
        <Section title="データの安全管理">
          <ul className="list-disc list-inside space-y-1">
            <li>通信はすべて HTTPS / TLS により暗号化されています</li>
            <li>Turso データベースへのアクセスは環境変数で管理されたトークンにより制限されています</li>
            <li>AdMob との通信はすべて TLS により暗号化されています</li>
          </ul>
        </Section>

        {/* 10. 子供のプライバシー */}
        <Section title="子供のプライバシー">
          <p>
            本アプリは13歳未満の方を対象としていません。
            13歳未満の方の個人情報を意図的に収集することはありません。
            13歳未満の方が本アプリを利用していることが判明した場合、
            当該情報を速やかに削除いたします。
          </p>
        </Section>

        {/* 11. プライバシーポリシーの変更 */}
        <Section title="プライバシーポリシーの変更">
          <p>
            本ポリシーは必要に応じて改定されることがあります。
            重要な変更がある場合は、アプリのアップデート情報または本ページにて通知します。
            最終更新日を必ずご確認ください。
          </p>
        </Section>

        {/* 12. お問い合わせ */}
        <Section title="お問い合わせ">
          <p>本ポリシーに関するご質問・ご意見は以下までお問い合わせください。</p>
          <p className="mt-1 font-bold text-white">creativetan@outlook.jp</p>
          <p className="mt-3 text-xs text-[#64748b]">
            個人情報の取り扱いに関する苦情は、個人情報保護委員会（
            <ExternalLink href="https://www.ppc.go.jp/">https://www.ppc.go.jp/</ExternalLink>
            ）に申し出ることもできます。
          </p>
        </Section>

        {/* フッター */}
        <p className="text-[#2a2a4a] text-xs mt-6 text-right">最終更新日: 2026年5月12日</p>
      </div>
    </main>
  );
}

/* ---- 内部ヘルパーコンポーネント ---- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold text-[#6c63ff] mb-2 border-b border-[#2a2a4a] pb-1">
        {title}
      </h2>
      <div className="text-[#94a3b8] text-sm leading-relaxed flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-white font-bold text-sm mt-2 mb-1">{children}</h3>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#6c63ff] underline hover:text-purple-400 transition-colors"
    >
      {children}
    </a>
  );
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[#2a2a4a]">
      <td className="py-1.5 pr-4 text-[#64748b] font-bold w-28">{label}</td>
      <td className="py-1.5 text-[#94a3b8]">{value}</td>
    </tr>
  );
}
