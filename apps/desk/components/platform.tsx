import { LOGO_PATHS } from "./platform-paths";

/** Switch bridge names to the platform a person recognises. */
const ALIAS: Record<string, string> = {
  whatsapp_web: "whatsapp",
  twitter: "x",
};

export const PLATFORM_NAME: Record<string, string> = {
  discord: "Discord",
  telegram: "Telegram",
  slack: "Slack",
  whatsapp: "WhatsApp",
  whatsapp_web: "WhatsApp",
  mattermost: "Mattermost",
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  instagram: "Instagram",
  github: "GitHub",
  email: "Email",
  switch: "Switch",
};

export const platformName = (p: string | null | undefined) => PLATFORM_NAME[p ?? ""] ?? (p ? p.charAt(0).toUpperCase() + p.slice(1) : "Switch");

const SLACK = [
  { fill: "#E01E5A", d: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" },
  { fill: "#36C5F0", d: "M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" },
  { fill: "#2EB67D", d: "M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" },
  { fill: "#ECB22E", d: "M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" },
];

/** A platform's own logo in its own colour (X and GitHub follow the text colour). */
export function PlatformLogo({ platform, size = 16, className = "", mono = false }: { platform: string | null | undefined; size?: number; className?: string; mono?: boolean }) {
  const key = ALIAS[platform ?? ""] ?? platform ?? "";
  const label = platformName(platform);
  if (key === "slack") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} role="img" aria-label={label}>
        {SLACK.map((p) => (
          <path key={p.fill} d={p.d} fill={mono ? "currentColor" : p.fill} />
        ))}
      </svg>
    );
  }
  const logo = LOGO_PATHS[key];
  if (!logo) {
    // Switch's own rooms and anything unknown: a neutral dot with the first letter.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} role="img" aria-label={label}>
        <circle cx={12} cy={12} r={11} fill="currentColor" opacity={0.15} />
        <text x={12} y={16.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">
          {label.charAt(0)}
        </text>
      </svg>
    );
  }
  const followsText = mono || key === "x" || key === "github";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} role="img" aria-label={label}>
      <path d={logo.path} fill={followsText ? "currentColor" : logo.hex} />
    </svg>
  );
}

/** "[logo] Telegram · Lantern Build Night" */
export function PlatformTag({ platform, space, className = "" }: { platform: string | null | undefined; space?: string | null; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-zinc-500 ${className}`}>
      <PlatformLogo platform={platform} size={14} />
      <span className="truncate">
        {platformName(platform)}
        {space ? ` · ${space}` : ""}
      </span>
    </span>
  );
}
