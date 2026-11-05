import { describe, expect, it } from "vitest";
import { parseKnowledgeMarkdown, slugify } from "./markdown.ts";

describe("parseKnowledgeMarkdown", () => {
  it("uses frontmatter title and tags, and splits on ## headings", () => {
    const f = parseKnowledgeMarkdown(
      "faq.md",
      "---\ntitle: Build Night FAQ\ntags: [faq, food]\n---\n## Food\nLunch at 1:30.\n\n## Wi-Fi\nNetwork X.\n",
    );
    expect(f.title).toBe("Build Night FAQ");
    expect(f.tags).toEqual(["faq", "food"]);
    expect(f.sections.map((s) => [s.slug, s.heading, s.body, s.position])).toEqual([
      ["food", "Food", "Lunch at 1:30.", 0],
      ["wi-fi", "Wi-Fi", "Network X.", 1],
    ]);
  });

  it("takes the title from a leading H1, keeps intro text as Overview, and keeps ### inside a section", () => {
    const f = parseKnowledgeMarkdown("about.md", "\n# About Us\n\nWe build.\n\n## Contact\nMail us.\n### Hours\n9 to 5\n");
    expect(f.title).toBe("About Us");
    expect(f.sections[0]).toMatchObject({ slug: "overview", heading: "Overview", body: "We build." });
    expect(f.sections[1]).toMatchObject({ slug: "contact", body: "Mail us.\n### Hours\n9 to 5" });
  });

  it("falls back to the file name, skips empty sections, numbers duplicate headings, ignores ## in code fences", () => {
    const f = parseKnowledgeMarkdown(
      "venue-guide.md",
      "## Notes\none\n## Empty\n\n## Notes\ntwo\n```\n## not a heading\n```\n",
    );
    expect(f.title).toBe("Venue guide");
    expect(f.sections.map((s) => s.slug)).toEqual(["notes", "notes-2"]);
    expect(f.sections[1]!.body).toContain("## not a heading");
  });

  it("handles CRLF and a BOM", () => {
    const f = parseKnowledgeMarkdown("x.md", "﻿## A\r\nbody\r\n");
    expect(f.sections).toEqual([{ slug: "a", heading: "A", body: "body", position: 0 }]);
  });
});

describe("slugify", () => {
  it("makes stable ascii slugs and keeps Devanagari", () => {
    expect(slugify("Saturday 21 November")).toBe("saturday-21-november");
    expect(slugify("Café & Wi-Fi!")).toBe("cafe-wi-fi");
    expect(slugify("खाना")).not.toBe("section");
    expect(slugify("!!!")).toBe("section");
  });
});
