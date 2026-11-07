import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Boxes, Check, Coins, Container, Eye, HardDrive, KeyRound, MemoryStick, Scale, Server, Stethoscope } from "lucide-react";
import { Ferri, FerriAvatar } from "@/components/ferri";
import { PlatformLogo } from "@/components/platform";
import { GithubMark } from "../_components/icons";
import { CopyCommand } from "../_components/bits";
import { WrapCommand } from "./wrap-command";
import { DEMO_DESK, DISCORD, DOCS, GITHUB, TELEGRAM, doc } from "../_components/links";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Run Ferri yourself in one command: git clone, cd Ferri, ./ferri up. It starts Switch, a Mattermost to try it in, Ferri and Desk in Docker with a demo event. Then connect Telegram, Discord, Slack or WhatsApp. Free and MIT.",
};

const QUICK = ["git clone https://github.com/RudraO2/Ferri.git", "cd Ferri", "./ferri up"];

const REQUIREMENTS = [
  { icon: Container, t: "Docker", d: "Docker Desktop on Windows and macOS, or Docker Engine with the compose plugin v2.20 or newer on Linux." },
  { icon: MemoryStick, t: "About 4 GB of free RAM", d: "8 GB is comfortable." },
  { icon: HardDrive, t: "About 8 GB of disk", d: "The first run downloads about 3 GB." },
  { icon: KeyRound, t: "An Anthropic API key", d: "From console.anthropic.com, under API keys." },
];

const UP_STEPS = [
  { t: "Asks for your Anthropic key once", d: "Then generates every other secret into .env." },
  { t: "Pulls the images", d: "Or builds Ferri's image from the checkout if it cannot pull it. The first run takes several minutes." },
  { t: "Starts the stack and waits until it is healthy", d: "Switch (core, dashboard, Postgres), Mattermost, Ferri's Postgres, Ferri and Desk." },
  {
    t: "Sets up Switch and a demo event",
    d: "Registers Ferri in Switch, creates the rooms ferri-lab and ferri-crew, the test people meera, arjun (members) and priya (crew), and loads Lantern Labs and its event, Lantern Build Night.",
  },
  { t: "Prints the addresses, the logins and three messages to try", d: "Running it again changes nothing that is already set." },
];

const SERVICES = [
  { what: "Mattermost", sub: "the chat to try Ferri in", addr: "http://localhost:8065", login: "user and the printed password. meera, arjun and priya share a second printed password.", logo: "mattermost" },
  { what: "Desk", sub: "the organizers' dashboard", addr: "http://localhost:3100", login: "admin@switch.local and the printed password", ferri: true },
  { what: "Ferri Pocket", sub: "the crew's phone app", addr: "http://localhost:3100/m", login: "Same as Desk", ferri: true },
  { what: "Switch dashboard", sub: "Switch's own Gateway UI", addr: "http://localhost:3300", login: "Same as Desk", logo: "switch" },
];

const TRY = [
  {
    room: "ferri-lab",
    who: "you",
    say: "@ferri when does hacking start?",
    then: "Ferri answers with the time and a Source line.",
  },
  {
    room: "ferri-lab",
    who: "you",
    say: "@ferri can I bring my dog?",
    then: "The demo knowledge doesn't cover it, so Ferri says it is checking with the crew, and a question card opens in ferri-crew.",
  },
  {
    room: "ferri-crew",
    who: "you, as crew",
    say: 'A1 "Yes, dogs are welcome"',
    then: "Or tap a button on the card. Ferri answers the asker in ferri-lab and remembers it, so the next person gets the answer at once.",
  },
];

const CONNECT = [
  {
    key: "telegram",
    name: "Telegram",
    setup: "Make a bot with BotFather, turn Group Privacy off before adding it anywhere, then add it to the group.",
    cmd: "./ferri connect telegram --token <bot token>",
  },
  {
    key: "discord",
    name: "Discord",
    setup: "Create an application, turn on the Server Members and Message Content intents, invite the bot, then post once in the channel to create the room.",
    cmd: "./ferri connect discord --token <bot token> --guild <server id>",
  },
  {
    key: "slack",
    name: "Slack",
    setup: "Create the app from Switch's manifest (Socket Mode, no public URL), make an xapp- token with connections:write, install it and /invite it.",
    cmd: "./ferri connect slack --bot-token xoxb-... --app-token xapp-...",
  },
];

