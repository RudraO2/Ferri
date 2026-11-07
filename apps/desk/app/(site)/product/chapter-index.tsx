"use client";

import { useEffect, useRef, useState } from "react";

export type Chapter = { id: string; label: string };

/**
 * The chapter bar under the nav: sticks while the tour scrolls and marks the chapter
 * in view. On a phone it scrolls sideways inside itself, never the page.
 */
export function ChapterIndex({ chapters }: { chapters: Chapter[] }) {
  const [active, setActive] = useState(chapters[0]?.id ?? "");
  const rail = useRef<HTMLDivElement>(null);

  // The active chapter is the last one whose top has passed the band under the bar.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = chapters[0]?.id ?? "";
      for (const c of chapters) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= 160) current = c.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [chapters]);

  // Keep the active chip visible in the sideways rail, without moving the page.
  useEffect(() => {
    const box = rail.current;
    const chip = box?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!box || !chip) return;
    const left = chip.offsetLeft - box.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav aria-label="Chapters" className="sticky top-[76px] z-30 px-4">
      <div className="mx-auto w-fit max-w-full rounded-full lg:max-w-[1080px] border border-zinc-200 bg-white/85 shadow-[var(--shadow-card)] backdrop-blur-md">
        <div ref={rail} className="flex gap-1 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chapters.map((c) => {
            const on = c.id === active;
            return (
              <a
                key={c.id}
                data-id={c.id}
                href={`#${c.id}`}
                aria-current={on ? "true" : undefined}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition ${
                  on ? "bg-brand text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {c.label}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
