import path from "node:path";
import type { NextConfig } from "next";

// Desk shares Ferri's .env at the repo root (DATABASE_URL, SWITCH_URL, FERRI_AGENT_ID, ...).
const rootEnv = path.resolve(process.cwd(), "../../.env");
try {
  process.loadEnvFile(rootEnv);
} catch {
  // No .env: the environment must provide the values.
}

const nextConfig: NextConfig = {
  // Our workspace packages ship TypeScript sources.
  transpilePackages: ["@ferri/db", "@ferri/knowledge", "@ferri/switch"],
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
