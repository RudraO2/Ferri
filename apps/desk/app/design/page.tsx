import type { Metadata } from "next";
import { CalendarCheck, Inbox, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import { Art, Ferri, FerriAvatar, FerriLogo, FerriLoop, FerriMark, type Pose } from "@/components/ferri";
import { PlatformLogo, PlatformTag } from "@/components/platform";
import { ThemeToggle } from "@/components/theme-toggle";
import { Composer, Empty, Fold, Note, Outcome, Stat } from "../(desk)/ui";
import { ShareChart } from "../(desk)/share-chart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const COLORS: [string, string][] = [
  ["--brand", "Brand: sea teal"],
  ["--brand-lip", "Button lip"],
  ["--brand-soft", "Highlight"],
  ["--brand-ink", "Brand text"],
  ["--accent", "Apricot"],
  ["--accent-soft", "Apricot soft"],
  ["--paper", "Paper"],
  ["--surface", "Surface"],
  ["--chart", "Chart"],
  ["--n-200", "Line"],
  ["--n-500", "Muted text"],
  ["--n-900", "Ink"],
  ["--ok-500", "Good"],
  ["--warn-500", "Warning"],
  ["--bad-500", "Bad"],
  ["--info-500", "Info"],
];

const POSES: Pose[] = ["main", "wave", "thinking", "carry", "announce", "shield", "sleep", "party", "ticket", "lost", "oops", "switch"];
const ART = ["stage-plan", "stage-build", "stage-launch", "stage-live", "stage-wrap", "pocket-splash", "shore-community", "shore-crew"];
const PLATFORMS = ["discord", "telegram", "slack", "whatsapp", "mattermost", "linkedin", "x", "instagram", "github"];

const SAMPLE = [38, 42, 50, 61, 38, 47, 50, 75, 92, 84].map((v, i) => ({
  hour: `h${i}`,
  label: `${((i + 3) % 12) + 1}${i + 3 < 11 ? "am" : "pm"}`,
  asked: 10 + i * 2,
  alone: Math.round(((10 + i * 2) * v) / 100),
  share: v / 100,
}));

