"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellRing, ChevronDown } from "lucide-react";
import { pushKey, removePush, savePush, testPush } from "../actions";
import { QUIET } from "./quiet";

type State = "loading" | "unsupported" | "insecure" | "denied" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/m/sw.js", { scope: "/m", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

function usePush() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!window.isSecureContext) return setState("insecure");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      // Keep the server's copy fresh (a new sign-in on this phone moves it to that person).
      await savePush(JSON.stringify(sub));
      setState("on");
    } else setState("off");
  }, []);

  useEffect(() => {
    void check().catch((e: Error) => {
      setError(e.message);
      setState("unsupported");
    });
  }, [check]);

  async function turnOn() {
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const key = await pushKey();
      if (!key) throw new Error("The server has no push keys yet (run pnpm push:keys).");
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      const r = await savePush(JSON.stringify(sub));
      if (!r.ok) throw new Error(r.error ?? "Could not save the subscription.");
      setState("on");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function turnOff() {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await removePush(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  return { state, error, setError, turnOn, turnOff };
}

/** A one-line prompt on Needs you while notifications are off. */
export function PushNudge() {
  const { state, turnOn, error } = usePush();
  if (state !== "off" && !error) return null;
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 rounded-[14px] bg-brand-soft py-1 pr-1 pl-3.5">
      <BellRing size={16} className="shrink-0 text-brand-ink" aria-hidden />
      <div className="min-w-0 flex-1 text-[13.5px] text-zinc-700">{error ?? "Get a buzz when a card is for you."}</div>
      <button className="inline-flex h-11 shrink-0 items-center rounded-full px-3.5 text-[14px] font-semibold text-brand-ink active:bg-white/60" onClick={() => void turnOn()}>
        Turn on
      </button>
    </div>
  );
}

/** The notifications block on Me. */
export function PushPanel() {
  const { state, error, setError, turnOn, turnOff } = usePush();
  const [tested, setTested] = useState<string | null>(null);
  const text: Record<State, string> = {
    loading: "Checking…",
    unsupported: "This browser cannot get notifications. On iPhone, add Pocket to the Home Screen first, then open it from there.",
    insecure: "Notifications need a secure (https) address. Open Pocket through the tunnel link.",
    denied: "Blocked for this site. Allow them in the browser's site settings.",
    off: "Get a buzz for your cards, nudges and escalations.",
    on: "This phone buzzes for your cards, nudges and escalations.",
  };
  return (
    <div className="rounded-[20px] bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-semibold text-zinc-900">Notifications</div>
        <span className={`text-[13px] font-medium ${state === "on" ? "text-emerald-700" : "text-zinc-500"}`}>{state === "on" ? "On" : state === "loading" ? "…" : "Off"}</span>
      </div>
      <p className="mt-1 text-[13.5px] text-zinc-500">{text[state]}</p>
      {error ? <p className="mt-2 text-[13.5px] text-red-600">{error}</p> : null}
      {tested ? <p className="mt-2 text-[13.5px] text-emerald-700">{tested}</p> : null}
      <div className="mt-3 flex items-center gap-1">
        {state === "off" ? (
          <button className="btn-lg-primary flex-1" onClick={() => void turnOn()}>
            Turn on
          </button>
        ) : null}
        {state === "on" ? (
          <>
            <button
              className="btn-lg flex-1"
              onClick={async () => {
                setError(null);
                setTested(null);
                const r = await testPush();
                if (r.error) setError(r.error);
                else setTested(`Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}. It should show in a moment.`);
              }}
            >
              Send a test
            </button>
            <button className={QUIET} onClick={() => void turnOff()}>
              Turn off
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function InstallHint() {
  const [standalone, setStandalone] = useState(true);
  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  }, []);
  if (standalone) return null;
  return (
    <details className="group rounded-[20px] bg-white px-4 py-1 text-[13.5px] text-zinc-600 ring-1 ring-zinc-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[15px] font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
        Add Pocket to your home screen
        <ChevronDown size={17} className="text-zinc-400 transition group-open:rotate-180" aria-hidden />
      </summary>
      <p className="pb-3">
        Android: browser menu, then Install app. iPhone: Share, then Add to Home Screen. It opens full screen like an app.{" "}
        <Link className="underline" href="/m">
          Back to Needs you
        </Link>
      </p>
    </details>
  );
}
