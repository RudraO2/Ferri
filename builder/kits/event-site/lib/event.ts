import raw from "@/content/event.json";

/** Everything the site says about the event. The Builder writes `content/event.json` from the crew's knowledge. */
export interface EventContent {
  name: string;
  tagline: string;
  community: string;
  /** "21–22 November 2026" */
  dates: string;
  /** "Doors open 10:00 AM Saturday" */
  timeLine: string;
  venue: { name: string; address: string; mapUrl: string | null; notes: string | null };
  about: string[];
  whoCanJoin: string | null;
  schedule: { day: string; items: { time: string; what: string }[] }[];
  faq: { q: string; a: string }[];
  sponsors: { name: string; offer: string }[];
  rules: string[];
  contact: { text: string; email: string | null };
  registration: { closes: string | null; note: string | null; open: boolean };
  /** How many people the room holds. Once that many are going, new registrations join the waitlist. Null: no limit. */
  capacity?: number | null;
  /** Theme accent, a CSS color. */
  accent: string;
}

export const event = raw as EventContent;

/** The capacity as a whole number of spots, or null for no limit (everyone is going). */
export const capacity: number | null =
  typeof event.capacity === "number" && Number.isFinite(event.capacity) && event.capacity >= 0 ? Math.floor(event.capacity) : null;

/** A value the Builder could not find in the knowledge ("[venue address]"). Shown, never hidden. */
export const isPlaceholder = (s: string | null | undefined) => !!s && /^\[.*\]$/.test(s.trim());
