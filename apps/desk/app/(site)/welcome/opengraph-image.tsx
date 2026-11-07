import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Ferri, a friendly sea otter. Run the event. Ferri runs the group chats.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function png(name: string): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "brand", "src", name));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

async function font(name: string): Promise<ArrayBuffer | null> {
  try {
    const b = await readFile(path.join(process.cwd(), "app", "(site)", "welcome", "og-fonts", name));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

/** The landing page's share card: the headline, the apps, and Ferri. Fonts are the brand's (OFL). */
export default async function OpenGraphImage() {
  const [ferri, face, display, serif, body] = await Promise.all([png("ferri-main.png"), png("ferri-face.png"), font("bricolage-800.woff"), font("serif-italic.woff"), font("inter-500.woff")]);
  const fonts = [
    display && { name: "Bricolage", data: display, weight: 800 as const, style: "normal" as const },
    serif && { name: "Instrument Serif", data: serif, weight: 400 as const, style: "italic" as const },
    body && { name: "Inter", data: body, weight: 500 as const, style: "normal" as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);
  const apps = ["Discord", "Telegram", "Slack", "WhatsApp", "Mattermost"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(180deg, #dff1ef 0%, #fdeee2 55%, #fbf7f0 100%)",
          padding: "64px 72px",
          fontFamily: "Inter",
          color: "#1d1b18",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, fontFamily: "Bricolage", letterSpacing: -1 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: "#0e7c7b", display: "flex", overflow: "hidden", alignItems: "flex-end", justifyContent: "center" }}>
              {face ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={face} width={54} height={54} alt="" />
              ) : null}
            </div>
            Ferri
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 88, fontFamily: "Bricolage", letterSpacing: -3.5, lineHeight: 1 }}>Run the event.</div>
            <div style={{ fontSize: 86, fontFamily: "Instrument Serif", fontStyle: "italic", letterSpacing: -1.5, lineHeight: 1.08, marginTop: 4 }}>Ferri runs the group chats.</div>
            <div style={{ fontSize: 27, color: "#57514a", marginTop: 24, maxWidth: 680, lineHeight: 1.4 }}>
              Answers your attendees on every app, with a source. Asks your crew once when it doesn&apos;t know.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {apps.map((a) => (
              <div key={a} style={{ display: "flex", fontSize: 20, padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.75)", border: "1px solid #e6dfd3", color: "#403b36" }}>
                {a}
              </div>
            ))}
          </div>
        </div>
        {ferri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ferri} width={300} height={300} alt="" style={{ position: "absolute", right: 40, top: 30 }} />
        ) : null}
      </div>
    ),
    { ...size, fonts },
  );
}
