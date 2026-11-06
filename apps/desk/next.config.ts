import path from "node:path";
import type { NextConfig } from "next";

// Desk shares Ferri's .env at the repo root (DATABASE_URL, SWITCH_URL, FERRI_AGENT_ID, ...).
const rootEnv = path.resolve(process.cwd(), "../../.env");
try {
  process.loadEnvFile(rootEnv);
} catch {
  // No .env: the environment must provide the values.
}

// Pocket on a phone goes through a tunnel (spec 06); its host must be allowed to post forms.
const tunnelOrigins = (process.env.POCKET_ALLOWED_ORIGINS ?? "*.trycloudflare.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Our workspace packages ship TypeScript sources.
  transpilePackages: ["@ferri/db", "@ferri/email", "@ferri/knowledge", "@ferri/push", "@ferri/shield", "@ferri/social", "@ferri/switch"],
  serverExternalPackages: ["postgres", "web-push"],
  allowedDevOrigins: tunnelOrigins,
  experimental: {
    serverActions: { allowedOrigins: tunnelOrigins },
  },
  async headers() {
    return [
      {
        // Pocket's service worker: always fetched fresh, so a new version takes over at once.
        source: "/m/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/m" },
        ],
      },
    ];
  },
};

export default nextConfig;
