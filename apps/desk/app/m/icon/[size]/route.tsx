import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const SIZES = new Set([32, 48, 96, 144, 180, 192, 256, 512, 1024]);
const BRAND = "#0e7c7b";
const SKY = "#d3f0ec";

async function ferriPng(): Promise<string | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "brand", "src", "ferri-main.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Ferri's icons, drawn at the size asked: favicon (32, 48), notification badge (96),
 * iOS (180), PWA (192, 512, `?maskable` keeps Ferri inside the middle 80%).
 * `?avatar` is the bot's profile picture for every platform: Ferri on a sea-glass
 * square (platforms crop it to a circle), 512 or 1024 px.
 */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("not found", { status: 404 });
  const q = new URL(request.url).searchParams;
  const maskable = q.has("maskable");
  const avatar = q.has("avatar");
  const png = await ferriPng();
  const inner = Math.round(size * (maskable ? 0.72 : avatar ? 0.9 : 0.94));
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: avatar ? SKY : BRAND,
        }}
      >
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={png} width={inner} height={inner} alt="" style={{ marginTop: avatar ? size * 0.04 : 0 }} />
        ) : (
          <div style={{ display: "flex", color: avatar ? BRAND : "#ffffff", fontSize: size * 0.56, fontWeight: 800 }}>F</div>
        )}
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=3600" } },
  );
}
