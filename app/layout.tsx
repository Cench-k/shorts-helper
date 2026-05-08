import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shorts Helper",
  description: "긴 영상을 쇼츠로 편집",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
