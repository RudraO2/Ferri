export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="h1">{title}</h1>
        {sub ? <p className="muted mt-1">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Note({ note }: { note?: string }) {
  if (!note) return null;
  return <div className="mb-5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-700">{note}</div>;
}

const OUTCOME_STYLE: Record<string, string> = {
  answered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  unknown: "border-amber-200 bg-amber-50 text-amber-700",
  held: "border-sky-200 bg-sky-50 text-sky-700",
  listened: "border-zinc-200 bg-zinc-50 text-zinc-600",
  skipped: "border-zinc-200 bg-zinc-50 text-zinc-500",
  chat: "border-zinc-200 bg-zinc-50 text-zinc-500",
  error: "border-red-200 bg-red-50 text-red-700",
  declined: "border-red-200 bg-red-50 text-red-700",
};

export function Outcome({ outcome, resolution }: { outcome: string; resolution?: string | null }) {
  const label = resolution ? `${outcome} → ${resolution}` : outcome;
  return <span className={`badge ${OUTCOME_STYLE[resolution === "answered" ? "answered" : outcome] ?? ""}`}>{label}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-[13px] text-zinc-500">{children}</div>;
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="h2">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
