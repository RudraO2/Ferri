import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, Inter } from "next/font/google";
import { BrandProvider } from "@/components/ferri";
import { brandFiles } from "@/lib/brand";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display-face", display: "swap" });
const hand = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-hand-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Ferri", template: "%s · Ferri" },
  description: "Ferri answers your community on every app, asks your crew once when it doesn't know, and carries the answer back to everyone. Built on Switch.",
  icons: { icon: "/m/icon/96", apple: "/m/icon/180" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1b1e" },
  ],
};

// Sets the theme before the first paint: the saved choice, else the system's.
const THEME_SCRIPT = `try{var t=localStorage.getItem("ferri-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans text-[14px]">
        <BrandProvider files={brandFiles()}>{children}</BrandProvider>
      </body>
    </html>
  );
}
