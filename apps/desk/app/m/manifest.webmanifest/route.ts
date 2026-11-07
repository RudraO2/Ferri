// Ferri Pocket's web app manifest. Scope /m, so Desk itself stays a normal site.
export function GET() {
  const manifest = {
    id: "/m",
    name: "Ferri Pocket",
    short_name: "Pocket",
    description: "Answer your community from your phone: questions for you, replies waiting for your OK, and who is stuck.",
    start_url: "/m",
    scope: "/m",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf7f0",
    theme_color: "#0e7c7b",
    categories: ["productivity", "social"],
    icons: [
      { src: "/m/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/m/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/m/icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Needs you", url: "/m" },
      { name: "Who is stuck", url: "/m/stuck" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
