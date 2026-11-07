/**
 * End-to-end smoke test of a running stack, through Mattermost like a person:
 *   1. meera asks "@ferri when does hacking start?" in ferri-lab: Ferri answers with the time and a source line.
 *   2. meera asks something the knowledge does not have: a question card opens in ferri-crew.
 *
 *   ./ferri smoke            (inside the stack; CI runs it after ./ferri up)
 *   pnpm smoke               (on the host, with MATTERMOST_URL or MATTERMOST_HOST_PORT)
 *
 * Exit 0 when both hold, 1 otherwise.
 */
const env = process.env;
const base = `${env.MATTERMOST_URL || `http://localhost:${env.MATTERMOST_HOST_PORT || "8065"}`}/api/v4`;
const team = env.MATTERMOST_TEAM_NAME || "switch";
const password = env.MM_TEST_PASSWORD;
const timeoutMs = Number(env.SMOKE_TIMEOUT_SECONDS ?? 120) * 1000;
if (!password) fail("MM_TEST_PASSWORD is not set (run ./ferri up first).");

interface Post {
  id: string;
  user_id: string;
  message: string;
  create_at: number;
  props?: Record<string, unknown>;
}

function fail(message: string): never {
  console.error(`smoke: FAIL: ${message}`);
  process.exit(1);
}

async function login(user: string, pw: string): Promise<string> {
  const res = await fetch(`${base}/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_id: user, password: pw }),
  });
  if (!res.ok) fail(`Mattermost login as ${user}: HTTP ${res.status}`);
  return res.headers.get("token")!;
}

const token = await login("meera", password!);
async function mm<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) fail(`${method} ${url}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

const me = await mm<{ id: string }>("GET", "/users/me");
const teamId = (await mm<{ id: string }>("GET", `/teams/name/${team}`)).id;
const lab = (await mm<{ id: string }>("GET", `/teams/${teamId}/channels/name/ferri-lab`)).id;
// meera is not in the crew room; read it as the crew member priya.
const priyaToken = await login("priya", password!);
const crewRes = await fetch(`${base}/teams/${teamId}/channels/name/ferri-crew`, { headers: { authorization: `Bearer ${priyaToken}` } });
if (!crewRes.ok) fail(`ferri-crew not found: HTTP ${crewRes.status}`);
const crew = ((await crewRes.json()) as { id: string }).id;

async function postsSince(channel: string, since: number, auth = token): Promise<Post[]> {
  const res = await fetch(`${base}/channels/${channel}/posts?since=${since}`, { headers: { authorization: `Bearer ${auth}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { order: string[]; posts: Record<string, Post> };
  return Object.values(data.posts).sort((a, b) => a.create_at - b.create_at);
}

async function waitFor<T>(what: string, find: () => Promise<T | undefined>): Promise<T> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const hit = await find();
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return fail(`no ${what} within ${timeoutMs / 1000} s`);
}

// 1. A question the knowledge answers.
const t1 = Date.now();
const asked = await mm<Post>("POST", "/posts", { channel_id: lab, message: "@ferri when does hacking start?" });
console.log("smoke: asked in ferri-lab: @ferri when does hacking start?");
const answer = await waitFor("answer from Ferri in ferri-lab", async () =>
  (await postsSince(lab, t1)).find((p) => p.id !== asked.id && p.user_id !== me.id && /source/i.test(p.message)),
);
console.log(`smoke: Ferri answered:\n  ${answer.message.replace(/\n/g, "\n  ")}`);
if (!/11(:00)?\s*AM/i.test(answer.message)) fail("the answer does not give the start time (11:00 AM)");

// 2. A question it cannot answer: a card in the crew room.
const t2 = Date.now();
await mm<Post>("POST", "/posts", { channel_id: lab, message: `@ferri can I bring my dog? (smoke ${t2})` });
console.log("smoke: asked in ferri-lab: @ferri can I bring my dog?");
const card = await waitFor("question card in ferri-crew", async () =>
  (await postsSince(crew, t2, priyaToken)).find((p) => /dog/i.test(JSON.stringify(p))),
);
console.log(`smoke: card in ferri-crew: ${card.message.split("\n")[0]?.slice(0, 120)}`);
console.log("smoke: PASS");
