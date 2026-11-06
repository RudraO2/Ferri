import { describe, expect, it } from "vitest";
import { codeFrom, newPart, parseAddress, replyAddress, resend, signWebhook, textToHtml, verifyWebhook } from "./index.ts";

const SECRET = `whsec_${Buffer.from("a test secret of 24 bytes").toString("base64")}`;

describe("webhook signatures", () => {
  const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
  it("accepts Resend's own signature and refuses anything changed", () => {
    const h = signWebhook(body, SECRET, "msg_1", 1_800_000_000);
    const ok = { body, id: h["svix-id"]!, timestamp: h["svix-timestamp"]!, signature: h["svix-signature"]!, secret: SECRET, now: 1_800_000_000_000 };
    expect(verifyWebhook(ok)).toBe(true);
    expect(verifyWebhook({ ...ok, body: body.replace("e1", "e2") })).toBe(false);
    expect(verifyWebhook({ ...ok, secret: `whsec_${Buffer.from("another").toString("base64")}` })).toBe(false);
    expect(verifyWebhook({ ...ok, signature: null })).toBe(false);
  });
  it("refuses an old timestamp and takes any matching v1 signature in the list", () => {
    const h = signWebhook(body, SECRET, "msg_2", 1_800_000_000);
    expect(verifyWebhook({ body, id: "msg_2", timestamp: h["svix-timestamp"]!, signature: h["svix-signature"]!, secret: SECRET, now: 1_800_000_000_000 + 600_000 })).toBe(false);
    expect(
      verifyWebhook({ body, id: "msg_2", timestamp: h["svix-timestamp"]!, signature: `v1,AAAA ${h["svix-signature"]!}`, secret: SECRET, now: 1_800_000_000_000 }),
    ).toBe(true);
  });
});

describe("addresses", () => {
  it("parses names and addresses", () => {
    expect(parseAddress("Lantern Labs <Partners@RudraTechie.xyz>")).toEqual({ name: "Lantern Labs", email: "partners@rudratechie.xyz" });
    expect(parseAddress('"Asha K" <asha@cloudco.example>')).toEqual({ name: "Asha K", email: "asha@cloudco.example" });
    expect(parseAddress("asha@cloudco.example")).toEqual({ name: null, email: "asha@cloudco.example" });
    expect(parseAddress("not an address")).toBeNull();
  });
  it("puts the contact's code in the reply-to and reads it back", () => {
    const to = replyAddress("Lantern Labs <partners@rudratechie.xyz>", "c7f3a9");
    expect(to).toBe("partners+c7f3a9@rudratechie.xyz");
    expect(codeFrom(["someone@else.org", `Lantern <${to}>`], "partners@rudratechie.xyz")).toBe("c7f3a9");
    expect(codeFrom(["partners@rudratechie.xyz"], "partners@rudratechie.xyz")).toBeNull();
    expect(codeFrom(["partners+c7f3a9@other.org"], "partners@rudratechie.xyz")).toBeNull();
  });
});

describe("reply text", () => {
  it("keeps only the new part of a reply", () => {
    const text = "Hi Rudra,\n\nYes, we'd love to sponsor. Can we talk Monday?\n\nAsha\n\nOn Fri, 6 Nov 2026 at 17:02, Lantern Labs <partners+c1@rudratechie.xyz> wrote:\n> Hello Asha,\n> We are running Build Night";
    expect(newPart(text)).toBe("Hi Rudra,\n\nYes, we'd love to sponsor. Can we talk Monday?\n\nAsha");
    expect(newPart("no thanks\n\n-----Original Message-----\nFrom: x")).toBe("no thanks");
    expect(newPart("Sure.\nOn Fri, 6 Nov 2026 at 17:02, Lantern Labs <p@x.y>\nwrote:\n> hi")).toBe("Sure.");
  });
  it("turns text into safe HTML with links", () => {
    expect(textToHtml("Hi <b>Asha</b>,\n\nSee https://lantern-build-night.vercel.app")).toBe(
      '<p>Hi &lt;b&gt;Asha&lt;/b&gt;,</p>\n<p>See <a href="https://lantern-build-night.vercel.app">https://lantern-build-night.vercel.app</a></p>',
    );
  });
});

describe("the Resend client", () => {
  it("sends with the idempotency key and the reply-to, and reports errors", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/emails")) return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    }) as unknown as typeof fetch;
    const r = resend({ apiKey: "re_test", fetch: fake });
    expect(await r.send({ from: "a@x.org", to: "b@y.org", subject: "Hi", text: "Hello", replyTo: "a+c1@x.org", idempotencyKey: "msg-1" })).toEqual({ id: "em_1" });
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toEqual({ from: "a@x.org", to: "b@y.org", subject: "Hi", text: "Hello", reply_to: "a+c1@x.org" });
    expect((calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("msg-1");
    await expect(r.received("nope")).rejects.toThrow(/404 Not found/);
  });
});
