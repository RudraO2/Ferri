"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page from the server every few seconds, unless someone is typing. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      const el = document.activeElement;
      const typing = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
      if (!typing && document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
