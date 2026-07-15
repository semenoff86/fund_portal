import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "МКК — Корпоративный портал",
  description: "Внутренний портал сотрудников микрокредитной компании",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} ${inter.className}`}>
        {children}
        <Toaster position="top-right" richColors closeButton duration={3000} />
      </body>
    </html>
  );
}
