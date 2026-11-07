"use client";

import { useEffect, useRef } from "react";

/**
 * The phone menu in the header: a disclosure that works without JavaScript,
 * and closes once a link in it is followed, on a click outside it or on Escape.
 */
export function Menu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as Element | null;
      if (!target || !menu.contains(target) || target.closest("a")) menu.open = false;
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className="menu">
      {children}
    </details>
  );
}
