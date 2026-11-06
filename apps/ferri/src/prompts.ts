import type { Db } from "@ferri/db";
import { loadCommunitySkills, settingsFor, voiceBlock, type FerriSettings } from "@ferri/knowledge";
import { config } from "./config.ts";

/** Where a prompt is for: the community, the event, and the space (a desk, a Hindi WhatsApp group). */
export interface PromptScope {
  communityId: string;
  eventId: string | null;
  spaceId: string | null;
}

/** The base settings from the environment (tests and older env switches still win over the defaults). */
export function envSettings(): Partial<FerriSettings> {
  return {
    stepInSeconds: Math.round(config.roomGraceMs / 1000),
    guestDailyCap: config.guestDailyCap,
  };
}

/**
 * The stable head of every answer prompt for one place (specs 20 and 21):
 * the persona and the answer rules as the community edited them, the desk
 * skill when the space is a desk, then the crew's tone and language.
 * Read on every use, so an edit applies without a restart.
 */
export function createPrompts(deps: { db: Db }) {
  const { db } = deps;
  let deskSkill: (spaceId: string) => Promise<string | null> = async () => null;

  async function settings(scope: PromptScope): Promise<FerriSettings> {
    return settingsFor(db, scope, envSettings());
  }

  async function skillsFor(scope: PromptScope): Promise<string> {
    const parts = [await loadCommunitySkills(db, config.skillsDir, scope.communityId)];
    if (scope.spaceId) {
      const desk = await deskSkill(scope.spaceId).catch(() => null);
      if (desk) parts.push(desk);
    }
    const voice = voiceBlock(await settings(scope));
    if (voice) parts.push(voice);
    return parts.join("\n\n");
  }

  return {
    skillsFor,
    settings,
    /** Desks (spec 20) tell the prompts which skill a desk space runs. */
    setDeskSkill(fn: (spaceId: string) => Promise<string | null>) {
      deskSkill = fn;
    },
  };
}

export type Prompts = ReturnType<typeof createPrompts>;
