"use client";

import { useState } from "react";

/** A guest's RSVP link: the code opens it, the button copies the whole address. */
export function CopyLink({ url, code }: { url: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard (plain http on another host): show it to copy by hand.
      window.prompt("Copy the RSVP link", url);
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <a href={url} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-zinc-500 underline underline-offset-2" title={url}>
        {code}
      </a>
      <button type="button" onClick={copy} className="rounded border border-zinc-200 bg-white px-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50">
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
