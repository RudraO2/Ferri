import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "./sw-register";

export const metadata: Metadata = {
  title: "Ferri Pocket",
  description: "Answer your community from your phone: questions Ferri could not answer, replies waiting for your OK, and who is stuck.",
  manifest: "/m/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Pocket", statusBarStyle: "default" },
  icons: { icon: "/m/icon/192", apple: "/m/icon/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafafa",
};

export default function PocketRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="pocket mx-auto min-h-dvh max-w-[520px] bg-zinc-50">
      <ServiceWorker />
      {children}
    </div>
  );
}