const OPTIONAL = [
  { name: "Shield", what: "Blocks scam links and link floods, and redacts leaked keys, on every message.", on: ["./ferri shield:connect"], guide: "shield" },
  { name: "Pocket push", what: "The crew's phones buzz when a card needs them.", on: ["Keys are generated. Phones need HTTPS: set FERRI_PUBLIC_URL and run a tunnel."], guide: "pocket", prose: true },
  { name: "Email", what: "Partner outreach and guest emails through Resend.", on: ["Set RESEND_API_KEY and FERRI_EMAIL_FROM", "./ferri email:setup"], guide: "email" },
  { name: "Social", what: "Posts on LinkedIn, X and Instagram through Buffer.", on: ["Set BUFFER_API_KEY, plus FERRI_MEDIA_URL and FERRI_MEDIA_SECRET for images"], guide: "social" },
  {
    name: "Builder",
    what: "A coding agent Switch runs on your machine: the event site, posters, listings.",
    on: ["On the host, with Node 22 and Claude Code:", "pnpm install", "pnpm builder:setup", "pnpm builder:controller"],
    guide: "builder",
  },
  { name: "Posters", what: "Background art for the Builder's posters.", on: ["Set OPENAI_API_KEY", "pnpm builder:setup"], guide: "builder" },
  { name: "Luma API", what: "Lists events through Luma's API instead of the Builder's browser.", on: ["Set LUMA_API_KEY (Luma Plus only)"], guide: "builder" },
];

const COMMANDS = [
  ["./ferri up", "Start everything. The first run asks for the key and writes .env. Safe to run again."],
  ["./ferri down", "Stop. Keeps your data."],
  ["./ferri reset", "Stop and delete all data. Asks you to type yes. Keeps .env."],
  ["./ferri logs [service]", "Follow the logs: ferri, desk, switch, mattermost, ferri-setup, ..."],
  ["./ferri ps", "What is running."],
  ["./ferri doctor", "Check the core of the stack and every optional part: on, off or broken, with the next step."],
  ["./ferri connect list", "List the platform connections in Switch."],
  ["./ferri space list", "See the rooms Ferri is in."],
  ["./ferri space attach <space> --mode auto", "Attach a room to the event (or --crew for the crew room)."],
  ["./ferri smoke", "Ask Ferri through Mattermost and check it answers with a source. CI runs this."],
  ["./ferri build", "Build Ferri's image from this checkout instead of pulling it."],
  ["./ferri pull", "Pull the newest images."],
  ["./ferri <script> [args]", "Run any package.json script in the stack: kb list, kb ask \"<question>\", card:preview, ..."],
];

const HOSTING = [
  { t: "Make a Cloudflare named tunnel", c: "cloudflared tunnel create ferri" },
  { t: "Clone the repo on the server and fill in .env", c: "COMPOSE_FILE=compose.yml:infra/demo/compose.demo.yml" },
  { t: "Start it", c: "./ferri up" },
  { t: "Connect your platform and attach its chats", c: "./ferri space attach build-night --mode auto" },
  { t: "Turn on Shield", c: "./ferri shield:connect" },
  { t: "Cap what strangers can spend with a Switch budget", c: '"metric": "messages", "amount_limit": 300, "period_hours": 24' },
  { t: "Check it", c: "./ferri doctor" },
];

