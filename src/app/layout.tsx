import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lotmonster — Inventory for CPG Makers",
  description: "AI-native lot tracking, recipe costing, and QuickBooks sync for small CPG manufacturers.",
  icons: {
    icon: [
      { url: "/LotMonster_Favicon_16px.png", sizes: "16x16", type: "image/png" },
      { url: "/LotMonster_Favicon_32px.png", sizes: "32x32", type: "image/png" },
      { url: "/LotMonster_Favicon_48px.png", sizes: "48x48", type: "image/png" },
      { url: "/LotMonster_Favicon_128px.png", sizes: "128x128", type: "image/png" },
      { url: "/LotMonster_Favicon_256px.png", sizes: "256x256", type: "image/png" },
    ],
    apple: "/LotMonster_Favicon_256px.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
