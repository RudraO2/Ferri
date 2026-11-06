import type { KnowledgeItem, LiveKnowledge } from "./store.ts";

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export interface RenderedKnowledge {
  text: string;
  /** Short id shown to the model (K1, K2, ...) to the entry it stands for. */
  ids: Map<string, KnowledgeItem>;
}

/** The knowledge block of the prompt. Same input, same bytes: the cache depends on it. */
export function renderKnowledge(items: KnowledgeItem[]): RenderedKnowledge {
  const ids = new Map<string, KnowledgeItem>();
  const parts = items.map((item, i) => {
    const id = `K${i + 1}`;
    ids.set(id, item);
    const scope = item.eventName ?? "community";
    // Crew answers carry their date, so the newer one wins when entries disagree.
    const crew =
      item.sourceKind === "crew_answer" ? ` kind="crew answer" updated="${item.updatedAt.toISOString().slice(0, 10)}"` : "";
    return `<entry id="${id}" source="${escapeAttr(item.sourceTitle)}" section="${escapeAttr(item.heading)}" scope="${escapeAttr(scope)}"${crew}>\n${item.body}\n</entry>`;
  });
  return { text: `<knowledge>\n${parts.join("\n")}\n</knowledge>`, ids };
}

function formatDate(d: Date | null, timeZone: string): string | null {
  if (!d) return null;
  return d.toLocaleString("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" });
}

/** Community and event instructions, for orientation. Not a citable source. */
export function renderInstructions(kb: LiveKnowledge): string {
  const lines = [`<community name="${escapeAttr(kb.community.name)}">`, kb.community.instructions || "(no central instructions)", "</community>"];
  for (const e of kb.events) {
    const when = [formatDate(e.startsAt, kb.community.timezone), formatDate(e.endsAt, kb.community.timezone)]
      .filter(Boolean)
      .join(" to ");
    lines.push(
      `<event name="${escapeAttr(e.name)}" stage="${e.stage}"${when ? ` when="${escapeAttr(when)}"` : ""}${e.venue ? ` venue="${escapeAttr(e.venue)}"` : ""}>`,
      e.instructions || "(no event instructions)",
      "</event>",
    );
  }
  return lines.join("\n");
}

/**
 * The line Ferri adds under an answer, e.g.
 * "Source: Lantern Build Night FAQ (Food)" or
 * "Sources: Lantern Build Night FAQ (Food, Wi-Fi); Lantern Build Night schedule (Saturday 21 November)".
 */
export function formatSourceLine(items: KnowledgeItem[], label?: (many: boolean) => string): string {
  const bySource = new Map<string, string[]>();
  for (const item of items) {
    const headings = bySource.get(item.sourceTitle) ?? [];
    if (!headings.includes(item.heading)) headings.push(item.heading);
    bySource.set(item.sourceTitle, headings);
  }
  const parts = [...bySource].map(([title, headings]) =>
    headings.length === 1 && headings[0] === "Overview" ? title : `${title} (${headings.join(", ")})`,
  );
  if (parts.length === 0) return "";
  const many = parts.length > 1;
  return `${label ? label(many) : many ? "Sources" : "Source"}: ${parts.join("; ")}`;
}

/**
 * Build a safe `to_tsquery` string that ORs every word of every term.
 * Anything that is not a letter or digit is dropped, so user text can never
 * break the query syntax.
 */
export function buildTsQuery(terms: string[]): string {
  const words = new Set<string>();
  for (const term of terms) {
    for (const w of term.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w.length >= 2) words.add(w);
    }
  }
  return [...words].join(" | ");
}

/** The whole live knowledge base as one markdown document, for the Switch library. */
export function renderMirrorDocument(kb: LiveKnowledge): string {
  const out: string[] = [
    `# Ferri knowledge: ${kb.community.name}`,
    "",
    "This document is a read-only copy of Ferri's knowledge base. Edit the knowledge in Ferri; this copy updates itself.",
  ];
  const groups: { name: string; items: KnowledgeItem[] }[] = [
    { name: `${kb.community.name} (community)`, items: kb.entries.filter((e) => e.eventId === null) },
    ...kb.events.map((e) => ({ name: `${e.name} (${e.stage})`, items: kb.entries.filter((x) => x.eventId === e.id) })),
  ];
  for (const g of groups) {
    if (g.items.length === 0) continue;
    out.push("", `## ${g.name}`);
    let source = "";
    for (const item of g.items) {
      if (item.sourceTitle !== source) {
        source = item.sourceTitle;
        out.push("", `### ${source}`);
      }
      out.push("", `#### ${item.heading}`, "", item.body);
    }
  }
  return out.join("\n") + "\n";
}
