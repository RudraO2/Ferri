/**
 * The landing page playground's brain: a small, in-browser copy of the demo event's
 * knowledge (seed/events/build-night/knowledge/*.md and seed/knowledge/about.md), so a
 * visitor can ask Ferri something without signing up and without a server.
 *
 * The real Ferri searches the live knowledge and answers with Claude; this keeps the
 * same rules a visitor can see: answer only from the notes, name the source, and when
 * nothing fits, don't guess: say it's checking and open one card for the crew.
 */

export type Note = {
  id: string;
  /** What the trace shows was found: "FAQ › Wi-Fi". */
  found: string;
  /** The source line, as Ferri prints it under the answer. */
  source: string;
  /** Who on the crew owns this topic (from seed/events/build-night/event.yaml). */
  owner: "Priya" | "Rudra";
  answer: string;
  match: RegExp[];
  /** Generic words ("where", "start") that count half, so a specific match wins. */
  weak?: RegExp[];
};

const FAQ = "Lantern Build Night FAQ";
const SCHEDULE = "Lantern Build Night schedule";
const VENUE = "Lantern Build Night venue";

export const NOTES: Note[] = [
  {
    id: "winners",
    found: "Schedule › Sunday",
    source: `${SCHEDULE} (Sunday 22 November)`,
    owner: "Priya",
    answer: "Winners are announced at 10:00 AM on Sunday 22 November, at the closing.",
    match: [/winners?\s+(are\s+)?announc/, /\bclosing\b/, /when (does|do) (it|the event|build night|the hackathon) end/, /\bends?\b.*\b(sunday|event)\b/],
  },
  {
    id: "submissions",
    found: "Schedule › Sunday",
    source: `${SCHEDULE} (Sunday 22 November)`,
    owner: "Priya",
    answer: "Submissions close at 7:00 AM on Sunday 22 November. Judging starts at 8:00 AM, after breakfast.",
    match: [/submi/, /\bsubmit\b/, /project deadline/],
  },
  {
    id: "start",
    found: "Schedule › Saturday",
    source: `${SCHEDULE} (Saturday 21 November)`,
    owner: "Priya",
    answer: "Hacking starts at 11:00 AM on Saturday 21 November, right after team formation at 10:30.",
    match: [/hack(ing)?\s+(start|begin)/, /kick\s?off/, /when (does|do) (it|we|the hackathon|build night|the event) (start|begin)/],
    weak: [/\b(start|starts|starting|begin|begins)\b/, /what time/],
  },
  {
    id: "doors",
    found: "Schedule › Saturday",
    source: `${SCHEDULE} (Saturday 21 November)`,
    owner: "Priya",
    answer: "Doors open at 9:00 AM on Saturday for check-in. Breakfast is at 9:30 and the opening talk at 10:00.",
    match: [/\bdoors?\b/, /check.?in/, /\barrive\b/, /reach by/, /opening talk/, /keynote/],
  },
  {
    id: "vegan",
    found: "FAQ › Food",
    source: `${FAQ} (Food)`,
    owner: "Priya",
    answer: "All meals are vegetarian. Vegan and Jain options are there if you ask for them at registration.",
    match: [/\bvegan\b/, /\bjain\b/, /\bveg(etarian)?\b/, /allerg/, /gluten/, /dietary/, /\bnon.?veg/],
  },
  {
    id: "food",
    found: "FAQ › Food",
    source: `${FAQ} (Food)`,
    owner: "Priya",
    answer: "Breakfast 9:30 AM, lunch 1:30 PM and dinner 8:30 PM on Saturday, a midnight snack at 12:30 AM, and Sunday breakfast at 8:00 AM.",
    match: [/\bfood\b/, /\blunch\b/, /\bdinner\b/, /\bbreakfast\b/, /\bmeals?\b/, /\beat\b/, /\bsnacks?\b/, /hungry/, /\bpizza\b/],
  },
  {
    id: "wifi",
    found: "FAQ › Wi-Fi",
    source: `${FAQ} (Wi-Fi)`,
    owner: "Priya",
    answer: "The Wi-Fi network is LanternGuest and the password is buildnight2026.",
    match: [/wi.?fi/, /internet/, /password/, /\bnetwork\b/],
  },
  {
    id: "transit",
    found: "Venue › Getting there",
    source: `${VENUE} (Getting there)`,
    owner: "Priya",
    answer: "The nearest metro is Koramangala on the Pink Line, a 10 minute walk. Buses 201 and 500D stop right outside.",
    match: [/\bmetro\b/, /\bbus(es)?\b/, /get(ting)? there/, /directions/, /\btrain\b/, /\bcab\b/, /\buber\b/, /how (do i|to) (get|reach|come)/],
  },
  {
    id: "venue",
    found: "Venue › Address",
    source: `${VENUE} (Address)`,
    owner: "Priya",
    answer: "Koramangala Makerspace, 3rd floor, 80 Feet Road, Koramangala, Bengaluru. The entrance is next to the blue bakery.",
    match: [/\bvenue\b/, /\baddress\b/, /where (is|are|'s) (it|the event|build night|this|we)/, /\blocation\b/, /located/, /which floor/],
    weak: [/\bwhere\b/],
  },
  {
    id: "sleep",
    found: "Venue › Quiet room",
    source: `${VENUE} (Quiet room)`,
    owner: "Priya",
    answer: "There's a quiet room on the 4th floor for naps, with the lights low all night. Sleeping bags are allowed there.",
    match: [/\bsleep/, /\bnap\b/, /quiet room/, /\brest\b/, /overnight/, /stay the night/, /sleeping bag/],
  },
  {
    id: "teams",
    found: "FAQ › Teams",
    source: `${FAQ} (Teams)`,
    owner: "Rudra",
    answer: "Teams have 2 to 4 people. You can come solo: team formation is at 10:30 AM on Saturday.",
    match: [/\bteams?\b/, /\bsolo\b/, /\balone\b/, /group size/, /how many (people|members)/, /teammates?/],
  },
  {
    id: "id",
    found: "FAQ › Registration",
    source: `${FAQ} (Registration)`,
    owner: "Rudra",
    answer: "Bring a government photo ID that matches the name you registered with.",
    match: [/\bid\b/, /identity/, /aadhaar/, /passport/, /photo id/],
  },
  {
    id: "register",
    found: "FAQ › Registration",
    source: `${FAQ} (Registration)`,
    owner: "Rudra",
    answer: "Registration is free and closes on 18 November 2026 at 11:59 PM IST.",
    match: [/regist/, /sign.?up/, /\bapply\b/, /\bdeadline\b/, /\bfree\b/, /\bcost\b/, /\bfees?\b/, /\bprice\b/, /\bpay\b/, /\btickets?\b/],
  },
  {
    id: "who",
    found: "FAQ › Who can join",
    source: `${FAQ} (Who can join)`,
    owner: "Rudra",
    answer: "Anyone 18 or older can join, students and working developers alike. You don't need to code: designers and product people are welcome.",
    match: [/who can/, /eligib/, /\bage\b/, /\b18\b/, /student/, /designer/, /(don.?t|can.?t|cannot) code/, /(know how to|need to) code/, /coding (experience|skills?)/, /non.?(tech|coder)/, /beginner/],
  },
  {
    id: "prizes",
    found: "FAQ › Prizes",
    source: `${FAQ} (Prizes)`,
    owner: "Rudra",
    answer: "First place wins ₹40,000, second ₹25,000 and third ₹10,000. Every team that demos gets swag.",
    match: [/prize/, /\bwin\b/, /reward/, /\bswag\b/, /\bcash\b/, /₹/, /money/],
  },
  {
    id: "judging",
    found: "FAQ › Judging",
    source: `${FAQ} (Judging)`,
    owner: "Rudra",
    answer: "Judging starts at 8:00 AM on Sunday. Each team gets 4 minutes to demo and 2 minutes of questions.",
    match: [/judg/, /\bdemo\b/, /\bpitch\b/, /present/],
  },
  {
    id: "rules",
    found: "FAQ › Judging",
    source: `${FAQ} (Judging)`,
    owner: "Rudra",
    answer: "Projects must be started at the event. Open-source libraries are fine.",
    match: [/\brules?\b/, /pre.?built/, /existing (code|project)/, /start (early|before)/, /librar/, /boilerplate/],
  },
  {
    id: "bring",
    found: "FAQ › What to bring",
    source: `${FAQ} (What to bring)`,
    owner: "Rudra",
    answer: "Bring your laptop, charger, a government photo ID and a refillable water bottle. Sleeping bags are allowed in the quiet room.",
    match: [/what (to|should i|do i|do we) (bring|pack|carry)/, /need to bring/, /\bpack\b/, /laptop/, /charger/, /water bottle/],
  },
  {
    id: "mentors",
    found: "Schedule › Saturday",
    source: `${SCHEDULE} (Saturday 21 November)`,
    owner: "Priya",
    answer: "Mentor office hours are at 4:00 PM on Saturday. Bring your questions.",
    match: [/mentor/, /office hours/],
  },
  {
    id: "contact",
    found: "About Lantern Labs › Contact",
    source: "About Lantern Labs (Contact the organizers)",
    owner: "Rudra",
    answer: "Email hello@lanternlabs.example or post in the community group. The organizers usually reply within a day.",
    match: [/contact/, /\bemail\b/, /organi[sz]er/, /reach (out|the team)/],
  },
];

/** Words that say "this is about something the notes don't cover", so a loose match (e.g. "bring") doesn't win. */
const UNKNOWN_HINTS = /\b(dog|dogs|pet|pets|cat|parking|park my|bike|car|parents|plus.?one|friend|smok|alcohol|beer|drone|shower|locker|refund|transfer my|certificate|record(ed|ing)?|livestream|stream|photo(s|graph)|merch|t.?shirt|accessib|wheelchair|lift|elevator|nursing|child|kids?)\b/;

/** A message Shield would block: a lookalike or known-scam link, or the "free nitro" pattern. */
export function shieldVerdict(text: string): string | null {
  const t = text.toLowerCase();
  if (/(disc[o0]rd|telegr[a4]m|steam|nitro)[-.]?(gift|free|promo|airdrop|claim)|d[i1]sc[o0]rd-?(app|gift)\.(xyz|ru|top|click|gift|io)/.test(t)) return "lookalike link";
  if (/\bfree\s+nitro\b|airdrop|claim your (reward|prize)|wallet connect|seed phrase/.test(t)) return "known scam pattern";
  if (/\b[a-z0-9-]+\.(xyz|top|click|ru|zip|mov|gift)\b/.test(t)) return "suspicious link";
  if (/\bsk-(ant-)?[a-z0-9_-]{16,}/i.test(text)) return "leaked API key";
  return null;
}

/**
 * Content words, for matching a new question against what the crew already taught. Common verbs
 * ("bring", "allowed") and the event's own name are left out, so "what should I bring?" or
 * "can I bring my cat?" doesn't match a crew answer about dogs.
 */
export function words(text: string): Set<string> {
  const stop = new Set(
    (
      "a an the is are was were be can could may might i we you our my to of for at in on with and or do does did it its this that there any anyone know about please ferri hey hi what when where how who which will would should " +
      "bring allowed allow okay get got need have has had here come coming take use want also just own too some much many still not but your their them they tell like event build night lantern hackathon"
    ).split(" "),
  );
  return new Set(
    text
      .toLowerCase()
      .replace(/@ferri/g, " ")
      .replace(/[^a-z0-9₹ ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w))
      .map((w) => w.replace(/s$/, ""))
      .filter((w) => !stop.has(w)),
  );
}

export function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

export type Learned = { q: string; words: Set<string>; answer: string; by: string };

export type Verdict =
  | { kind: "greeting" }
  | { kind: "quiet" }
  | { kind: "known"; note: Note }
  | { kind: "learned"; learned: Learned }
  | { kind: "shield"; reason: string }
  | { kind: "unknown"; owner: "Priya" | "Rudra"; topic: string };

/** Picks the note with the most matching patterns; ties go to the earlier, more specific note. */
export function decide(text: string, learned: Learned[]): Verdict {
  const reason = shieldVerdict(text);
  if (reason) return { kind: "shield", reason };
  const t = text.toLowerCase().replace(/@?ferri\b/g, "").trim();
  if (/^(hi|hey|hello|yo|hola|namaste|sup|gm)( there| everyone| all| team)?[^a-z0-9]*$/.test(t)) return { kind: "greeting" };
  // Thanks and small talk: nothing to answer, so Ferri stays quiet (no card for the crew).
  if (/^(thanks|thank you|thank u|thx|ty|tysm|ok|okay|k|cool|great|nice|awesome|got it|perfect|lol|haha+)( so much| a lot)?[^a-z0-9]*$/.test(t)) return { kind: "quiet" };

  const w = words(t);
  const taught = learned.map((l) => ({ l, s: overlap(w, l.words) })).sort((a, b) => b.s - a.s)[0];
  if (taught && taught.s >= 0.5) return { kind: "learned", learned: taught.l };

  if (!UNKNOWN_HINTS.test(t)) {
    let best: Note | null = null;
    let score = 0;
    for (const n of NOTES) {
      const s = n.match.reduce((acc, r) => acc + (r.test(t) ? 1 : 0), 0) + (n.weak ?? []).reduce((acc, r) => acc + (r.test(t) ? 0.5 : 0), 0);
      if (s > score) {
        best = n;
        score = s;
      }
    }
    if (best) return { kind: "known", note: best };
  }
  const venueish = /\b(park|parking|bike|car|lift|elevator|wheelchair|accessib|shower|locker|smok)/.test(t);
  const foodish = /\b(alcohol|beer|coffee|tea|drink)/.test(t);
  if (venueish) return { kind: "unknown", owner: "Priya", topic: "venue" };
  if (foodish) return { kind: "unknown", owner: "Priya", topic: "food" };
  return { kind: "unknown", owner: "Rudra", topic: "on duty" };
}

export const SUGGESTIONS = [
  { label: "When does hacking start?", text: "@ferri when does hacking start?" },
  { label: "What's the Wi-Fi password?", text: "does anyone know the wifi password?" },
  { label: "Can I bring my dog?", text: "@ferri can I bring my dog?", hint: "Ferri doesn't know this one" },
  { label: "free nitro 👉 disc0rd-gift.xyz", text: "free nitro for hackers 👉 disc0rd-gift.xyz", hint: "a scam link" },
];
