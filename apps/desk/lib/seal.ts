import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** The session cookie's contents. No other imports, so the proxy can read it too. */
export interface DeskUser {
  /** Switch user id. */
  uid: string;
  email: string;
  name: string;
  /** The Switch Gateway session cookie. */
  gw: string;
  exp: number;
  /** A guest looking around the public demo: pages open, every change is refused. */
  readonly?: boolean;
}

function key(): Buffer {
  const secret = process.env.DESK_SESSION_SECRET || process.env.FERRI_AGENT_KEY;
  if (!secret) throw new Error("Set DESK_SESSION_SECRET in .env (run `./ferri up`).");
  return createHash("sha256").update(`ferri-desk-session:${secret}`).digest();
}

export function seal(user: DeskUser): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(user), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal(token: string | undefined): DeskUser | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const user = JSON.parse(json) as DeskUser;
    return user.exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}
