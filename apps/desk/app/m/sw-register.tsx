"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Registers Pocket's service worker (scope /m) and refreshes the page when a push arrives. */
export function ServiceWorker() {
  const router = useRouter();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/m/sw.js", { scope: "/m", updateViaCache: "none" }).catch(() => {});
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "ferri-push") router.refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
