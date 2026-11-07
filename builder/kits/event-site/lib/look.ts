import raw from "@/content/look.json";
import { event } from "./event";

/**
 * The event's look, taken from its posters by `scripts/poster-look.mjs` into
 * `content/look.json`, so the site, the posters, the social cards and the
 * listing cover match. Without a poster job the file says `"from": null` and
 * the site keeps the kit's own look with the accent from `content/event.json`.
 */
export interface Look {
  /** The poster job it came from ("B11-build-night-poster-and-cards"); null keeps the kit's own look. */
  from: string | null;
  /** The poster's accent, a hex colour. */
  accent?: string;
  /** The poster's dark base colour, under its text. */
  ink?: string;
  /** The poster's background for the hero: its art or photo in public/poster/, over the poster's own gradient. */
  hero?: { image: string | null; kind: string; background: string } | null;
  /** The poster's link card (else its X or square card), the site's link preview image. */
  card?: { image: string; width: number; height: number } | null;
  /** The square social card and the community logo, in public/poster/. */
  square?: string | null;
  logo?: string | null;
  /** The poster's font families, served from public/poster/fonts/. */
  fonts?: { display: string | null; body: string | null } | null;
  /** The @font-face rules and the --font-display, --font-body and --ink variables, put in the page's head. */
  css?: string;
}

export const look = raw as unknown as Look;
export const hasLook = !!look.from;

/** The accent the whole site uses: the poster's when there is one, else the event's. */
export const accent = (hasLook && look.accent) || event.accent;

type RGB = [number, number, number];

function rgb(hex: string): RGB | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: RGB) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
const contrast = (a: RGB, b: RGB) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** The colour moved toward black or white, step by step, until it reads on the background (4.5:1). */
function readable(c: RGB, background: RGB, toward: RGB): string {
  for (let i = 0; i <= 20; i++) {
    const m = mix(c, toward, i / 20);
    if (contrast(m, background) >= 4.5) return toHex(m);
  }
  return toHex(toward);
}

const INK: RGB = [11, 11, 16];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
// The page backgrounds in app/globals.css (--bg, light and dark).
const PAGE_LIGHT: RGB = [250, 250, 250];
const PAGE_DARK: RGB = [11, 13, 18];

/**
 * CSS variables for the accent: the colour for fills (--accent), the text on
 * it (--on-accent, the poster's ink or white, whichever reads better), and the
 * accent as text on the light and dark page (--accent-ink-light,
 * --accent-ink-dark), darkened or lightened until it reads. A colour that is
 * not a hex value is used as it is.
 */
export function accentVars(color: string): Record<string, string> {
  const c = rgb(color);
  if (!c) return { "--accent": color };
  return {
    "--accent": toHex(c),
    "--on-accent": contrast(c, INK) >= contrast(c, WHITE) ? "#0b0b10" : "#ffffff",
    "--accent-ink-light": readable(c, PAGE_LIGHT, BLACK),
    "--accent-ink-dark": readable(c, PAGE_DARK, WHITE),
  };
}
