/**
 * Show what a Ferri question card looks like on a platform: opens a sample card
 * (same shape as a real one) in a room, or closes it again.
 *
 *   pnpm card:preview <room id>           open the sample card there
 *   pnpm card:preview <room id> --close   close it (it then reads "closed")
 *
 * It uses its own session (`ferri-preview`), so Ferri's card loop never treats
 * an answer to it as a real crew answer.
 */
import { randomUUID } from "node:crypto";
import { SwitchAgent } from "@ferri/switch";

const [roomId, flag] = process.argv.slice(2);
if (!roomId) {
  console.error("usage: pnpm card:preview <room id> [--close]");
  process.exit(1);
}
const agentId = process.env.FERRI_AGENT_ID;
const apiKey = process.env.FERRI_AGENT_KEY;
if (!agentId || !apiKey) throw new Error("FERRI_AGENT_ID / FERRI_AGENT_KEY missing in .env");

const agent = new SwitchAgent({
  baseUrl: process.env.SWITCH_URL ?? "http://localhost:8000",
  agentId,
  apiKey,
  connectionId: randomUUID(),
  cursor: null,
  clientName: "ferri-preview",
  clientVersion: "0.1.0",
});

const session = "ferri-preview";
const requestId = `preview-${roomId.slice(0, 8)}`;

if (flag === "--close") {
  const v = await agent.closeCard(session, requestId);
  console.log(`closed ${requestId}: ${v.state}`);
} else {
  const v = await agent.openQuestionsCard(session, {
    request_id: requestId,
    turn_id: requestId,
    title: 'venue · meera asked in build-night: "is there a shuttle from the metro station?"',
    detail: null,
    questions: [
      {
        id: "answer",
        title: "Your answer",
        prompt:
          'Write the answer in quotes after the card code, for example A1 "Bike parking is in the basement". ' +
          "It goes to everyone who asked and is saved for next time.",
        options: [{ id: "skip", label: "Don't answer this one", description: null }],
        multi_select: false,
        allow_custom_answer: true,
      },
    ],
    room_id: roomId,
    thread_id: null,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  console.log(`opened ${requestId} in ${roomId}: ${v.state}`);
}
