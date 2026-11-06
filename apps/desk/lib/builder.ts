import "server-only";
import { builderName } from "./ferri";
import { gatewayAs, type DeskUser } from "./session";

/** Ferri Builder as Switch's agent management shows it to its owner. */
export interface ManagedBuilder {
  agent_id: string;
  name: string;
  display_name: string | null;
  controller_name: string | null;
  controller_state: string | null;
  desired_state: string;
  definition: { model: string | null; directory: string | null; advanced_config: Record<string, unknown>; auto_mode: boolean; auto_approve: boolean };
  status: { process?: string; sessions?: { active?: number }; since?: string; directory?: string } | null;
}

export interface Budget {
  id: string;
  agent_id: string | null;
  metric: string;
  amount_limit: number;
  period_hours: number;
  spent: number;
  resets_at: string;
  exhausted: boolean;
}

/** One open request card of an agent the signed-in person owns (Switch's own approval and question cards). */
export interface OpenRequest {
  agentId: string;
  sessionId: string;
  requestId: string;
  kind: "approval" | "questions";
  roomId: string | null;
  title: string;
  detail: string | null;
  options: { id: string; label: string; decision: string }[];
  questions: { id: string; title: string; prompt: string; options: { id: string; label: string; description: string | null }[]; allowCustomAnswer: boolean }[];
  state: string;
  expiresAt: string | null;
}

export interface BuilderView {
  agent: ManagedBuilder | null;
  machine: { name: string; state: string; providers: { provider: string; installed: boolean; auth?: string; version?: string | null }[] } | null;
  budgets: Budget[];
  requests: OpenRequest[];
  error: string | null;
}

interface Controller {
  id: string;
  name: string;
  state: string;
  status: { providers?: { provider: string; installed: boolean; auth?: string; version?: string | null }[] } | null;
}

/** Everything Switch knows about the Builder, read as the signed-in person (its owner sees all of it). */
export async function builderView(user: DeskUser): Promise<BuilderView> {
  const gw = gatewayAs(user);
  const name = builderName();
  try {
    const agents = await gw.call<ManagedBuilder[]>("GET", "/gateway/management/agents");
    const agent = agents.find((a) => a.name === name) ?? null;
    const [controllers, requests, budgets] = await Promise.all([
      gw.call<Controller[]>("GET", "/gateway/management/controllers").catch(() => [] as Controller[]),
      gw.call<OpenRequest[]>("GET", "/gateway/agent-sessions/approvals").catch(() => [] as OpenRequest[]),
      gw
        .call<{ id: string }>("GET", "/gateway/tenants/current")
        .then((t) => gw.call<Budget[]>("GET", `/gateway/tenants/${t.id}/budgets`))
        .catch(() => [] as Budget[]),
    ]);
    const c = agent ? controllers.find((x) => x.name === agent.controller_name) : undefined;
    return {
      agent,
      machine: c ? { name: c.name, state: c.state, providers: c.status?.providers ?? [] } : null,
      budgets: agent ? budgets.filter((b) => b.agent_id === agent.agent_id || b.agent_id === null) : [],
      requests: agent ? requests.filter((r) => r.agentId === agent.agent_id && r.state === "open") : [],
      error: null,
    };
  } catch (err) {
    const msg = (err as Error).message;
    return {
      agent: null,
      machine: null,
      budgets: [],
      requests: [],
      error: msg.includes("401") ? "Your Switch session ended. Sign in again." : msg.includes("404") ? "Agent management is off on this Switch server (feature flag agent_management)." : msg.slice(0, 200),
    };
  }
}

/** The Builder's open request cards (for Pocket's Needs you). Empty when Switch cannot be read. */
export async function builderRequests(user: DeskUser): Promise<OpenRequest[]> {
  return (await builderView(user)).requests;
}

/**
 * Answer one of the Builder's cards as the signed-in person. Switch records
 * them as the answerer, edits the card in the room, and hands the answer to
 * the Builder's session.
 */
export async function answerRequest(
  user: DeskUser,
  r: { agentId: string; sessionId: string; requestId: string },
  body: { answer: string } | { answers: { question_id: string; selected_option_ids: string[]; custom_text: string | null }[] },
): Promise<{ ok: boolean; note: string }> {
  try {
    await gatewayAs(user).call(
      "POST",
      `/gateway/agent-sessions/${encodeURIComponent(r.agentId)}/${encodeURIComponent(r.sessionId)}/approvals/${encodeURIComponent(r.requestId)}/answer`,
      body,
    );
    return { ok: true, note: "Sent to the Builder." };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, note: msg.includes("401") ? "Your Switch session ended. Sign in again." : msg.includes("409") ? "That card is already answered." : `Switch refused it: ${msg.slice(0, 200)}` };
  }
}

export const metricLabel = (m: string) => ({ output_tokens: "output tokens", input_tokens: "input tokens", turns: "turns", messages: "messages", cache_read_tokens: "cache reads", cache_write_tokens: "cache writes" })[m] ?? m.replace(/_/g, " ");
