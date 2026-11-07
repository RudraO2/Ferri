import { redirect } from "next/navigation";
import { GatewayClient } from "@/lib/ferri";
import { startSession, switchUrl } from "@/lib/session";

// Read DESK_GUEST_VIEW when the link is opened, not when the image is built.
export const dynamic = "force-dynamic";

/**
 * The public demo's one link into Desk (DESK_GUEST_VIEW=on): opens the read-only guest view at
 * once, with no sign-in page. Same session as the sign-in page's "Look around"; proxy.ts refuses
 * every change for it. Without the guest view this is just the sign-in page.
 */
export async function GET(): Promise<never> {
  const password = process.env.SWITCH_ADMIN_PASSWORD || process.env.GATEWAY_ADMIN_PASSWORD;
  if (process.env.DESK_GUEST_VIEW !== "on" || !password) redirect("/login");
  const gateway = new GatewayClient(switchUrl(), process.env.SWITCH_ADMIN_EMAIL || "admin@switch.local", password);
  await gateway.login();
  const me = await gateway.me();
  await startSession({ uid: me.id, email: "guest", name: "Guest (read-only)", gw: gateway.session, readonly: true });
  redirect("/");
}
