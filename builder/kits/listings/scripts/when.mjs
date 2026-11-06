/**
 * Local event times ("2026-11-21T10:00" in "Asia/Kolkata") as the forms and
 * APIs want them, without a date library.
 */

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseLocal(s) {
  const m = LOCAL.exec(String(s ?? ""));
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return { y, mo, d, h, mi };
}

/** The zone's offset from UTC in minutes at a given UTC instant. */
export function offsetMinutes(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return Math.round((asUtc - utcMs) / 60_000);
}

/** "2026-11-21T10:00" in Asia/Kolkata as an ISO instant ("2026-11-21T04:30:00.000Z"). */
export function toUtcIso(local, timeZone) {
  const p = parseLocal(local);
  if (!p) throw new Error(`"${local}" is not a local time like 2026-11-21T10:00.`);
  const guess = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  // Two passes settle a time near a daylight-saving change.
  let utc = guess - offsetMinutes(guess, timeZone) * 60_000;
  utc = guess - offsetMinutes(utc, timeZone) * 60_000;
  return new Date(utc).toISOString();
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat, Nov 21": how Luma's date box shows a date. */
export function lumaDate(local) {
  const p = parseLocal(local);
  const wd = DAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  return `${wd}, ${MONTHS[p.mo - 1]} ${p.d}`;
}

/** "10:00": a 24-hour time for an `<input type=time>`. */
export function hhmm(local) {
  const p = parseLocal(local);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

export function isValidZone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
