import { PLATFORM_LABEL, shortSpace } from "@/lib/pocket";

export function Header({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 backdrop-blur">
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      {sub ? <p className="mt-0.5 text-[13px] text-zinc-500">{sub}</p> : null}
    </header>
  );
}

export function Toast({ note }: { note?: string }) {
  if (!note) return null;
  return <div className="mx-4 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[14px] text-emerald-800">{note}</div>;
}

const DOT: Record<string, string> = {
  telegram: "bg-sky-500",
  slack: "bg-fuchsia-600",
  discord: "bg-indigo-500",
  mattermost: "bg-blue-700",
  whatsapp: "bg-emerald-500",
  whatsapp_web: "bg-emerald-500",
};

/** "● Telegram · Lantern Build Night" */
export function Where({ platform, space }: { platform: string | null | undefined; space: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-500">
      <span className={`h-2 w-2 rounded-full ${DOT[platform ?? ""] ?? "bg-zinc-400"}`} />
      {PLATFORM_LABEL[platform ?? ""] ?? platform ?? "Switch"} · {shortSpace(space)}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-4 mt-6 rounded-xl border border-dashed border-zinc-200 bg-white px-5 py-10 text-center">
      <div className="text-[15px] font-medium">{title}</div>
      {children ? <div className="mt-1 text-[13.5px] text-zinc-500">{children}</div> : null}
    </div>
  );
}
