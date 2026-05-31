import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "灵语 Aura",
  description:
    "Aura 是一个 AI 对话式英语学习助手，支持 OCR、词汇提取、发音生成与飞书同步。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
