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
  description: "Ferri is the open-source AI teammate for event organizers. It answers your attendees on Discord, Telegram, Slack and WhatsApp with a source on every reply, and asks your crew once when it doesn't know. Built on Switch.",
  icons: { icon: "/m/icon/96", apple: "/m/icon/180" },
  metadataBase: new URL(process.env.FERRI_PUBLIC_URL || "http://localhost:3100"),
  openGraph: {
    type: "website",
    siteName: "Ferri",
    title: "Ferri: run the event, Ferri runs the group chats",
    description: "Answers your attendees on every app, with a source. Asks your crew once when it doesn't know. Open source, built on Switch.",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "Ferri, a friendly sea otter: every question, answered once." }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og-image.png"] },
};

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
};

// Sets the theme before the first paint: light, unless the visitor chose dark with the toggle.
const THEME_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem("ferri-theme")==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;

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
