/**
 * Any platform without its own recipe: the Builder writes `form.json` in the
 * job folder after `listing.mjs inspect --url <create page>`, and this fills
 * it. Values may use {{field}} from listing.json ({{name}}, {{venue}},
 * {{description}}, {{url}}, {{startDate}}, {{startTime}}, {{endDate}},
 * {{endTime}}, {{capacity}}).
 *
 * form.json:
 * {
 *   "label": "Commudle",
 *   "createUrl": "https://...",
 *   "loggedIn": { "role": "button", "name": "Profile" }   or { "text": "Sign out" },
 *   "fields": [
 *     { "label": "Event title", "value": "{{name}}" },
 *     { "label": "Start date", "value": "{{startDate}}", "how": "type" },
 *     { "role": "combobox", "name": "Mode", "value": "Offline", "how": "select" },
 *     { "label": "Banner", "file": "cover", "how": "upload" },
 *     { "role": "checkbox", "name": "Free event", "how": "check" },
 *     { "role": "button", "name": "Next", "how": "click" }
 *   ],
 *   "submit": { "role": "button", "name": "Publish" },
 *   "published": { "urlPattern": "/events/[a-z0-9-]+$" }
 * }
 *
 * "how": fill (default), type (key by key, for date boxes), select, check,
 * upload, click (never a publish button: the guard refuses those).
 */
import fs from "node:fs";
import path from "node:path";
import { PUBLISH_WORDS } from "../scripts/lib.mjs";
import { paragraphs } from "../scripts/listing-file.mjs";

let form = null;
const load = (dir) => {
  if (form) return form;
  const f = path.join(dir, "form.json");
  if (!fs.existsSync(f)) throw new Error("No form.json in the job folder: run listing.mjs inspect --url <the create page> and write it.");
  form = JSON.parse(fs.readFileSync(f, "utf8"));
  // https only; plain http just for a test page on this machine.
  if (!form.createUrl || !/^(https:\/\/|http:\/\/127\.0\.0\.1[:/])/.test(form.createUrl)) throw new Error('form.json needs "createUrl" (https://...).');
  if (!form.submit?.name) throw new Error('form.json needs "submit" with the publish button\'s name.');
  return form;
};

const locate = (page, spec) => {
  if (spec.label) return page.getByLabel(spec.label, { exact: spec.exact ?? false }).first();
  if (spec.placeholder) return page.getByPlaceholder(spec.placeholder).first();
  if (spec.role) return page.getByRole(spec.role, { name: spec.name, exact: spec.exact ?? false }).first();
  if (spec.text) return page.getByText(spec.text, { exact: spec.exact ?? false }).first();
  throw new Error(`A form.json entry needs label, placeholder, role or text: ${JSON.stringify(spec)}`);
};

function values(l) {
  const [sd, st] = String(l.start).split("T");
  const [ed, et] = String(l.end).split("T");
  return {
    ...l,
    description: paragraphs(l.description).join("\n\n"),
    startDate: sd,
    startTime: st,
    endDate: ed,
    endTime: et,
    capacity: l.capacity == null ? "" : String(l.capacity),
  };
}
const fillIn = (s, v) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] == null ? "" : String(v[k])));

export default {
  label: "the platform",
  publishRequests: [],
  createUrl: (_l, h) => load(h.jobDir).createUrl,
  isCreatePage: null,

  async loggedIn(page) {
    const f = form;
    if (!f?.loggedIn) return true;
    return (await locate(page, f.loggedIn).count()) > 0;
  },

  /** Called by listing.mjs and publish.mjs before anything else: reads form.json. */
  prepare(h) {
    const f = load(h.jobDir);
    this.label = f.label ?? new URL(f.createUrl).hostname;
    const start = new URL(f.createUrl);
    this.isCreatePage = (u) => {
      try {
        return new URL(u).hostname === start.hostname;
      } catch {
        return false;
      }
    };
  },

  async fill(page, l, h) {
    const f = load(h.jobDir);
    const v = values(l);
    const typed = [];
    for (const spec of f.fields ?? []) {
      const el = locate(page, spec);
      const how = spec.how ?? (spec.file ? "upload" : "fill");
      const label = spec.label ?? spec.name ?? spec.placeholder ?? spec.text;
      if (how === "click") {
        const name = (spec.name ?? spec.text ?? spec.label ?? "").trim();
        if (PUBLISH_WORDS.test(name)) throw new Error(`form.json asks fill to click "${name}", which publishes. Only publish.mjs submits.`);
        await el.click();
      } else if (how === "upload") {
        const file = spec.file === "cover" ? h.cover : path.resolve(h.jobDir, spec.file);
        if (!file) continue;
        await el.setInputFiles(file);
        typed.push([label, path.basename(file)]);
      } else if (how === "check") {
        await el.check();
        typed.push([label, "ticked"]);
      } else if (how === "select") {
        const value = fillIn(spec.value, v);
        await el.selectOption({ label: value }).catch(async () => {
          await el.click();
          await page.getByRole("option", { name: value }).first().click();
        });
        typed.push([label, value]);
      } else {
        const value = fillIn(spec.value, v);
        if (how === "type") {
          await el.click();
          await page.keyboard.press("Control+A");
          await page.keyboard.type(value, { delay: 15 });
        } else await el.fill(value);
        typed.push([label, value]);
      }
      await page.waitForTimeout(spec.wait ?? 250);
    }
    return typed;
  },

  async readBack(page) {
    const f = form;
    const out = {};
    for (const spec of f?.fields ?? []) {
      const how = spec.how ?? (spec.file ? "upload" : "fill");
      if (!["fill", "type", "select"].includes(how)) continue;
      const el = locate(page, spec);
      out[spec.label ?? spec.name ?? spec.placeholder] = await el.inputValue().catch(async () => (await el.innerText().catch(() => null))?.trim() ?? null);
    }
    return out;
  },

  submitButton: (page) => locate(page, { role: form.submit.role ?? "button", name: form.submit.name, exact: form.submit.exact ?? true }),

  async published(page) {
    const re = form.published?.urlPattern ? new RegExp(form.published.urlPattern) : null;
    if (re) await page.waitForURL(re, { timeout: 60_000 });
    else await page.waitForLoadState("networkidle", { timeout: 60_000 });
    return { url: page.url().split("?")[0], manageUrl: page.url(), id: null };
  },
};
