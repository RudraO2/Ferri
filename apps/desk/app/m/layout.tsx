import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "./sw-register";

// iPhone launch screens (CSS size × pixel ratio = /m/splash/<w>x<h>).
const SPLASH: [number, number, number][] = [
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [428, 926, 3],
  [430, 932, 3],
  [414, 896, 2],
  [375, 667, 2],
];

export const metadata: Metadata = {
  title: { absolute: "Ferri Pocket" },
  description: "Answer your community from your phone: questions Ferri could not answer, replies waiting for your OK, and who is stuck.",
  manifest: "/m/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pocket",
    statusBarStyle: "default",
    startupImage: SPLASH.map(([w, h, r]) => ({
      url: `/m/splash/${w * r}x${h * r}`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  icons: { icon: "/m/icon/192", apple: "/m/icon/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Light, like the page: Pocket opens in light whatever the phone's own setting is.
  themeColor: "#fbf7f0",
};

export default function PocketRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="pocket mx-auto min-h-dvh max-w-[520px] bg-zinc-50">
      <ServiceWorker />
      {children}
    </div>
  );
}
