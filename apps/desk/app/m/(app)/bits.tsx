import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { PLATFORM_LABEL, shortSpace } from "@/lib/pocket";
import { Ferri, FerriAvatar, type Pose } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";

export { QUIET } from "./quiet";

/** A small section label inside a Pocket screen. */
export function Label({ children, className = "px-1" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-[13px] font-semibold text-zinc-500 ${className}`}>{children}</h2>;
}

export function Header({ title, sub, pose }: { title: string; sub?: React.ReactNode; pose?: Pose }) {
  return (
    <header className="sticky top-0 z-10 bg-zinc-50/90 px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <FerriAvatar size={34} pose={pose} />
        <div className="min-w-0">
          <h1 className="font-display text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-zinc-900">{title}</h1>
          {sub ? <p className="truncate text-[13px] text-zinc-500">{sub}</p> : null}
        </div>
      </div>
    </header>
  );
}

/** The top bar of an inner screen: back, a short title, and something on the right (often the wait). */
export function BackHeader({ href, title, right }: { href: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 bg-zinc-50/90 px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-2 backdrop-blur">
      <Link href={href} className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-200" aria-label="Back">
        <ChevronLeft size={22} aria-hidden />
      </Link>
      <div className="min-w-0 truncate text-[15px] font-semibold text-zinc-900">{title}</div>
      {right ? <div className="ml-auto shrink-0 pr-2">{right}</div> : null}
    </header>
  );
}

export function Toast({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div role="status" className="mx-4 mt-3 flex items-start gap-2 rounded-[16px] bg-emerald-50 px-3.5 py-2.5 text-[14px] text-emerald-800">
      <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden />
      {note}
    </div>
  );
}

/** "[logo] Telegram · Lantern Build Night" */
export function Where({ platform, space }: { platform: string | null | undefined; space: string | null | undefined }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-zinc-500">
      <PlatformLogo platform={platform} size={14} />
      <span className="truncate">
        {PLATFORM_LABEL[platform ?? ""] ?? platform ?? "Switch"} · {shortSpace(space)}
      </span>
    </span>
  );
}

export function Empty({ title, children, pose = "sleep" }: { title: string; children?: React.ReactNode; pose?: Pose }) {
  return (
    <div className="mx-4 mt-8 flex flex-col items-center px-6 py-6 text-center">
      <Ferri pose={pose} size={96} decorative />
      <div className="mt-3 font-display text-[19px] font-extrabold tracking-[-0.02em] text-zinc-900">{title}</div>
      {children ? <div className="mt-1 max-w-[290px] text-[14px] leading-relaxed text-zinc-500">{children}</div> : null}
    </div>
  );
}
