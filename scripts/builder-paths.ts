import fs from "node:fs";
import path from "node:path";

export { builderPaths } from "@ferri/knowledge";

/** The headless Switch agent controller, built from the Switch checkout next to this repo. */
export function controllerCli(root: string, env: Record<string, string | undefined> = process.env): string {
  return (
    env.SWITCH_CONTROLLER_CLI ??
    path.join(root, "..", "switch", "console", "packages", "agent-controller", "dist", "cli.mjs")
  );
}

export function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}
