import { Bot, Boxes, Coins, LayoutTemplate, MessagesSquare, PencilLine, ShieldCheck, SquareCheckBig, Smartphone } from "lucide-react";
import { FerriAvatar } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";

const SWITCH_PARTS = [
  { icon: MessagesSquare, name: "Rooms", line: "Every chat on every app is one room. Ferri reads one stream." },
  { icon: SquareCheckBig, name: "Cards", line: "Approval cards with buttons, answered where the crew already is." },
  { icon: ShieldCheck, name: "Trust", line: "Every message passes Shield before it is relayed." },
  { icon: LayoutTemplate, name: "Templates", line: "Desks and team rooms become real private channels." },
  { icon: Bot, name: "Managed agent", line: "The Builder: a Claude Code agent with permission cards." },
  { icon: Coins, name: "Budgets", line: "Switch caps the Builder's spend; Ferri holds jobs when it runs out." },
];
const OUR_CHANGES = [
  { icon: PencilLine, name: "Agent message edit", line: "Announcements are edited in place on every platform." },
  { icon: Smartphone, name: "WhatsApp bridge", line: "WhatsApp groups through a linked device." },
];

/** Why Switch is the spine: apps on one side, Switch in the middle, Ferri and the crew on the other. */
export function Spine() {
  return (
    <div className="grid items-center gap-5 lg:grid-cols-[150px_1fr_190px] lg:gap-8">
      <ul className="flex flex-wrap justify-center gap-2 lg:flex-col lg:items-stretch">
        {["discord", "telegram", "slack", "whatsapp", "mattermost"].map((p) => (
          <li key={p} className="relative flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-[13px] font-medium text-zinc-700 capitalize">
            <PlatformLogo platform={p} size={16} />
            {p === "whatsapp" ? "WhatsApp" : p}
            <span className="absolute top-1/2 -right-8 hidden h-px w-8 border-t-2 border-dashed border-zinc-300 lg:block" aria-hidden />
          </li>
        ))}
      </ul>

      <div className="rounded-[28px] border-2 border-brand bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand text-white">
            <Boxes size={17} aria-hidden />
          </span>
          <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-zinc-900">Switch</span>
          <span className="text-[13px] text-zinc-500">the spine</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SWITCH_PARTS.map((p) => (
            <div key={p.name} className="flex gap-2.5 rounded-[14px] bg-zinc-50 p-3">
              <p.icon size={17} className="mt-0.5 shrink-0 text-brand" aria-hidden />
              <div>
                <div className="text-[13.5px] font-semibold text-zinc-900">{p.name}</div>
                <div className="text-[12.5px] leading-snug text-zinc-500">{p.line}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-[16px] border border-dashed border-accent bg-accent-soft/60 p-3">
          <div className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-zinc-600 uppercase">Our two changes to Switch</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {OUR_CHANGES.map((p) => (
              <div key={p.name} className="flex gap-2.5">
                <p.icon size={17} className="mt-0.5 shrink-0 text-zinc-700" aria-hidden />
                <div>
                  <div className="text-[13.5px] font-semibold text-zinc-900">{p.name}</div>
                  <div className="text-[12.5px] leading-snug text-zinc-600">{p.line}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap justify-center gap-2 lg:flex-col lg:items-stretch">
        <li className="relative flex items-center gap-2.5 rounded-[16px] border border-zinc-200 bg-white px-3 py-2.5">
          <span className="absolute top-1/2 -left-8 hidden h-px w-8 border-t-2 border-dashed border-zinc-300 lg:block" aria-hidden />
          <FerriAvatar size={30} />
          <span>
            <span className="block text-[13.5px] font-semibold text-zinc-900">Ferri</span>
            <span className="block text-[12px] text-zinc-500">answers, cards, Shield</span>
          </span>
        </li>
        <li className="relative flex items-center gap-2.5 rounded-[16px] border border-zinc-200 bg-white px-3 py-2.5">
          <span className="absolute top-1/2 -left-8 hidden h-px w-8 border-t-2 border-dashed border-zinc-300 lg:block" aria-hidden />
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-soft text-zinc-800">
            <Bot size={16} aria-hidden />
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-zinc-900">Builder</span>
            <span className="block text-[12px] text-zinc-500">site, posters, listings</span>
          </span>
        </li>
        <li className="relative flex items-center gap-2.5 rounded-[16px] border border-zinc-200 bg-white px-3 py-2.5">
          <span className="absolute top-1/2 -left-8 hidden h-px w-8 border-t-2 border-dashed border-zinc-300 lg:block" aria-hidden />
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-soft text-brand">
            <Smartphone size={16} aria-hidden />
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-zinc-900">Crew</span>
            <span className="block text-[12px] text-zinc-500">Desk and Pocket</span>
          </span>
        </li>
      </ul>
    </div>
  );
}
