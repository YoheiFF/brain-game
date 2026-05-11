import type { Metadata } from "next";
import "./globals.css";
import AdMobInit from "@/components/AdMobInit";

export const metadata: Metadata = {
  title: "BrainGame - 脳トレアプリ",
  description: "様々な脳トレゲームで頭を鍛えよう",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AdMobInit />
        {children}
      </body>
    </html>
  );
}
