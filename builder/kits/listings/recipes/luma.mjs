/**
 * Luma (luma.com/create) in the Builder's browser, for any free account.
 * Learned from the live form on 2026-11-06: every control has an accessible
 * name, dates are typed ("Sat, Nov 21"), times are <input type=time>, the
 * location is a search box with a "Use "<text>"" option for an exact address,
 * the description is an editor in a dialog, and "Create Event" posts
 * `api.luma.com/event/create`, then lands on /event/manage/evt-....
 */
import { paragraphs } from "../scripts/listing-file.mjs";
import { hhmm, lumaDate } from "../scripts/when.mjs";

const pause = (page, ms = 300) => page.waitForTimeout(ms);

async function typeInto(page, box, text) {
  await box.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text, { delay: 10 });
  await page.keyboard.press("Escape");
  await pause(page, 200);
}

const cityOf = (tz) => tz.split("/").pop().replace(/_/g, " ");

export default {
  label: "Luma",
  home: "https://luma.com/home",
  createUrl: "https://luma.com/create",
  /** Requests that publish: fill blocks them, so only publish.mjs can create the event. */
  publishRequests: [/^https:\/\/api\d*\.(luma\.com|lu\.ma)\/event\/(create|update)/i],
  isCreatePage: (url) => /^https:\/\/(www\.)?(luma\.com|lu\.ma)\/create/i.test(url),

  async loggedIn(page) {
    const menu = await page.getByRole("button", { name: "Account Menu" }).count();
    const signIn = await page.getByRole("dialog", { name: /welcome to luma|sign in/i }).count();
    return menu > 0 && signIn === 0;
  },

  /** Fill the form from listing.json. Returns what was typed, field by field, for the caption. */
  async fill(page, l, h) {
    const typed = [];
    await page.getByRole("textbox", { name: "Event Name" }).waitFor({ timeout: 20_000 });

    if (l.calendar) {
      await page.getByRole("combobox", { name: "Choose Calendar" }).click();
      await page.getByRole("option", { name: l.calendar, exact: false }).first().click();
      typed.push(["Calendar", l.calendar]);
    }

    if (l.cover) {
      await page.locator('input[type="file"]').first().setInputFiles(h.cover);
      await page
        .waitForFunction(() => [...document.querySelectorAll("main img")].some((i) => /lumacdn\.com\/.*uploads\//.test(i.src)), null, { timeout: 30_000 })
        .catch(() => h.warn("The cover did not finish uploading in 30 s."));
      typed.push(["Cover", h.coverName]);
    }

    const vis = l.visibility === "private" ? "Private" : "Public";
    const visButton = page.getByRole("button", { name: /^(Public|Private)$/ }).first();
    if ((await visButton.innerText()).trim() !== vis) {
      await visButton.click();
      await page.getByRole("menuitemradio", { name: new RegExp(`^${vis}`) }).click();
      await pause(page);
    }
    typed.push(["Visibility", vis === "Private" ? "Private (only people with the link)" : "Public"]);

    await page.getByRole("textbox", { name: "Event Name" }).fill(l.name);
    typed.push(["Name", l.name]);

    await typeInto(page, page.getByRole("textbox", { name: "Start date" }), lumaDate(l.start));
    await page.getByRole("textbox", { name: "Start time" }).fill(hhmm(l.start));
    await page.keyboard.press("Escape");
    await typeInto(page, page.getByRole("textbox", { name: "End date" }), lumaDate(l.end));
    await page.getByRole("textbox", { name: "End time" }).fill(hhmm(l.end));
    await page.keyboard.press("Escape");
    await pause(page);
    typed.push(["Starts", `${lumaDate(l.start)}, ${hhmm(l.start)}`], ["Ends", `${lumaDate(l.end)}, ${hhmm(l.end)}`]);

    const city = cityOf(l.timezone);
    const tzButton = page.getByRole("button", { name: /^GMT[+-]\d/ }).first();
    if (!(await tzButton.innerText()).includes(city)) {
      await tzButton.click();
      await pause(page, 400);
      await page.keyboard.type(city, { delay: 20 });
      await pause(page, 600);
      const option = page.getByRole("option", { name: new RegExp(city, "i") }).first();
      if (await option.count()) await option.click();
      else {
        await page.keyboard.press("Escape");
        h.warn(`Luma did not offer the time zone ${l.timezone}; it shows ${(await tzButton.innerText()).replace(/\s+/g, " ")}.`);
      }
      await pause(page);
    }
    typed.push(["Time zone", (await tzButton.innerText()).replace(/\s+/g, " ").trim()]);

    if (l.venue || l.online) {
      const where = l.venue ?? l.online;
      await page.getByRole("button", { name: /^Add Event Location/ }).click();
      const box = page.getByRole("combobox", { name: "Event location" });
      await box.pressSequentially(where, { delay: 10 });
      // The exact text, never Google's nearest guess: the address is a fact from the documents.
      const exact = page.getByRole("option", { name: /^Use "/ });
      await exact.waitFor({ timeout: 10_000 }).catch(() => {});
      if (await exact.count()) await exact.first().click();
      else await page.keyboard.press("Enter");
      await pause(page, 500);
      typed.push([l.venue ? "Where" : "Online link", where]);
    }

    const paras = paragraphs(l.description);
    if (paras.length) {
      await page.getByRole("button", { name: /^(Add Description|Event Description)/ }).first().click();
      const dialog = page.getByRole("dialog", { name: "Event Description" });
      const editor = dialog.getByRole("textbox", { name: "Event Description" });
      await editor.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Delete");
      for (let i = 0; i < paras.length; i++) {
        if (i) await page.keyboard.press("Enter");
        await page.keyboard.type(paras[i], { delay: 5 });
      }
      await dialog.getByRole("button", { name: "Done" }).click();
      await pause(page, 400);
      typed.push(["Description", paras.join(" / ")]);
    }

    if (l.capacity) {
      await page.getByRole("button", { name: /^Capacity/ }).click();
      // The switch is a hidden checkbox under a slider: tick it through its label.
      const limit = page.getByRole("switch", { name: "Limit Event Capacity" });
      await limit.waitFor({ state: "attached", timeout: 10_000 });
      if (!(await limit.isChecked())) await page.locator('label[for="enable-cap"]').click();
      await page.waitForTimeout(400);
      await page.getByRole("spinbutton").first().fill(String(l.capacity));
      // Luma's waitlist past capacity is its own default; the documents decide nothing about it here.
      await page.getByRole("button", { name: "Confirm" }).click();
      await pause(page, 400);
      typed.push(["Capacity", String(l.capacity)]);
    }
    return typed;
  },

  /** What the form shows now: compared before the submit, so the yes covers exactly what was seen. */
  async readBack(page) {
    const text = async (loc) => ((await loc.count()) ? (await loc.first().innerText()).replace(/\s+/g, " ").trim() : null);
    const val = async (name) => {
      const box = page.getByRole("textbox", { name, exact: true });
      return (await box.count()) ? await box.first().inputValue() : null;
    };
    return {
      name: await val("Event Name"),
      startDate: await val("Start date"),
      startTime: await val("Start time"),
      endDate: await val("End date"),
      endTime: await val("End time"),
      timezone: await text(page.getByRole("button", { name: /^GMT[+-]\d/ })),
      where: await text(page.locator("main").getByRole("button", { name: /Remove Location/ })),
      description: await text(page.getByRole("button", { name: /^Event Description/ })),
      visibility: await text(page.getByRole("button", { name: /^(Public|Private)$/ })),
      capacity: await text(page.getByRole("button", { name: /^Capacity/ })),
      cover: await page
        .evaluate(() => [...document.querySelectorAll("main img")].map((i) => i.src).find((s) => /lumacdn\.com\/.*uploads\//.test(s)) ?? null)
        .catch(() => null),
    };
  },

  submitButton: (page) => page.locator("main").getByRole("button", { name: "Create Event", exact: true }),

  /** After the submit: Luma's manage page, then the public page's address. */
  async published(page) {
    await page.waitForURL(/\/event\/manage\/evt-/, { timeout: 45_000 });
    const manageUrl = page.url().split("?")[0];
    const id = /evt-[A-Za-z0-9]+/.exec(manageUrl)?.[0] ?? null;
    // The link points at /event/evt-... first and at the short /<slug> once the page has loaded.
    const link = page.getByRole("link", { name: "Event Page" }).first();
    let href = null;
    for (let i = 0; i < 30; i++) {
      href = await link.getAttribute("href", { timeout: 15_000 }).catch(() => href);
      if (href && /^\/[A-Za-z0-9-]{4,}$/.test(href)) break;
      await page.waitForTimeout(500);
    }
    const url = href ? new URL(href, "https://luma.com").href : null;
    return { url, manageUrl, id };
  },

  /** Cancel and delete a listing this kit made (Luma notifies its guests). */
  async takeDown(page, result) {
    await page.goto(`${result.manageUrl.replace(/\/$/, "")}/more`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Cancel Event", exact: true }).first().click();
    await page.getByRole("dialog", { name: "Cancel Event" }).getByRole("button", { name: "Cancel Event" }).click();
    await page.waitForURL((u) => !u.pathname.includes(result.id ?? "evt-"), { timeout: 30_000 });
  },
};
