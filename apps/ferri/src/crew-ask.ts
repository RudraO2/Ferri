import type { CrewIntent, CrewMember } from "@ferri/knowledge";

/** A crew member asked Ferri for something (specs 19 to 21 share this shape). */
export interface CrewAsk {
  communityId: string;
  /** The live event of the room it was said in (null: community level). */
  eventId: string | null;
  member: CrewMember;
  /** The crew message, so a replay acts once (already claimed in crew_actions by the flow). */
  messageId: string;
  /** The event's crew room, where cards go (null when the event has none). */
  crewRoomId: string | null;
  /** Where it was said (the crew room, a desk, a members space). */
  roomId: string;
  /** The message without the @mention. */
  body: string;
  intent: CrewIntent;
}
