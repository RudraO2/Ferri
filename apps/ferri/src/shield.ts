import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { and, eq, ne } from "drizzle-orm";
import { eventSpaces, events, shieldEvents, type Db } from "@ferri/db";
import { approvers, crewRoomForEvent, loadCrew, resolveSpace, spaceLabel } from "@ferri/knowledge";
import { pushToUsers, switchUsersForCrew } from "@ferri/push";
import { FloodWatch, WIRE_OUTCOME, check, defang, describe, extractLinks, loadRules, logCheck, safeBrowsing, worst, type Role, type Verdict } from "@ferri/shield";
import { config } from "./config.ts";
import type { Loop } from "./loop.ts";

export interface ShieldDeps {
  db: Db;
  loop: Loop;
  log: (msg: string) => void;
}

/** One crew alert per room per reason in this window. */
const ALERT_EVERY_MS = 5 * 60_000;
/** Everything Shield does must fit well inside Switch Trust's 2 s timeout. */
const BUDGET_MS = 1500;

interface RoomFacts {
  spaceId: string | null;
  communityId: string | null;
  eventId: string | null;
  name: string;
  platform: string | null;
  at: number;
}

/**
 * Shield (spec 07): the Switch Trust endpoint. Switch posts every message
 * (people's and agents') to `POST /guardrails/check`; Shield answers with
 * Switch Trust's outcome and findings, logs the check, and tells the crew
 * about anything it blocked, redacted or flagged in a member's message.
 */
