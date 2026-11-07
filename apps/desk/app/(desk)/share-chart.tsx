"use client";

import { useId, useMemo, useState } from "react";

export type SharePoint = { hour: string; label: string; asked: number; alone: number; share: number | null };

const W = 640;
const H = 220;
const PAD = { l: 40, r: 16, t: 16, b: 28 };

/**
 * Share of member questions Ferri answered alone, by hour. One series, so no legend
 * (the card title names it); a crosshair with a tooltip on hover and focus; hours
 * without questions leave a gap; the same numbers as a table for screen readers.
 */
export function ShareChart({ points }: { points: SharePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const n = points.length;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);

  // Line segments between hours that have data; a gap where an hour had no questions.
  const segments = useMemo(() => {
    const out: { i: number; v: number }[][] = [];
    let cur: { i: number; v: number }[] = [];
    points.forEach((p, i) => {
      if (p.share === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push({ i, v: p.share });
    });
    if (cur.length) out.push(cur);
    return out;
  }, [points]);

  const last = [...points].map((p, i) => ({ p, i })).reverse().find((d) => d.p.share !== null);
  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover !== null ? points[hover] : null;
  const labelEvery = n > 8 ? 2 : 1;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-labelledby={`${id}-desc`}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(last?.i ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? n - 1) - 1));
          if (e.key === "ArrowRight") setHover((v) => Math.min(n - 1, (v ?? 0) + 1));
        }}
      >
        <desc id={`${id}-desc`}>
          Share of member questions Ferri answered alone, by hour.
          {last ? ` Latest: ${Math.round((last.p.share ?? 0) * 100)}% at ${last.p.label}.` : " No questions yet."}
        </desc>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--n-200)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--n-500)">
              {t * 100}%
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={p.hour} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--n-500)">
              {p.label}
            </text>
          ) : null,
        )}
        {segments.map((seg) => (
          <g key={seg[0]!.i}>
            <path
              d={`M${x(seg[0]!.i)},${y(0)} ${seg.map((d) => `L${x(d.i)},${y(d.v)}`).join(" ")} L${x(seg[seg.length - 1]!.i)},${y(0)} Z`}
              fill="var(--chart)"
              opacity={0.1}
            />
            <path d={seg.map((d, k) => `${k ? "L" : "M"}${x(d.i)},${y(d.v)}`).join(" ")} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {last ? (
          <g>
            <circle cx={x(last.i)} cy={y(last.p.share ?? 0)} r={5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(last.i) - 10} y={y(last.p.share ?? 0) - 12} textAnchor="end" fontSize={12.5} fontWeight={700} fill="var(--n-900)">
              {Math.round((last.p.share ?? 0) * 100)}%
            </text>
          </g>
        ) : null}
        {h && hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="var(--n-400)" strokeWidth={1} />
            {h.share !== null ? <circle cx={x(hover)} cy={y(h.share)} r={5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} /> : null}
          </g>
        ) : null}
      </svg>
      {h && hover !== null ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-[12px] border border-zinc-200 bg-white px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > n / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
          role="status"
        >
          <div className="text-zinc-500">{h.label}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="h-0.5 w-3 rounded bg-chart" aria-hidden />
            <span className="text-[15px] font-semibold text-zinc-900 tabular-nums">{h.share === null ? "No questions" : `${Math.round(h.share * 100)}%`}</span>
          </div>
          {h.asked ? (
            <div className="mt-0.5 text-zinc-500">
              {h.alone} of {h.asked} answered alone
            </div>
          ) : null}
        </div>
      ) : null}
      <table className="sr-only">
        <caption>Questions Ferri answered alone, by hour</caption>
        <thead>
          <tr>
            <th scope="col">Hour</th>
            <th scope="col">Asked</th>
            <th scope="col">Answered alone</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.hour}>
              <th scope="row">{p.label}</th>
              <td>{p.asked}</td>
              <td>{p.alone}</td>
              <td>{p.share === null ? "—" : `${Math.round(p.share * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