function Block({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="mb-14">
      <h2 className="h1 text-[26px]">{title}</h2>
      {note ? <p className="muted mt-1 max-w-[720px]">{note}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Ferri's design system on one page: every token, component, logo and piece of art, live in both themes. */
export default function DesignPage() {
  return (
    <main className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8">
      <div className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <FerriLogo size={40} label="Ferri design system" sub="Palette Tidepool · Ferri the sea otter · spec 24" />
        <ThemeToggle />
      </div>

      <Block title="Colour" note="Every colour is a token on :root, redefined for dark mode. Switch the theme (top right) to see both.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {COLORS.map(([v, label]) => (
            <div key={v} className="text-[12px]">
              <div className="h-16 rounded-[14px] border border-zinc-200" style={{ background: `var(${v})` }} />
              <div className="mt-1.5 font-medium text-zinc-800">{label}</div>
              <div className="font-mono text-[11px] text-zinc-500">{v}</div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type" note="Bricolage Grotesque 800 for display, Inter for text, Caveat for handwritten notes.">
        <div className="space-y-3">
          <div className="display text-[64px] text-zinc-900">Every question.</div>
          <div className="h1">Page title · 30 px display</div>
          <div className="h3">Card title · 16 px semibold</div>
          <p className="max-w-[640px] text-[15px] leading-relaxed text-zinc-700">Body text in Inter, 14 to 16 px with a relaxed line height, so long answers stay easy to read.</p>
          <p className="muted">Muted text, for metadata and hints.</p>
          <div className="h2">Section title · 15 px semibold</div>
          <div className="hand text-[30px] text-zinc-800">Ferri. Never lets a question drift.</div>
          <div className="num text-[44px] text-zinc-900">82%</div>
        </div>
      </Block>

      <Block title="Buttons" note="Pills with a darker lip at the bottom; they press down on click.">
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary">Primary</button>
          <button className="btn">Secondary</button>
          <button className="btn-danger">Danger</button>
          <button className="btn-primary" disabled>
            Disabled
          </button>
          <button className="btn-lg-primary">Pocket primary</button>
          <button className="btn-lg">Pocket secondary</button>
        </div>
      </Block>

      <Block title="Fields">
        <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="d-input">
              Input
            </label>
            <input id="d-input" className="input" placeholder="Lantern Build Night" />
          </div>
          <div>
            <label className="label" htmlFor="d-select">
              Select
            </label>
            <select id="d-select" className="input" defaultValue="auto">
              <option value="auto">Auto: answers with sources</option>
              <option value="approve">Approve: replies wait for an OK</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="d-text">
              Textarea
            </label>
            <textarea id="d-text" className="textarea" rows={3} placeholder="Your answer. It goes to everyone who asked, and is saved for next time." />
          </div>
        </div>
      </Block>

      <Block title="Labels">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">badge</span>
          <span className="pill">pill</span>
          <Outcome outcome="answered" />
          <Outcome outcome="unknown" />
          <Outcome outcome="unknown" resolution="answered" />
          <Outcome outcome="held" />
          <Outcome outcome="error" />
          <span className="mark">highlighted</span>
        </div>
      </Block>

      <Block title="Stat tiles">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Answered alone" icon={Sparkles} value="82%" hint="from 38% at 4am" />
          <Stat label="Open cards" icon={Inbox} value={4} hint="people are waiting" tone="warn" />
          <Stat label="Announcements" icon={Megaphone} value={2} hint="posted on 5 apps" tone="ok" />
          <Stat label="Shield blocks" icon={ShieldCheck} value={9} hint="last 24 hours" tone="bad" />
        </div>
      </Block>

      <Block title="Chart" note="One series, a crosshair and tooltip on hover or keyboard focus, gaps for empty hours, a table for screen readers. Colour validated with the dataviz checks.">
        <div className="card max-w-[760px] p-5">
          <div className="h3">Questions Ferri answered alone</div>
          <p className="muted">By hour. It climbs as the crew teaches it.</p>
          <div className="mt-3">
            <ShareChart points={SAMPLE} />
          </div>
        </div>
      </Block>

      <Block title="Messages and empty states">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Note note="Sent to Ferri. It goes out in a moment." />
            <Empty quiet>A quiet empty line, for secondary lists: one otter per page is plenty.</Empty>
          </div>
          <Empty pose="wave" title="Nothing here yet" action={<button className="btn-primary">Try it</button>}>
            An empty state says what will show up here, and gives one thing to try.
          </Empty>
        </div>
      </Block>

      <Block title="Progressive disclosure" note="History, long lists and secondary forms stay folded until asked for. Native details elements, so they work without JavaScript.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Fold title="Answered" count={12} className="mb-0">
              <p className="muted">History opens here.</p>
            </Fold>
          </div>
          <Composer label="New announcement" className="mb-0">
            <div className="card p-4 text-[13.5px] text-zinc-600">The form opens here.</div>
          </Composer>
        </div>
      </Block>

      <Block title="Platform logos" note="Used only to name the platform. Simple Icons, plus Slack and LinkedIn from their own brand marks.">
        <div className="flex flex-wrap items-center gap-5">
          {PLATFORMS.map((p) => (
            <span key={p} className="inline-flex items-center gap-2 text-[14px] text-zinc-700">
              <PlatformLogo platform={p} size={22} /> {p}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <PlatformTag platform="telegram" space="Lantern Build Night" />
          <PlatformTag platform="discord" space="build-night" />
          <PlatformTag platform="whatsapp_web" space="Build Night group" />
        </div>
      </Block>

      <Block title="Ferri" note="The character, its marks and the loops. The avatar is the bot's profile picture on every platform (/m/icon/1024?avatar).">
        <div className="flex flex-wrap items-end gap-6">
          <FerriMark size={64} />
          <FerriMark size={32} />
          <FerriAvatar size={96} />
          <FerriAvatar size={40} />
          <FerriAvatar size={24} />
          <FerriLogo size={32} />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {POSES.map((p) => (
            <figure key={p} className="card flex flex-col items-center p-3 text-[12px] text-zinc-500">
              <Ferri pose={p} size={130} decorative />
              <figcaption className="mt-1">{p}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {ART.map((a) => (
            <figure key={a} className="card flex flex-col items-center p-3 text-[12px] text-zinc-500">
              <Art name={a} width={220} height={180} className="max-h-[160px] w-auto" />
              <figcaption className="mt-1">{a}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <figure className="card flex flex-col items-center p-3 text-[12px] text-zinc-500">
            <FerriLoop name="hero-loop" width={220} height={220} />
            <figcaption>hero-loop</figcaption>
          </figure>
          <figure className="card flex flex-col items-center p-3 text-[12px] text-zinc-500">
            <FerriLoop name="wave-loop" fallback="wave" width={220} height={220} />
            <figcaption>wave-loop</figcaption>
          </figure>
          <figure className="card flex flex-col items-center justify-center p-3 text-[12px] text-zinc-500">
            <FerriLoop name="carry-loop" fallback="carry" width={320} height={160} />
            <figcaption>carry-loop</figcaption>
          </figure>
        </div>
        <div className="mt-6 flex flex-wrap items-end gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/m/icon/192" width={96} height={96} alt="Pocket app icon" className="rounded-[22%]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/m/icon/512?maskable" width={96} height={96} alt="Maskable app icon" className="rounded-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/m/icon/1024?avatar" width={96} height={96} alt="Bot profile picture" className="rounded-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/m/splash/1170x2532" width={90} height={195} alt="Pocket splash screen" className="rounded-[14px] border border-zinc-200" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/og-image.png" width={320} height={168} alt="Link preview image" className="rounded-[14px] border border-zinc-200" />
        </div>
      </Block>

      <Block title="Icons" note="Lucide throughout.">
        <div className="flex flex-wrap gap-4 text-zinc-700">
          {[Inbox, Megaphone, ShieldCheck, Sparkles, CalendarCheck].map((I, i) => (
            <span key={i} className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-brand-soft text-brand">
              <I size={20} aria-hidden />
            </span>
          ))}
        </div>
      </Block>
    </main>
  );
}
