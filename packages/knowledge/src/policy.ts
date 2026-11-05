/**
 * What Ferri may do with one message, from where it was said and by whom.
 * One pure function so every rule (Off, pause, mute, modes, crew room) is in
 * one place and tested on its own.
 */

export type SpaceMode = "listen" | "approve" | "auto";
export type SpaceRole = "members" | "crew";

export interface SpaceSetting {
  mode: SpaceMode;
  role: SpaceRole;
}

/**
 * How a reply may leave Ferri:
 * - auto: post it (answers with a source; holding reply and a card when unknown);
 * - approve: put it on a reply card for an organizer, post nothing yet;
 * - listen: never post; log what was heard;
 * - paused: the master pause is on; post nothing anywhere.
 */
export type Posting = "auto" | "approve" | "listen" | "paused";

/**
 * - crew: a crew member talking to Ferri (answer a card, teach a fact, ask);
 * - direct: someone mentioned Ferri, or wrote in a direct chat;
 * - follow_up: Switch marked it addressed without a mention (a follow-up);
 * - room: said to the room; triage decides whether it is a question.
 */
export type Route = "crew" | "direct" | "follow_up" | "room";

export type Decision =
  | { act: "ignore"; reason: string }
  | { act: Route; posting: Posting; crewRoom: boolean };

export interface DecisionInput {
  /** The space's attachment to a live event; null means Off. */
  attached: SpaceSetting | null;
  archived: boolean;
  muted: boolean;
  paused: boolean;
  fromCrew: boolean;
  /** Switch's `addressed` flag (a mention, a direct chat, or a follow-up). */
  addressed: boolean;
  /** A real @mention of Ferri, or a direct chat. */
  mentioned: boolean;
}

export function decideAction(i: DecisionInput): Decision {
  if (i.archived) return { act: "ignore", reason: "space archived" };
  if (!i.attached) return { act: "ignore", reason: "space is off (not attached to an event)" };
  if (i.muted) return { act: "ignore", reason: "sender is muted" };

  const crewRoom = i.attached.role === "crew";
  // The crew room is always "auto" for the crew: it is where they work with Ferri.
  const posting: Posting = i.paused ? "paused" : crewRoom ? "auto" : i.attached.mode;

  if (i.fromCrew && i.addressed && (i.mentioned || crewRoom)) return { act: "crew", posting, crewRoom };
  if (i.addressed && i.mentioned) return { act: "direct", posting, crewRoom };
  if (crewRoom) return { act: "ignore", reason: "crew chatter" };
  if (i.addressed) return { act: "follow_up", posting, crewRoom };
  return { act: "room", posting, crewRoom };
}

/** Whether Ferri may post into the space a message came from. */
export function mayPost(posting: Posting): boolean {
  return posting === "auto";
}
