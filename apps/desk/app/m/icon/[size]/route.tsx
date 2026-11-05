import { ImageResponse } from "next/og";

const SIZES = new Set([96, 180, 192, 512]);

/** Pocket's app icons, drawn at the size asked (96 for the notification badge, 180 for iOS). */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  // A maskable icon keeps its mark inside the middle 80%; the plain one fills the tile.
  const pad = maskable ? size * 0.2 : 0;
  const inner = size - pad * 2;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#18181b" }}>
        <svg width={inner} height={inner} viewBox="0 0 24 24">
          <path d="M6 15c3-6 9-6 12 0" stroke="#fafafa" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="12" cy="15" r="1.6" fill="#fafafa" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  );
}
