#!/usr/bin/env node
/**
 * The page check's own test. It serves example/ on a local port, runs
 * shots.mjs on the two example pages and on example/index.html as a file,
 * and checks that the clean page passes in light and dark and that every
 * problem planted in example/broken.html is found.
 *
 *   node scripts/check.mjs     exit 0 when every check passes, 1 when one fails, 3 when no browser is installed
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const KIT = path.resolve(import.meta.dirname, "..");
const example = path.join(KIT, "example");
const shots = path.join(KIT, "scripts", "shots.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ferri-page-check-"));

const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(example, path.normalize(name));
  if (!file.startsWith(example + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml" }[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Async on purpose: this process keeps serving the pages while shots.mjs runs.
function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [shots, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    child.on("exit", (code) => resolve({ code, text }));
  });
}

const failures = [];
const expect = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};
const isJpeg = (f) => {
  const b = fs.readFileSync(f);
  return b.length > 1000 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
};

try {
  const outA = path.join(tmp, "served");
  const a = await run(["--url", base, "--pages", "/index.html,/broken.html", "--out", outA]);
  if (a.code === 3) {
    console.log(a.text.trim());
    process.exitCode = 3;
  } else {
    expect(a.code === 4, `served pages: exit 4 for the planted problems (got ${a.code})`);
    const report = JSON.parse(fs.readFileSync(path.join(outA, "report.json"), "utf8"));
    const [clean, broken] = report.pages;
    const problems = (page, vp) => page?.viewports?.[vp]?.problems ?? [];
    expect(clean?.status === 200 && broken?.status === 200, "both pages answer HTTP 200");
    expect(problems(clean, "desktop").length === 0 && problems(clean, "phone").length === 0, `the clean page has no problems (${[...problems(clean, "desktop"), ...problems(clean, "phone")].join("; ") || "none"})`);
    expect(clean?.darkScheme === true, "the clean page's dark scheme is noticed");
    expect(broken?.darkScheme === false, "the broken page has one colour scheme");
    for (const f of ["index-desktop-light.jpg", "index-phone-light.jpg", "index-desktop-dark.jpg", "index-phone-dark.jpg", "broken-desktop-light.jpg", "broken-phone-light.jpg"]) {
      expect(fs.existsSync(path.join(outA, f)) && isJpeg(path.join(outA, f)), `screenshot ${f}`);
    }
    expect(!fs.existsSync(path.join(outA, "broken-phone-dark.jpg")), "no dark screenshot for a page without a dark scheme");
    const phone = problems(broken, "phone").join("\n");
    const desktop = problems(broken, "desktop").join("\n");
    expect(/scrolls sideways .*div\.banner/.test(phone), "sideways scrolling at 390 px, caused by div.banner");
    expect(!/scrolls sideways/.test(desktop), "no sideways scrolling at desktop width");
    expect(/console error: planted console error/.test(phone), "the console error");
    expect(/uncaught error: .*planted exception/.test(phone), "the uncaught exception");
    expect(/request failed: 404 .*missing\.png/.test(phone), "the failed request for missing.png");
    expect(/broken image: .*missing\.png/.test(phone), "the broken image");
    expect(/image without alt text/.test(phone), "the image without alt text");
    expect(/animations keep running with reduced motion on/.test(phone), "the animation that ignores reduced motion");
    expect((broken?.placeholders ?? []).includes("[venue address]"), "the [venue address] placeholder");
    expect(report.post.join(",") === "index-desktop-light.jpg,index-phone-light.jpg,index-phone-dark.jpg", `screenshots for the room (${report.post.join(", ")})`);

    const outB = path.join(tmp, "file");
    const b = await run(["--file", path.join(example, "index.html"), "--out", outB]);
    expect(b.code === 0, `a page as a file: exit 0 (got ${b.code})`);
    const fileReport = JSON.parse(fs.readFileSync(path.join(outB, "report.json"), "utf8"));
    expect(fileReport.pages.length === 1 && fileReport.problems === 0 && fileReport.pages[0].darkScheme === true, "the file check has one page, no problems, light and dark");
    if (failures.length) console.log(`\n${a.text.trim()}`);
    console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\npage-check: every check passed.");
    process.exitCode = failures.length ? 1 : 0;
  }
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
