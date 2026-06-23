import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RegisterSW } from "@/app/components/RegisterSW";
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
  title: "Huisbediening",
  description: "Bedien verlichting en klimaat tijdens je bezoek",
  manifest: "/manifest.webmanifest",
};

export const viewport = { themeColor: "#0a0a0a" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
