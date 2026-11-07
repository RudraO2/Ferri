"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState } from "react";

/**
 * Ferri, the sea otter that carries messages between the crew and the community
 * (otters hold hands so nobody drifts apart: that is Ferri's job).
 *
 * The character is a set of transparent PNGs in public/brand/src/ (one per pose),
 * shown with next/image. Until a pose's file exists, a quiet placeholder keeps the
 * layout. App icons and profile pictures are composed from the same files on the
 * server (app/brand/...).
 */

export const FERRI_COLORS = {
  ink: "#1d1b18",
  brand: "#0e7c7b",
  lip: "#0a5a59",
  soft: "#d3f0ec",
  apricot: "#ff8a5b",
  fur: "#b9733f",
  paper: "#fbf7f0",
} as const;

export type Pose = "main" | "wave" | "thinking" | "carry" | "announce" | "shield" | "sleep" | "party" | "ticket" | "lost" | "oops" | "switch";

const ALT: Record<Pose, string> = {
  main: "Ferri, a friendly sea otter hugging a message card",
  wave: "Ferri waving hello",
  thinking: "Ferri thinking, with a small question mark",
  carry: "Ferri carrying a message card across",
  announce: "Ferri announcing through a megaphone",
  shield: "Ferri guarding with a lifebuoy",
  sleep: "Ferri asleep",
  party: "Ferri celebrating with confetti",
  ticket: "Ferri holding up an event ticket",
  lost: "Ferri holding a map upside down",
  oops: "Ferri tangled in a rope",
  switch: "Ferri pulling a big switch",
};

export const poseSrc = (pose: Pose) => `/brand/src/ferri-${pose}.png`;

/** Which art files exist (names without extension), given by the server in the root layout. */
const BrandFiles = createContext<ReadonlySet<string> | null>(null);

export function BrandProvider({ files, children }: { files: string[]; children: React.ReactNode }) {
  return <BrandFiles.Provider value={new Set(files)}>{children}</BrandFiles.Provider>;
}

/** False when the server says this art file is not there yet. */
function useHasArt(name: string) {
  const files = useContext(BrandFiles);
  return files ? files.has(name) : true;
}
const useHasPose = (pose: Pose) => useHasArt(`ferri-${pose}`);

export const artSrc = (name: string, ext = "png") => `/brand/src/${name}.${ext}`;

/**
 * True once the image failed. An image can fail before React hydrates (onError never
 * fires then), so it is also checked on mount.
 */
function useMissing() {
  const ref = useRef<HTMLImageElement>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);
  return { ref, missing, onError: () => setMissing(true) };
}

/** Ferri in a pose, any size. `decorative` hides it from screen readers. */
export function Ferri({
  pose = "main",
  size = 120,
  alive = false,
  decorative = false,
  priority = false,
  className = "",
}: {
  pose?: Pose;
  size?: number;
  alive?: boolean;
  decorative?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const { ref, missing, onError } = useMissing();
  const has = useHasPose(pose);
  if (missing || !has) return <Placeholder size={size} className={className} />;
  return (
    <Image
      ref={ref}
      src={poseSrc(pose)}
      alt={decorative ? "" : ALT[pose]}
      width={size}
      height={size}
      priority={priority}
      className={`h-auto max-w-full select-none ${alive ? "ferri-float" : ""} ${className}`}
      draggable={false}
      onError={onError}
    />
  );
}

/** Round profile picture: Ferri's face on a soft sea-glass disc (the same picture every app shows). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FerriAvatar({ size = 40, pose, className = "" }: { size?: number; pose?: Pose; className?: string }) {
  const { ref, missing: failed, onError } = useMissing();
  const has = useHasArt("ferri-face");
  const missing = failed || !has;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d3f0ec] ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {missing ? (
        <span className="font-display font-extrabold text-[#0e7c7b]" style={{ fontSize: size * 0.48 }}>
          F
        </span>
      ) : (
        <Image ref={ref} src={artSrc("ferri-face")} alt="" width={size} height={size} draggable={false} onError={onError} />
      )}
    </span>
  );
}

/** Square logo tile: Ferri on the brand colour. */
export function FerriMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const { ref, missing: failed, onError } = useMissing();
  const has = useHasArt("ferri-face");
  const missing = failed || !has;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-brand ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.28, boxShadow: "inset 0 -3px 0 var(--brand-lip)" }}
      aria-hidden
    >
      {missing ? (
        <span className="font-display font-extrabold text-white" style={{ fontSize: size * 0.55 }}>
          F
        </span>
      ) : (
        <Image ref={ref} src={artSrc("ferri-face")} alt="" width={size} height={size} className="translate-y-[6%] scale-[1.08]" draggable={false} onError={onError} />
      )}
    </span>
  );
}

/** Wordmark: the tile plus "Ferri" in the display face. */
export function FerriLogo({ size = 30, label = "Ferri", sub }: { size?: number; label?: string; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <FerriMark size={size} />
      <span className="leading-none">
        <span className="block font-display text-[19px] font-extrabold tracking-[-0.03em] text-zinc-900">{label}</span>
        {sub ? <span className="mt-1 block text-[11.5px] text-zinc-500">{sub}</span> : null}
      </span>
    </span>
  );
}

/** Any other illustration in public/brand/src (stage art, shores), with the same placeholder. */
export function Art({ name, width, height, alt = "", className = "", priority = false }: { name: string; width: number; height: number; alt?: string; className?: string; priority?: boolean }) {
  const { ref, missing, onError } = useMissing();
  const has = useHasArt(name);
  if (missing || !has) return <Placeholder size={Math.min(width, height)} className={className} />;
  return <Image ref={ref} src={artSrc(name)} alt={alt} width={width} height={height} priority={priority} className={`h-auto max-w-full select-none ${className}`} draggable={false} onError={onError} />;
}

/**
 * An animated loop (animated WebP made from the artist's GIF). People who turn off
 * motion get its still frame instead. Falls back to a pose while the loop is missing.
 */
export function FerriLoop({ name, fallback = "main", width, height, alt = "", className = "", priority = false }: { name: string; fallback?: Pose; width: number; height: number; alt?: string; className?: string; priority?: boolean }) {
  const has = useHasArt(name);
  if (!has) return <Ferri pose={fallback} size={Math.max(width, height)} decorative={!alt} priority={priority} className={className} />;
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={artSrc(`${name}-still`)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={artSrc(name, "webp")} alt={alt} width={width} height={height} fetchPriority={priority ? "high" : undefined} className={`h-auto max-w-full select-none ${className}`} draggable={false} />
    </picture>
  );
}

function Placeholder({ size, className }: { size: number; className: string }) {
  return (
    <span className={`inline-block max-w-full ${className}`} style={{ width: size, aspectRatio: "1 / 1" }} aria-hidden>
      <span className="flex h-full w-full items-center justify-center rounded-[28%] border-2 border-dashed border-brand-line bg-brand-soft">
        <span className="font-display font-extrabold text-brand" style={{ fontSize: Math.max(12, size * 0.32) }}>
          F
        </span>
      </span>
    </span>
  );
}