export function createShield(deps: ShieldDeps): { start(): Promise<Server | null> } {
  const { db, loop, log } = deps;
  const flood = new FloodWatch(120_000, 3);
  const lastAlert = new Map<string, number>();
  const rooms = new Map<string, RoomFacts>();

  async function roomFacts(roomId: string): Promise<RoomFacts> {
    const hit = rooms.get(roomId);
    if (hit && Date.now() - hit.at < 30_000) return hit;
    const space = roomId ? await resolveSpace(db, roomId) : null;
    const facts: RoomFacts = {
      spaceId: space?.spaceId ?? null,
      communityId: space?.communityId ?? null,
      eventId: space?.eventId ?? null,
      name: space?.name ?? roomId,
      platform: space?.platform ?? null,
      at: Date.now(),
    };
    rooms.set(roomId, facts);
    return facts;
  }

  async function verdictFor(role: Role, content: string, roomId: string): Promise<{ verdict: Verdict; room: RoomFacts }> {
    const room = await roomFacts(roomId);
    const rules = room.communityId ? await loadRules(db, room.communityId) : undefined;
    const verdict = check({ role, content, roomId, rules, flood });
    // Reputation, only for links nothing else flagged, and only when a key is set.
    const flagged = new Set(verdict.findings.map((f) => f.detected_string));
    const rest = extractLinks(content).filter((l) => !flagged.has(l.raw) && !(rules?.allow ?? []).some((d) => l.host === d || l.host.endsWith(`.${d}`)));
    for (const l of await safeBrowsing(rest, { timeoutMs: 700 })) {
      verdict.findings.push({ category: "reputation", detector_name: "google_safe_browsing", severity: "high", detected_string: l.raw, reason: `${defang(l.host)} is on Google Safe Browsing's list of dangerous sites` });
      verdict.outcome = worst(verdict.outcome, "blocked");
    }
    return { verdict, room };
  }

  /** Tell the event's crew (crew room post and a push to the leads). Never the detected text. */
  async function alertCrew(eventRowId: string, room: RoomFacts, roomId: string, verdict: Verdict): Promise<void> {
    if (!room.communityId) return;
    const key = `${roomId}|${verdict.outcome}|${[...new Set(verdict.findings.map((f) => f.category))].sort().join(",")}`;
    const last = lastAlert.get(key) ?? 0;
    if (Date.now() - last < ALERT_EVERY_MS) return;
    lastAlert.set(key, Date.now());
    // A space that is Off belongs to no event: tell the crew of a live event instead.
    const crewRoomId = (await crewRoomForEvent(db, room.eventId)) ?? (await anyCrewRoom(room.communityId));
    if (!crewRoomId) return;
    const where = spaceLabel({ name: room.name, platform: room.platform });
    const why = describe(verdict);
    const text =
      verdict.outcome === "blocked"
        ? `Shield blocked a message in ${where}: ${why}. It never reached the room or me, and Switch told the sender it was blocked.`
        : verdict.outcome === "redacted"
          ? `Shield hid ${why} in a message in ${where}; the room saw [redacted]. Whoever posted it should change that key or password now.`
          : `Shield flagged a message in ${where}: ${why}. It was delivered with a warning.`;
    await loop.post(room.communityId, crewRoomId, text);
    const crew = await loadCrew(db, room.communityId, room.eventId);
    await pushToUsers(db, await switchUsersForCrew(db, approvers(crew).owners.map((o) => o.id)), {
      kind: "shield",
      title: verdict.outcome === "blocked" ? `Shield blocked a message in ${where}` : verdict.outcome === "redacted" ? `Shield hid a secret in ${where}` : `Shield flagged a message in ${where}`,
      body: why.slice(0, 180),
      url: "/m",
      tag: `shield-${roomId}`,
      renotify: true,
    });
    await db.update(shieldEvents).set({ alertedCrewAt: new Date() }).where(eq(shieldEvents.id, eventRowId));
  }

  async function anyCrewRoom(communityId: string): Promise<string | null> {
    const [row] = await db
      .select({ eventId: eventSpaces.eventId })
      .from(eventSpaces)
      .innerJoin(events, eq(events.id, eventSpaces.eventId))
      .where(and(eq(events.communityId, communityId), eq(eventSpaces.role, "crew"), ne(events.stage, "wrap")))
      .limit(1);
    return row ? crewRoomForEvent(db, row.eventId) : null;
  }

  async function handle(req: IncomingMessage, body: string): Promise<{ status: number; json: unknown }> {
    const key = String(req.headers["x-flintai-api-key"] ?? "");
    if (!config.shieldApiKey || !sameSecret(key, config.shieldApiKey)) return { status: 401, json: { error: "bad api key" } };
    let parsed: { messages?: { role?: string; content?: string }[] };
    try {
      parsed = JSON.parse(body);
    } catch {
      return { status: 400, json: { error: "body is not JSON" } };
    }
    const message = parsed.messages?.[parsed.messages.length - 1];
    const role: Role = message?.role === "assistant" ? "assistant" : "user";
    const content = typeof message?.content === "string" ? message.content : "";
    const roomId = String(req.headers["x-agent-session-id"] ?? "");
    const started = performance.now();
    const { verdict, room } = await Promise.race([
      verdictFor(role, content, roomId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("shield over budget")), BUDGET_MS)),
    ]);
    const latencyMs = Math.round(performance.now() - started);
    // Logged and reported after the answer, so the crew alert never slows a message down.
    void (async () => {
      const id = await logCheck(db, { roomId, spaceId: room.spaceId, role, verdict, latencyMs });
      if (verdict.outcome !== "ok") {
        log(`shield ${verdict.outcome} (${role}) in ${room.name}: ${describe(verdict)} [${latencyMs} ms]`);
        if (role === "user") await alertCrew(id, room, roomId, verdict);
      }
    })().catch((err) => log(`shield log/alert failed: ${(err as Error).message}`));
    return {
      status: 200,
      json: {
        outcome: WIRE_OUTCOME[verdict.outcome],
        policy_id: String(req.headers["x-guardrails-policy-id"] ?? config.shieldPolicyId),
        policy_name: "Ferri Shield",
        findings: verdict.findings.map((f) => ({ category: f.category, detector_name: f.detector_name, severity: f.severity, detected_string: f.detected_string })),
      },
    };
  }

  return {
    async start() {
      if (!config.shieldApiKey) {
        log("shield off: SHIELD_API_KEY is not set (run `pnpm shield:connect`)");
        return null;
      }
      const server = createServer((req, res) => {
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(json));
        };
        if (req.method === "GET" && req.url === "/healthz") return send(200, { ok: true, name: "ferri-shield" });
        if (req.method !== "POST" || !req.url?.startsWith("/guardrails/check")) return send(404, { error: "not found" });
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (c: string) => {
          body += c;
          if (body.length > 2_000_000) req.destroy();
        });
        req.on("end", () => {
          handle(req, body)
            .then((r) => send(r.status, r.json))
            .catch((err) => {
              // Switch treats an error as "errored" and lets the message through: the same as failing open.
              log(`shield check failed: ${(err as Error).message}`);
              send(500, { error: "check failed" });
            });
        });
      });
      await new Promise<void>((resolve) => server.listen(config.shieldPort, config.shieldHost, resolve));
      log(`shield listening on http://${config.shieldHost}:${config.shieldPort} (Switch Trust endpoint)`);
      return server;
    },
  };
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
