import { Check, Lock } from "lucide-react";
import { Ferri, FerriAvatar } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";

const APPS = ["discord", "telegram", "slack", "whatsapp"] as const;

/**
 * The hero's picture of both sides: the crew approves a change inside, Ferri carries it
 * across, and the community hears it on every app.
 */
export function Bridge() {
  return (
    <figure
      className="relative mx-auto w-full max-w-[420px] lg:max-w-[520px]"
      aria-label="Ferri between both sides of an event: the crew approves “Lunch moves to 1:30” in its crew room, and Ferri posts it on every app the community uses."
    >
      <div aria-hidden>
        {/* The ferry route between the two sides */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M46 30 C 46 44, 56 48, 50 56 C 44 64, 41 66, 40 74" fill="none" stroke="var(--brand)" strokeWidth="2.4" strokeDasharray="1 3.2" strokeLinecap="round" opacity="0.6" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Inside: the crew room */}
        <div className="relative z-10 w-[80%] max-w-[330px] rounded-[20px] border border-zinc-200 bg-white p-3.5 text-left shadow-[var(--shadow-pop)] sm:p-4">
          <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
            <Lock size={12} />
            <span className="font-semibold text-zinc-700">ferri-crew</span>
            <span>· crew room</span>
          </div>
          <div className="mt-2.5 flex items-start gap-2">
            <FerriAvatar size={26} />
            <div className="min-w-0">
              <div className="text-[14.5px] leading-snug font-semibold text-zinc-900 sm:text-[15.5px]">Approve: Lunch moves to 1:30</div>
              <div className="mt-0.5 text-[12px] text-zinc-500">Goes to 5 groups on 4 apps</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-brand px-4 text-[13px] font-semibold text-white shadow-[inset_0_-2px_0_var(--brand-lip)]">
              <Check size={14} /> OK
            </span>
            <span className="inline-flex h-8 items-center rounded-full border border-zinc-200 px-3.5 text-[13px] font-medium text-zinc-600">Edit</span>
          </div>
        </div>
        <div className="hand relative z-10 mt-1 ml-3 text-[20px] text-zinc-600 sm:text-[22px]">your crew, inside</div>

        {/* Ferri, carrying it across */}
        <div className="relative z-20 -my-10 flex justify-center sm:-my-12">
          <Ferri pose="carry" size={240} alive decorative className="w-[140px] sm:w-[180px] lg:w-[210px]" />
        </div>

        {/* Outside: the community on every app */}
        <div className="hand relative z-10 mr-3 mb-1 text-right text-[20px] text-zinc-600 sm:text-[22px]">your community, outside</div>
        <div className="relative z-10 ml-auto w-[86%] max-w-[380px] rounded-[20px] border border-zinc-200 bg-white p-3.5 text-left shadow-[var(--shadow-pop)] sm:p-4">
          <div className="flex items-center gap-1.5">
            {APPS.map((a) => (
              <span key={a} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-zinc-200 bg-zinc-50">
                <PlatformLogo platform={a} size={17} />
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check size={12} />
            </span>
            <div className="text-[14.5px] leading-snug font-semibold text-zinc-900 sm:text-[15.5px]">Lunch moved to 1:30, posted on every app</div>
          </div>
        </div>
      </div>
    </figure>
  );
}
