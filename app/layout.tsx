import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { RegisterSW } from "@/app/components/RegisterSW";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import { getSettings } from "@/lib/settings-store";
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

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f6" },
    { media: "(prefers-color-scheme: dark)", color: "#10151c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = getSettings();
  // Apply the dark class before hydration to avoid a flash of the wrong theme.
  const themeInit = `(function(){try{var t=${JSON.stringify(settings.theme)};var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

  return (
    <html
      lang="nl"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        <RegisterSW />
        <ThemeProvider initial={settings.theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
