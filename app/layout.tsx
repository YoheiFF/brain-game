import type { Metadata } from "next";
import "./globals.css";
import AdMobInit from "@/components/AdMobInit";
import BGMProvider from "@/components/BGMProvider";

export const metadata: Metadata = {
  title: "BrainGame - 脳トレアプリ",
  description: "様々な脳トレゲームで頭を鍛えよう",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AdMobInit />
        <BGMProvider>
          {children}
        </BGMProvider>
      </body>
    </html>
  );
}
