import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { CARD_QUESTION_ID, CARD_SKIP_OPTION, cards } from "./ferri";
import { gatewayAs, type DeskUser } from "./session";

/** The reply-card option Ferri reads as "send the draft as it is". */
export const REPLY_SEND_OPTION = "send";

export type CardAnswer = { selected: string[]; text: string | null };

/**
 * Answer a card through Switch as the signed-in person (Desk and Pocket).
 * Switch records them as the answerer and reports the outcome to Ferri, which
 * then delivers it. Returns a note for the person: what happened.
 */
export async function answerAs(user: DeskUser, cardId: string, a: CardAnswer): Promise<{ ok: boolean; note: string }> {
  const [card] = await db().select().from(cards).where(and(eq(cards.id, cardId), eq(cards.status, "open"))).limit(1);
  if (!card) return { ok: false, note: "That card is no longer open. Someone may have answered it first." };
  const agentId = process.env.FERRI_AGENT_ID;
  if (!agentId) return { ok: false, note: "FERRI_AGENT_ID is not set." };
  try {
    await gatewayAs(user).answerCard(agentId, card.switchSessionId, card.id, [
      { question_id: CARD_QUESTION_ID, selected_option_ids: a.selected, custom_text: a.text },
    ]);
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, note: msg.includes("401") ? "Your Switch session ended. Sign in again." : `Switch refused it: ${msg.slice(0, 200)}` };
  }
  return { ok: true, note: "Sent to Ferri. It goes out in a moment." };
}

export const skip: CardAnswer = { selected: [CARD_SKIP_OPTION], text: null };

/** A reply card: unchanged (or empty) text sends Ferri's draft, anything else sends the organizer's version. */
export async function replyAnswer(cardId: string, text: string): Promise<CardAnswer> {
  const [card] = await db().select({ draft: cards.draftText }).from(cards).where(eq(cards.id, cardId)).limit(1);
  const unchanged = !text || text === (card?.draft ?? "").trim();
  return unchanged ? { selected: [REPLY_SEND_OPTION], text: null } : { selected: [], text };
}
