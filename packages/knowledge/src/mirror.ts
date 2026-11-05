import { getState, setState, type Db } from "@ferri/db";
import { GatewayClient, GatewayError } from "@ferri/switch";
import { renderMirrorDocument } from "./render.ts";
import type { LiveKnowledge } from "./store.ts";

/** Switch caps a library document at 1 MiB (ROOM_DOCUMENT_MAX_CONTENT_BYTES). */
const MAX_BYTES = 1_048_576;

export interface MirrorResult {
  documentId: string;
  created: boolean;
  bytes: number;
  attached: string[];
}

interface DocumentDetail {
  id: string;
}

/**
 * Copy the live knowledge base into one Switch library document and attach it
 * to the given rooms. Read only in Switch: our tables stay the source of truth.
 */
export async function mirrorToSwitch(opts: {
  db: Db;
  gateway: GatewayClient;
  kb: LiveKnowledge;
  roomIds: string[];
}): Promise<MirrorResult> {
  const content = renderMirrorDocument(opts.kb);
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_BYTES) throw new Error(`knowledge mirror is ${bytes} bytes; Switch allows ${MAX_BYTES}`);

  const stateKey = `switch_library_document:${opts.kb.community.slug}`;
  const fields = {
    name: `Ferri knowledge: ${opts.kb.community.name}`,
    description: `Read-only copy of Ferri's knowledge base for ${opts.kb.community.name}.`,
    instructions: "Reference material for the community and its events. Maintained by Ferri; do not edit here.",
    content,
  };

  let documentId = (await getState<{ id: string }>(opts.db, stateKey))?.id;
  if (!documentId) {
    // The database was reset but Switch kept the document: adopt it by name.
    const all = await opts.gateway.call<unknown>("GET", "/gateway/documents");
    const list = (Array.isArray(all) ? all : ((all as { documents?: unknown[] }).documents ?? [])) as {
      id: string;
      name: string;
    }[];
    documentId = list.find((d) => d.name === fields.name)?.id;
    if (documentId) await setState(opts.db, stateKey, { id: documentId });
  }
  let created = false;
  if (documentId) {
    try {
      await opts.gateway.call<DocumentDetail>("PATCH", `/gateway/documents/${documentId}`, fields);
    } catch (err) {
      // Deleted in Switch: make a new one.
      if (!(err instanceof GatewayError && (err.status === 404 || err.status === 403))) throw err;
      documentId = undefined;
    }
  }
  if (!documentId) {
    const doc = await opts.gateway.call<DocumentDetail>("POST", "/gateway/documents", {
      ...fields,
      read_visibility: "public",
      write_visibility: "private",
    });
    documentId = doc.id;
    created = true;
    await setState(opts.db, stateKey, { id: documentId });
  }

  const attached: string[] = [];
  for (const roomId of opts.roomIds) {
    const current = await opts.gateway.call<unknown>("GET", `/gateway/rooms/${roomId}/documents`);
    const list: { id?: string; document_id?: string }[] = Array.isArray(current)
      ? current
      : ((current as { documents?: [] }).documents ?? []);
    if (!list.some((d) => (d.id ?? d.document_id) === documentId)) {
      await opts.gateway.call("POST", `/gateway/rooms/${roomId}/documents/${documentId}`);
    }
    attached.push(roomId);
  }
  return { documentId, created, bytes, attached };
}
