import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { RegisterSW } from "@/app/components/RegisterSW";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import { LanguageProvider } from "@/app/components/LanguageProvider";
import { getSettings } from "@/lib/settings-store";
import { t } from "@/lib/i18n";
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

export function generateMetadata(): Metadata {
  const { language } = getSettings();
  return {
    title: t(language, "app.title"),
    description: t(language, "app.description"),
    manifest: "/manifest.webmanifest",
  };
}

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
      lang={settings.language}
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        <RegisterSW />
        <ThemeProvider initial={settings.theme}>
          <LanguageProvider initial={settings.language}>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
