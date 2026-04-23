import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "補助金マッチャー",
  description: "受注案件に合う補助金をAIが提案します",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
