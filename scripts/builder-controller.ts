/**
 * Runs the Switch agent controller in this terminal (spec 11). On Windows the
 * controller runs with `run` (it is not installed as a service there). It runs
 * the agents Switch assigns to this machine, Ferri Builder among them.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { builderPaths, controllerCli } from "./builder-paths.ts";

const root = path.resolve(import.meta.dirname, "..");
const { envFile } = builderPaths();
const args = ["--no-warnings", controllerCli(root), "run", "--no-self-update"];
if (fs.existsSync(envFile)) args.push("--env-file", envFile);
else console.warn(`No ${envFile} yet: run \`pnpm builder:setup\` (the Builder gets its own Claude home and key there).`);

const child = spawn(process.execPath, args, { stdio: "inherit" });
const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
