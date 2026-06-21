import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "YouTube Sync Player — Watch Together in Perfect Sync",
  description:
    "Real-time synchronized YouTube video streaming with sub-millisecond precision. Host a stream, share the link, and watch together.",
  keywords: ["youtube", "sync", "watch together", "real-time", "streaming"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <head>
        {/* Google Identity Services — includes both id (One Tap) and oauth2 (Token) APIs */}
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body className="antialiased bg-[#0a0a12] text-white font-sans">
        {children}
      </body>
    </html>
  );
}
