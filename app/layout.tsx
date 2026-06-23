import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { RegisterSW } from "@/app/components/RegisterSW";
import "./globals.css";

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Huisbediening",
  description: "Bedien verlichting en klimaat tijdens je bezoek",
  manifest: "/manifest.webmanifest",
};

export const viewport = { themeColor: "#eef1f6" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="nl"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
