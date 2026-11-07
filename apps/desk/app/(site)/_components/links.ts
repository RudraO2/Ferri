export const GITHUB = "https://github.com/RudraO2/Ferri";
export const DOCS = `${GITHUB}/tree/main/docs`;
export const DISCORD = "https://discord.gg/5FWRzfCcNa";
export const TELEGRAM = "https://t.me/+-7EpwBLi8QxlNDJl";
export const SWITCH = "https://github.com/sandbox-quantum/switch";
export const SWITCH_FORK = "https://github.com/RudraO2/switch/tree/ferri/agent-message-edit";
export const doc = (name: string) => `${GITHUB}/blob/main/docs/${name}.md`;
/** The public demo, where Desk's read-only guest view is on. */
export const DEMO_DESK = "https://ferri-demo.rudratechie.xyz/demo";
/**
 * The demo video (a YouTube or Loom link). While it is empty, every "Watch the video" button on
 * the site is hidden. Paste the link here, or set NEXT_PUBLIC_FERRI_VIDEO_URL when Desk is built.
 */
export const VIDEO = process.env.NEXT_PUBLIC_FERRI_VIDEO_URL || "";
