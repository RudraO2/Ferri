"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { FerriLogo } from "@/components/ferri";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB } from "./links";

const LINKS = [
  { href: "/product", label: "Product" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/switch", label: "Built on Switch" },
  { href: "/start", label: "Get started" },
];

export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="sticky top-3 z-40 px-4">
      <nav
        aria-label="Main"
        className={`mx-auto flex max-w-[1080px] items-center justify-between rounded-full border py-1.5 pr-1.5 pl-4 backdrop-blur-md transition-[background,border-color,box-shadow] duration-300 ${
          scrolled || open ? "border-zinc-200 bg-white/85 shadow-[var(--shadow-card)]" : "border-white/60 bg-white/55"
        }`}
      >
        <Link href="/welcome" aria-label="Ferri home" className="shrink-0">
          <FerriLogo size={30} />
        </Link>
        <div className="hidden items-center gap-1 text-[14px] font-medium text-zinc-600 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={`rounded-full px-3.5 py-2 transition hover:text-zinc-900 ${path === l.href ? "bg-zinc-100 text-zinc-900" : ""}`}
            >
              {l.label}
            </Link>
          ))}
          <a href={GITHUB} className="rounded-full px-3.5 py-2 transition hover:text-zinc-900">
            GitHub
          </a>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href="/login" className="hidden h-10 items-center rounded-full px-3.5 text-[14px] font-medium text-zinc-700 hover:text-zinc-900 sm:inline-flex">
            Open Desk
          </Link>
          <Link href="/welcome#try" className="btn-primary h-10 px-4 text-[14px]">
            Try Ferri
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 md:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
          </button>
        </div>
      </nav>
      {open ? (
        <div id="site-menu" className="mx-auto mt-2 max-w-[1080px] rounded-[24px] border border-zinc-200 bg-white p-2 shadow-[var(--shadow-pop)] md:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-[16px] px-4 py-3 text-[16px] font-medium text-zinc-800 hover:bg-zinc-50">
              {l.label}
            </Link>
          ))}
          <a href={GITHUB} className="block rounded-[16px] px-4 py-3 text-[16px] font-medium text-zinc-800 hover:bg-zinc-50">
            GitHub
          </a>
          <Link href="/login" className="block rounded-[16px] px-4 py-3 text-[16px] font-medium text-zinc-800 hover:bg-zinc-50">
            Open Desk
          </Link>
        </div>
      ) : null}
    </header>
  );
}
