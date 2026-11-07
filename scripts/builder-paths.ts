import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export { builderPaths } from "@ferri/knowledge";

/**
 * Switch's headless agent controller, packaged once and published as a release asset on our
 * Switch fork (upstream publishes no release yet). `builder:setup` downloads and unpacks it.
 */
export const CONTROLLER_RELEASE = {
  version: "0.1.1",
  url: "https://github.com/RudraO2/switch/releases/download/ferri-controller-0.1.1/switch-agent-controller-0.1.1.tgz",
  sha256: "37186d4c78b67c2a5cf486705c0bba0198c8e29732b38e671eaf64c4c731475b",
};

function controllerHome(env: Record<string, string | undefined>): string {
  return path.join(env.FERRI_BUILDER_HOME ?? path.join(os.homedir(), ".ferri"), `controller-${CONTROLLER_RELEASE.version}`);
}

/**
 * Where the controller's CLI is: SWITCH_CONTROLLER_CLI, else the downloaded release, else a
 * controller built in a Switch checkout next to this repo.
 */
export function controllerCli(root: string, env: Record<string, string | undefined> = process.env): string {
  if (env.SWITCH_CONTROLLER_CLI) return env.SWITCH_CONTROLLER_CLI;
  const downloaded = path.join(controllerHome(env), "package", "cli.mjs");
  if (fs.existsSync(downloaded)) return downloaded;
  const sibling = path.join(root, "..", "switch", "console", "packages", "agent-controller", "dist", "cli.mjs");
  return fs.existsSync(sibling) ? sibling : downloaded;
}

/** Download and unpack the controller release when no controller is there yet. Returns the CLI path. */
export async function ensureController(root: string, env: Record<string, string | undefined> = process.env): Promise<string> {
  const cli = controllerCli(root, env);
  if (fs.existsSync(cli)) return cli;
  if (env.SWITCH_CONTROLLER_CLI) throw new Error(`SWITCH_CONTROLLER_CLI points at ${cli}, which does not exist.`);
  const home = controllerHome(env);
  fs.mkdirSync(home, { recursive: true });
  console.log(`Downloading the Switch agent controller ${CONTROLLER_RELEASE.version} ...`);
  const res = await fetch(CONTROLLER_RELEASE.url);
  if (!res.ok) throw new Error(`Could not download the controller (${CONTROLLER_RELEASE.url}): HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha256").update(bytes).digest("hex");
  if (sum !== CONTROLLER_RELEASE.sha256) throw new Error(`The controller download does not match its checksum (got ${sum}).`);
  const tgz = path.join(home, "controller.tgz");
  fs.writeFileSync(tgz, bytes);
  // tar ships with macOS, Linux and Windows 10+.
  const r = spawnSync("tar", ["-xzf", "controller.tgz"], { cwd: home, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Could not unpack ${tgz}: ${r.stderr || r.error?.message}`);
  fs.rmSync(tgz);
  const out = path.join(home, "package", "cli.mjs");
  if (!fs.existsSync(out)) throw new Error(`The controller package has no cli.mjs (${out}).`);
  console.log(`Controller ready: ${out}`);
  return out;
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
