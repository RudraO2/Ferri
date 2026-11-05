import YAML from "yaml";

export interface KnowledgeSection {
  /** Unique inside the file; becomes the `#fragment` of the entry key. */
  slug: string;
  heading: string;
  body: string;
  position: number;
}

export interface KnowledgeFile {
  title: string;
  tags: string[];
  sections: KnowledgeSection[];
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ऀ-ॿ]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Split a markdown file into knowledge sections:
 * frontmatter (`title`, `tags`) is optional; a leading `# Title` names the file
 * when frontmatter does not; text before the first `##` becomes "Overview";
 * every `##` section becomes one entry. Deeper headings stay inside their section.
 */
export function parseKnowledgeMarkdown(fileName: string, source: string): KnowledgeFile {
  let text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let meta: { title?: unknown; tags?: unknown } = {};

  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    const parsed = YAML.parse(fm[1]!) as unknown;
    if (parsed && typeof parsed === "object") meta = parsed as typeof meta;
    text = text.slice(fm[0].length);
  }

  let title = typeof meta.title === "string" ? meta.title.trim() : "";
  const lines = text.split("\n");

  // A leading H1 is the title (and is not part of any section).
  const firstContent = lines.findIndex((l) => l.trim() !== "");
  if (firstContent >= 0) {
    const h1 = /^#\s+(.+?)\s*#*\s*$/.exec(lines[firstContent]!);
    if (h1) {
      if (!title) title = h1[1]!;
      lines.splice(firstContent, 1);
    }
  }
  if (!title) title = titleFromFileName(fileName);

  const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];

  const raw: { heading: string; lines: string[] }[] = [{ heading: "Overview", lines: [] }];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h2 = inFence ? null : /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h2) raw.push({ heading: h2[1]!, lines: [] });
    else raw[raw.length - 1]!.lines.push(line);
  }

  const used = new Map<string, number>();
  const sections: KnowledgeSection[] = [];
  for (const r of raw) {
    const body = r.lines.join("\n").trim();
    if (!body) continue;
    const base = slugify(r.heading);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    sections.push({
      slug: n === 1 ? base : `${base}-${n}`,
      heading: r.heading,
      body,
      position: sections.length,
    });
  }
  return { title, tags, sections };
}
