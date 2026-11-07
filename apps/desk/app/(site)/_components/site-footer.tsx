import Link from "next/link";
import { FerriLogo } from "@/components/ferri";
import { DEMO_DESK, DISCORD, DOCS, GITHUB, SWITCH, TELEGRAM } from "./links";

const COLS: { title: string; links: { href: string; label: string; ext?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Everything Ferri does" },
      { href: "/use-cases", label: "Use cases" },
      { href: "/switch", label: "Built on Switch" },
      { href: "/start", label: "Get started" },
    ],
  },
  {
    title: "Try it",
    links: [
      { href: "/welcome#try", label: "Playground" },
      { href: DISCORD, label: "Ask on Discord", ext: true },
      { href: TELEGRAM, label: "Ask on Telegram", ext: true },
      { href: DEMO_DESK, label: "Desk (read-only demo)", ext: true },
    ],
  },
  {
    title: "Open source",
    links: [
      { href: GITHUB, label: "GitHub", ext: true },
      { href: DOCS, label: "Docs", ext: true },
      { href: SWITCH, label: "Switch", ext: true },
      { href: `${GITHUB}/blob/main/LICENSE`, label: "MIT license", ext: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200">
      <div className="mx-auto grid max-w-[1160px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-[300px]">
          <FerriLogo size={32} />
          <p className="mt-4 text-[14px] leading-relaxed text-zinc-600">The open-source AI teammate for people who run community events. Built on Switch.</p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h2 className="text-[13px] font-semibold text-zinc-900">{c.title}</h2>
            <ul className="mt-3 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.ext ? (
                    <a href={l.href} className="text-[14px] text-zinc-600 hover:text-zinc-900">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-[14px] text-zinc-600 hover:text-zinc-900">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1160px] flex-col gap-2 border-t border-zinc-200 px-5 py-6 text-[13px] text-zinc-500 sm:flex-row sm:justify-between sm:px-8">
        <span>Made for the WeMakeDevs Flip the Switch hackathon, 2026.</span>
        <span>Lantern Labs and Lantern Build Night are a made-up demo community.</span>
      </div>
    </footer>
  );
}
