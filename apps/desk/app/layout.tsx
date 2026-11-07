import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, Instrument_Serif, Inter } from "next/font/google";
import { BrandProvider } from "@/components/ferri";
import { brandFiles } from "@/lib/brand";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display-face", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif-face", display: "swap" });
const hand = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-hand-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Ferri", template: "%s · Ferri" },
  description:
    "Ferri is the open-source AI teammate for people who host community events. With your crew, it keeps the plan, ships the site and posters, puts the event on Luma and tracks who's coming. With your community, it keeps everyone informed on Discord, Telegram, Slack and WhatsApp. Built on Switch.",
  icons: { icon: "/m/icon/96", apple: "/m/icon/180" },
  metadataBase: new URL(process.env.FERRI_PUBLIC_URL || "http://localhost:3100"),
  openGraph: {
    type: "website",
    siteName: "Ferri",
    title: "Ferri: host the event, Ferri runs the rest",
    description: "The AI teammate for people who host community events. It works with your crew inside and your community outside, on every app. Open source, built on Switch.",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "Ferri, a friendly sea otter. Host the event. Ferri runs the rest." }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og-image.png"] },
};

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
};

// Sets the theme before the first paint: light, unless the visitor chose dark with the toggle.
// The key matches THEME_KEY in components/theme-toggle.tsx (v2: choices saved before 7 Nov are not read).
const THEME_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem("ferri-theme-v2")==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${body.variable} ${display.variable} ${serif.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans text-[14px]">
        <BrandProvider files={brandFiles()}>{children}</BrandProvider>
      </body>
    </html>
  );
}
