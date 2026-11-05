import { describe, expect, it } from "vitest";
import { cardNotice, settledNotice, topicFor } from "./index.ts";

const card = { id: "1b2c3d4e-0000-4000-8000-000000000001", kind: "question" as const, question: "Is there a shuttle from the metro?", topic: "venue", waiting: 3, askerName: "Greenvalley19", roomName: "Telegram: Lantern Build Night", minutesOpen: 12 };

describe("push notices", () => {
  it("opens a question card with the asker and a link to the card", () => {
    const n = cardNotice("open", card);
    expect(n.title).toBe("New venue question");
    expect(n.body).toContain("Greenvalley19 in Telegram: Lantern Build Night");
    expect(n.url).toBe(`/m/c/${card.id}`);
    expect(n.renotify).toBe(true);
  });

  it("nudges and escalates with the waiting count", () => {
    expect(cardNotice("nudge", card).body).toContain("3 people are waiting · 12 min");
    expect(cardNotice("escalate", { ...card, waiting: 1 }).body).toContain("1 person is waiting");
  });

  it("replaces the notification quietly once settled", () => {
    const n = settledNotice(card, "answered", "Priya", 3);
    expect(n).toMatchObject({ kind: "settled", title: "Answered by Priya", tag: `card-${card.id}`, renotify: false });
    expect(n.body).toContain("reached 3 people");
    expect(settledNotice({ ...card, kind: "reply" }, "dismissed", "Rudra").title).toBe("Not sent · Rudra");
  });

  it("keeps the Topic header within 32 URL-safe characters", () => {
    expect(topicFor(`card-${card.id}`)).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });
});
