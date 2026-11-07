import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/** iPhone splash screens (portrait, device pixels), keyed "<width>x<height>". */
const SPLASH_SIZES = ["1125x2436", "1170x2532", "1179x2556", "1284x2778", "1290x2796", "828x1792", "750x1334"] as const;

async function art(): Promise<string | null> {
  for (const name of ["pocket-splash.png", "ferri-main.png"]) {
    try {
      const file = await readFile(path.join(process.cwd(), "public", "brand", "src", name));
      return `data:image/png;base64,${file.toString("base64")}`;
    } catch {
      // Try the next one.
    }
  }
  return null;
}

/** Pocket's launch screen when opened from the home screen: Ferri on cream, and the name. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = (await params).size;
  if (!(SPLASH_SIZES as readonly string[]).includes(size)) return new Response("not found", { status: 404 });
  const [w, h] = size.split("x").map(Number) as [number, number];
  const png = await art();
  const s = Math.round(w * 0.56);
  return new ImageResponse(
    (
      <div style={{ width: w, height: h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fbf7f0" }}>
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={png} width={s} height={s} alt="" />
        ) : (
          <div style={{ width: s * 0.6, height: s * 0.6, borderRadius: s * 0.16, background: "#0e7c7b", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: s * 0.34, fontWeight: 800 }}>
            F
          </div>
        )}
        <div style={{ marginTop: w * 0.05, fontSize: w * 0.085, fontWeight: 800, color: "#1d1b18", letterSpacing: -2 }}>Ferri Pocket</div>
        <div style={{ marginTop: w * 0.012, fontSize: w * 0.04, color: "#6d665e" }}>Your community, answered from your phone.</div>
      </div>
    ),
    { width: w, height: h, headers: { "cache-control": "public, max-age=86400" } },
  );
}