function Mono({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <code className={`rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.86em] break-words text-zinc-800 ${className}`}>{children}</code>;
}

export default function GetStarted() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative isolate -mt-[76px] pt-[128px] pb-16 sm:pb-20">
        <div className="hero-sky" aria-hidden>
          <span className="cloud top-[12%] left-[-6%] h-[120px] w-[420px]" />
          <span className="cloud top-[30%] left-[8%] h-[70px] w-[260px] [animation-delay:-12s]" />
          <span className="cloud top-[8%] right-[-4%] h-[130px] w-[460px] [animation-delay:-6s]" />
          <span className="cloud top-[34%] right-[10%] h-[60px] w-[220px] [animation-delay:-20s]" />
        </div>

        <div className="site-section text-center">
          <div className="rise inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 py-1 pr-3.5 pl-1 text-[14px] font-medium text-zinc-700 shadow-[0_2px_12px_-6px_rgba(40,60,60,0.25)] backdrop-blur">
            <FerriAvatar size={26} />
            <span>
              Free and open source, <span className="font-semibold text-brand-ink">MIT</span>
            </span>
          </div>

          <h1 className="rise mx-auto mt-6 max-w-[1100px] text-zinc-900 [animation-delay:80ms]">
            <span className="display block text-[clamp(44px,7.4vw,96px)]">Running in</span>
            <span className="font-serif-display block text-[clamp(46px,7.8vw,102px)] leading-[1.02]">one command.</span>
          </h1>

          <p className="rise mx-auto mt-6 max-w-[640px] text-[clamp(17px,1.5vw,19px)] leading-[1.6] text-zinc-600 [animation-delay:160ms]">
            It asks for your Anthropic key once, then starts Switch, a Mattermost to try it in, Ferri and Desk in Docker, with a demo event already loaded. No Node, no Switch
            checkout.
          </p>
        </div>

        <div className="rise mx-auto mt-10 max-w-[640px] px-5 text-left [animation-delay:240ms] sm:px-8">
          {/* Phones get the wrapping terminal so the clone URL is never cut off. */}
          <div className="hidden sm:block">
            <CopyCommand lines={QUICK} />
          </div>
          <div className="sm:hidden">
            <WrapCommand lines={QUICK} />
          </div>
          <p className="mt-3 text-center text-[14px] text-zinc-600">
            On Windows, the last command is <Mono>.\ferri up</Mono> in PowerShell, or <Mono>ferri up</Mono> in cmd.
          </p>
        </div>

        {/* Try before you install */}
        <div className="rise mx-auto mt-12 max-w-[1000px] px-5 [animation-delay:300ms] sm:px-8">
          <div className="rounded-[24px] border border-zinc-200 bg-white/85 p-5 shadow-[var(--shadow-card)] backdrop-blur sm:p-6">
            <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900">Try before you install</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-zinc-600">
                  Ferri is live for Lantern Build Night, a made-up event. Ask <span className="font-medium text-zinc-800">@ferri when does hacking start?</span>, then something it
                  can&apos;t know. Or look around a live Desk, read-only.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <a href={DISCORD} className="btn h-11 px-4 text-[14.5px]">
                  <PlatformLogo platform="discord" size={17} /> Discord
                </a>
                <a href={TELEGRAM} className="btn h-11 px-4 text-[14.5px]">
                  <PlatformLogo platform="telegram" size={17} /> Telegram
                </a>
                <a href={DEMO_DESK} className="btn h-11 px-4 text-[14.5px]">
                  <Eye size={16} aria-hidden /> Desk, read-only
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Requirements and what up does ────────────────────── */}
      <section id="setup" className="site-section grid scroll-mt-24 gap-12 pb-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:pb-32">
        <div className="min-w-0">
          <p className="kicker">Requirements</p>
          <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">What you need.</h2>
          <p className="lede">Nothing else: no Node, no Switch checkout.</p>
          <ul className="mt-8 space-y-5">
            {REQUIREMENTS.map((r) => (
              <li key={r.t} className="flex gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink">
                  <r.icon size={19} aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-[16.5px] font-semibold text-zinc-900">{r.t}</div>
                  <div className="mt-0.5 text-[15px] leading-relaxed text-zinc-600">{r.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <p className="kicker">
            What <code className="font-mono">./ferri up</code> does
          </p>
          <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">Five steps, done for you.</h2>
          <ol className="mt-8 space-y-0">
            {UP_STEPS.map((s, i) => (
              <li key={s.t} className="relative flex gap-4 pb-6 last:pb-0">
                {i < UP_STEPS.length - 1 ? <span className="absolute top-10 bottom-1 left-[17px] w-[2px] rounded-full bg-zinc-200" aria-hidden /> : null}
                <span className="num relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[16px] text-white">{i + 1}</span>
                <div className="min-w-0 pt-1">
                  <div className="text-[16.5px] font-semibold text-zinc-900">{s.t}</div>
                  <div className="mt-0.5 text-[15px] leading-relaxed text-zinc-600">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── What you get ─────────────────────────────────────── */}
      <section id="get" className="scroll-mt-24 border-y border-zinc-200 bg-zinc-100/60 py-24 lg:py-28">
        <div className="site-section">
          <div className="max-w-[760px]">
            <p className="kicker">What you get</p>
            <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">Four addresses on your own machine.</h2>
            <p className="lede">
              The passwords are printed by <Mono>./ferri up</Mono> and kept in <Mono>.env</Mono>: <Mono>MATTERMOST_USER_PASSWORD</Mono>, <Mono>MM_TEST_PASSWORD</Mono> and{" "}
              <Mono>GATEWAY_ADMIN_PASSWORD</Mono>.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-[24px] border border-zinc-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-6 border-b border-zinc-200 bg-zinc-50 px-6 py-2.5 text-[12.5px] font-medium text-zinc-500 md:grid">
              <span>What</span>
              <span>Address</span>
              <span>Sign in</span>
            </div>
            <ul className="divide-y divide-zinc-200">
              {SERVICES.map((s) => (
                <li key={s.what} className="grid gap-2 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center md:gap-6">
                  <div className="flex min-w-0 items-center gap-3">
                    {s.ferri ? (
                      <FerriAvatar size={28} />
                    ) : s.logo === "switch" ? (
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand text-white">
                        <Boxes size={15} aria-hidden />
                      </span>
                    ) : (
                      <PlatformLogo platform={s.logo} size={24} />
                    )}
                    <div className="min-w-0">
                      <div className="text-[16px] font-semibold text-zinc-900">{s.what}</div>
                      <div className="text-[13.5px] text-zinc-500">{s.sub}</div>
                    </div>
                  </div>
                  <div className="min-w-0 md:pl-0">
                    <span className="font-mono text-[14px] break-all text-brand-ink">{s.addr}</span>
                  </div>
                  <div className="min-w-0 text-[14.5px] leading-relaxed text-zinc-600">{s.login}</div>
                </li>
              ))}
            </ul>
          </div>
          <ul className="mt-5 space-y-2 text-[14.5px] leading-relaxed text-zinc-600">
            <li className="flex gap-2.5">
              <Check size={16} className="mt-[3px] shrink-0 text-brand" aria-hidden />
              <span>
                Also running: the Switch API at <Mono>localhost:8800</Mono>, used by Ferri and the scripts, and Ferri&apos;s Postgres at <Mono>localhost:5433</Mono>.
              </span>
            </li>
            <li className="flex gap-2.5">
              <Check size={16} className="mt-[3px] shrink-0 text-brand" aria-hidden />
              <span>
                Every port is bound to 127.0.0.1 only. To change one, set <Mono>DESK_HOST_PORT</Mono>, <Mono>MATTERMOST_HOST_PORT</Mono>, <Mono>API_HOST_PORT</Mono>,{" "}
                <Mono>GATEWAY_HOST_PORT</Mono> or <Mono>FERRI_DB_HOST_PORT</Mono> in .env, then <Mono>./ferri up</Mono>.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── Try it ───────────────────────────────────────────── */}
      <section id="try-it" className="site-section grid scroll-mt-24 items-start gap-12 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:py-32">
        <div className="min-w-0">
          <p className="kicker">Try it</p>
          <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">Three messages in Mattermost.</h2>
          <p className="lede">
            Open <Mono>http://localhost:8065</Mono>, go to <Mono>ferri-lab</Mono>, and watch one unknown question go to the crew and come back.
          </p>
          <div className="mt-8 hidden lg:block">
            <Ferri pose="thinking" size={180} decorative />
          </div>
        </div>
        <div className="min-w-0">
          <ol className="space-y-4">
            {TRY.map((m, i) => (
              <li key={m.say} className="rounded-[22px] border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="num inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[15px] text-white">{i + 1}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[12.5px] font-medium text-zinc-600">
                    <PlatformLogo platform="mattermost" size={13} /> {m.room}
                  </span>
                </div>
                <div className="mt-4 rounded-[14px] bg-zinc-50 px-3.5 py-2.5 text-[15px]">
                  <span className="font-semibold text-zinc-900">{m.who}</span> <span className="font-mono text-[14px] break-words text-zinc-800">{m.say}</span>
                </div>
                <p className="mt-3 flex gap-2 text-[14.5px] leading-relaxed text-zinc-600">
                  <FerriAvatar size={20} className="mt-px" />
                  <span>{m.then}</span>
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[14.5px] leading-relaxed text-zinc-600">
            Also try <Mono>does anyone know the wifi password?</Mono> in ferri-lab, with no mention. Ferri waits a short moment so a person can answer first, then answers with its
            source.
          </p>
        </div>
      </section>

      {/* ── Connect your apps ────────────────────────────────── */}
      <section id="connect" className="scroll-mt-24 border-y border-zinc-200 bg-zinc-100/60 py-24 lg:py-28">
        <div className="site-section">
          <div className="max-w-[760px]">
            <p className="kicker">Connect your apps</p>
            <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">One command per app.</h2>
            <p className="lede">
              Each command adds the platform&apos;s connection to Switch, which makes every group on it a Switch room. A value you leave out is read from .env, and it is safe to run
              again.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {CONNECT.map((c) => (
              <div key={c.key} className="flex min-w-0 flex-col rounded-[24px] border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2.5">
                  <PlatformLogo platform={c.key} size={24} />
                  <h3 className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-zinc-900">{c.name}</h3>
                </div>
                <p className="mt-3 mb-4 text-[14.5px] leading-relaxed text-zinc-600">{c.setup}</p>
                <div className="mt-auto min-w-0">
                  <WrapCommand lines={[c.cmd]} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="min-w-0 rounded-[24px] border border-zinc-200 bg-white p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <PlatformLogo platform="whatsapp" size={24} />
                <h3 className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-zinc-900">WhatsApp</h3>
              </div>
              <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600">
                Through the <Mono>whatsapp_web</Mono> bridge we added to Switch, linked to your own number. It is already in the Switch image; only the sidecar is extra. In .env,
                add the profile and name the chats that become rooms:
              </p>
              <pre className="mt-4 overflow-x-auto rounded-[14px] bg-zinc-100 px-4 py-3 font-mono text-[13px] leading-[1.8] text-zinc-800">
                {"COMPOSE_PROFILES=mattermost,whatsapp\nFERRI_WHATSAPP_CHATS=me,Lantern Build Night"}
              </pre>
              <p className="mt-4 mb-4 text-[14.5px] leading-relaxed text-zinc-600">
                Then start the sidecar and pair. The command prints a pairing code: on the phone, WhatsApp, Linked devices, Link a device, Link with phone number instead. Leave out{" "}
                <Mono>--code</Mono> to get a QR code instead.
              </p>
              <WrapCommand lines={["./ferri up", "./ferri whatsapp:pair --code <phone number>"]} />
              <a href={doc("whatsapp")} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-ink hover:underline">
                Read whatsapp.md <ArrowRight size={14} aria-hidden />
              </a>
            </div>

            <div className="min-w-0 rounded-[24px] border border-zinc-200 bg-white p-5 sm:p-6">
              <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900">Then, on any app</h3>
              <ol className="mt-4 space-y-4 text-[14.5px] leading-relaxed text-zinc-600">
                <li className="flex gap-3">
                  <span className="num inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] text-brand-ink">1</span>
                  <span>
                    Type <Mono>!invite-agent @ferri</Mono> in the chat. The space shows up in Desk under Discovered, switched off.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="num inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] text-brand-ink">2</span>
                  <span>
                    Attach it to the event in Desk, or with <Mono>./ferri space attach &lt;space&gt; --mode auto</Mono>. Use <Mono>--crew</Mono> for the room where cards land.
                  </span>
                </li>
              </ol>
              <p className="mt-5 rounded-[14px] bg-accent-soft/70 p-3.5 text-[13.5px] leading-relaxed text-zinc-700">
                Name the platform bot after Switch, not after Ferri. Slack and Discord turn a typed @ferri into a mention of a bot whose name starts with &ldquo;ferri&rdquo;, and then
                the message never reaches Ferri.
              </p>
              <a href={doc("platforms")} className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-ink hover:underline">
                Read platforms.md <ArrowRight size={14} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Optional parts ───────────────────────────────────── */}
      <section id="optional" className="site-section scroll-mt-24 py-24 lg:py-32">
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <div className="max-w-[760px]">
            <p className="kicker">Optional parts</p>
            <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">Each one is off until you turn it on.</h2>
            <p className="lede">
              <Mono>./ferri doctor</Mono> shows which are on, off or broken, and the next step for each. After you edit .env, run{" "}
              <Mono>docker compose restart ferri desk</Mono>.
            </p>
          </div>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OPTIONAL.map((o) => (
            <li key={o.name} className="flex min-w-0 flex-col rounded-[22px] border border-zinc-200 bg-white p-5">
              <h3 className="font-display text-[20px] font-extrabold tracking-[-0.02em] text-zinc-900">{o.name}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-zinc-600">{o.what}</p>
              <div className="mt-4 mb-4 space-y-1 rounded-[12px] bg-zinc-50 px-3 py-2.5 text-[13px] leading-relaxed">
                {o.on.map((l) =>
                  l.startsWith("./") || l.startsWith("pnpm") ? (
                    <div key={l} className="font-mono break-words text-zinc-800">
                      <span className="text-brand select-none">$ </span>
                      {l}
                    </div>
                  ) : (
                    <div key={l} className="text-zinc-600">
                      {l}
                    </div>
                  ),
                )}
              </div>
              <a href={doc(o.guide)} className="mt-auto inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-ink hover:underline">
                {o.guide}.md <ArrowRight size={14} aria-hidden />
              </a>
            </li>
          ))}
          <li className="flex min-w-0 flex-col justify-center rounded-[22px] border border-dashed border-zinc-300 p-5">
            <div className="flex items-center gap-2.5">
              <Server size={18} className="text-brand" aria-hidden />
              <h3 className="text-[16px] font-semibold text-zinc-900">Without Mattermost</h3>
            </div>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-zinc-600">
              On a small server that uses Telegram or Discord, remove <Mono>mattermost</Mono> from <Mono>COMPOSE_PROFILES</Mono> in .env.
            </p>
          </li>
        </ul>
      </section>

      {/* ── Useful commands ──────────────────────────────────── */}
      <section id="commands" className="scroll-mt-24 border-y border-zinc-200 bg-zinc-100/60 py-24 lg:py-28">
        <div className="site-section grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="min-w-0">
            <p className="kicker">Useful commands</p>
            <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">Everything goes through ./ferri.</h2>
            <p className="lede">
              On Windows, use <Mono>.\ferri</Mono> in PowerShell or <Mono>ferri</Mono> in cmd.
            </p>
            <div className="mt-8 rounded-[20px] border border-zinc-200 bg-white p-5">
              <div className="flex items-center gap-2.5">
                <Stethoscope size={18} className="text-brand" aria-hidden />
                <h3 className="text-[16px] font-semibold text-zinc-900">Something off?</h3>
              </div>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-zinc-600">
                Run <Mono>./ferri doctor</Mono> first. If Ferri does not answer at all, the Anthropic key is usually wrong or out of credit.
              </p>
              <a href={doc("troubleshooting")} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-ink hover:underline">
                troubleshooting.md <ArrowRight size={14} aria-hidden />
              </a>
            </div>
          </div>
          <div className="min-w-0 overflow-hidden rounded-[24px] border border-zinc-200 bg-white">
            <ul className="divide-y divide-zinc-200">
              {COMMANDS.map(([c, d]) => (
                <li key={c} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)] sm:gap-6">
                  <code className="font-mono text-[13.5px] leading-relaxed break-words text-zinc-900">{c}</code>
                  <span className="text-[14px] leading-relaxed text-zinc-600">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Hosting ──────────────────────────────────────────── */}
      <section id="hosting" className="scroll-mt-24 overflow-hidden bg-[#0d1b1e] py-24 text-[#eef3f2] lg:py-32">
        <div className="site-section grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="min-w-0">
            <p className="mb-3 text-[14px] font-semibold text-[#8fe0da]">Hosting on a server</p>
            <h2 className="display text-[clamp(32px,4.2vw,52px)]">Our live demo runs exactly this way.</h2>
            <p className="mt-5 max-w-[560px] text-[17px] leading-[1.65] text-[#b9cccc]">
              The same <code className="font-mono text-[15px] text-[#8fe0da]">./ferri up</code>, on a small always-on Linux server with Docker and about 3 GB of free RAM, reached
              through a Cloudflare named tunnel. No ports are opened on the server, and Mattermost is off: your community uses Telegram, Discord or Slack.
            </p>
            <a
              href={doc("hosting")}
              className="btn mt-8 h-11 border-white/20 bg-white/10 px-5 text-[14.5px] text-white hover:bg-white/15"
              style={{ boxShadow: "none" }}
            >
              Read hosting.md <ArrowRight size={15} aria-hidden />
            </a>
          </div>
          <ol className="min-w-0 space-y-3">
            {HOSTING.map((h, i) => (
              <li key={h.t} className="flex gap-4 rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <span className="num inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2fb3ad] text-[15px] text-[#0d1b1e]">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[15.5px] font-semibold text-white">{h.t}</div>
                  <code className="mt-1 block font-mono text-[12.5px] break-words text-[#9db5b6]">{h.c}</code>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Cost ─────────────────────────────────────────────── */}
      <section id="cost" className="site-section scroll-mt-24 py-24 lg:py-32">
        <div className="max-w-[760px]">
          <p className="kicker">Cost</p>
          <h2 className="display text-[clamp(32px,4.2vw,52px)] text-zinc-900">Free software. You pay only for your own model use.</h2>
        </div>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Scale,
              t: "Free and MIT",
              d: "Ferri is MIT-licensed and runs on your own machine or server, next to your own Switch. Switch itself is licensed by SandboxAQ under its own terms.",
            },
            {
              icon: KeyRound,
              t: "Your own Anthropic usage",
              d: "Your key, your bill. The quick jobs on every message (triage, care reading, sheets, translations) run on Claude Haiku 5.5. Answers and drafts default to Claude Sonnet 5.5; set FERRI_MODEL_MAIN=claude-haiku-5-5 to run them on Haiku too.",
            },
            {
              icon: Coins,
              t: "Caps you control",
              d: "A Switch budget can stop Ferri for the day after a set number of messages, and the Builder has its own Switch budget. Also set a monthly spend limit on the Anthropic key.",
            },
          ].map((x) => (
            <div key={x.t}>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand-soft text-brand-ink">
                <x.icon size={20} aria-hidden />
              </span>
              <h3 className="mt-4 text-[18px] font-semibold tracking-[-0.01em] text-zinc-900">{x.t}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-zinc-600">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final call to action ─────────────────────────────── */}
      <section className="px-4 pb-20 sm:px-8">
        <div className="relative mx-auto max-w-[1160px] overflow-hidden rounded-[36px] bg-brand px-6 py-14 text-white shadow-[inset_0_-6px_0_var(--brand-lip)] sm:px-14 sm:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <h2 className="display text-[clamp(36px,5.2vw,64px)]">Clone it. Run it. Ask it something.</h2>
              <p className="mt-4 max-w-[580px] text-[17px] leading-relaxed text-white">
                CI boots the whole stack with <code className="font-mono text-[15px]">./ferri up</code> on a clean runner and asks Ferri through Mattermost on every push to main. Your
                machine is next.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={GITHUB} className="btn h-12 border-0 bg-white px-6 text-[15.5px] text-zinc-900 hover:bg-zinc-50">
                  <GithubMark size={16} /> Ferri on GitHub
                </a>
                <a href={DOCS} className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  <BookOpen size={16} aria-hidden /> Read the docs
                </a>
                <Link href="/switch" className="btn h-12 border-white/40 bg-transparent px-6 text-[15.5px] text-white hover:bg-white/10" style={{ boxShadow: "none" }}>
                  How it uses Switch <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </div>
            <div className="hidden lg:block">
              <Ferri pose="wave" size={230} alive decorative />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
