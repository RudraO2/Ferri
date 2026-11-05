import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ferri Desk",
  description: "Where organizers run Ferri: spaces, modes, knowledge, crew and cards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-[14px]">{children}</body>
    </html>
  );
}
