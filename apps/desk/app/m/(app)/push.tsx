"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { pushKey, removePush, savePush, testPush } from "../actions";

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
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
      <div className="flex-1 text-[14px] text-zinc-700">{error ?? "Turn on notifications so a question for you buzzes this phone."}</div>
      <button className="btn-lg-primary h-9 px-3 text-[14px]" onClick={() => void turnOn()}>
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
    unsupported: "This browser cannot get push notifications. On iPhone, add Pocket to the Home Screen first (Share, then Add to Home Screen), then open it from there.",
    insecure: "Notifications need a secure address (https). Open Pocket through the tunnel link.",
    denied: "Notifications are blocked for this site. Allow them in the browser's site settings, then come back.",
    off: "Off. Turn them on to hear about cards for you, nudges and escalations.",
    on: "On for this device. Cards for you, nudges and escalations buzz here.",
  };
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-medium">Notifications</div>
        <span className={`pill ${state === "on" ? "bg-emerald-100 text-emerald-800" : ""}`}>{state === "on" ? "on" : state === "loading" ? "…" : "off"}</span>
      </div>
      <p className="mt-1 text-[13.5px] text-zinc-500">{text[state]}</p>
      {error ? <p className="mt-2 text-[13.5px] text-red-600">{error}</p> : null}
      {tested ? <p className="mt-2 text-[13.5px] text-emerald-700">{tested}</p> : null}
      <div className="mt-3 flex gap-2">
        {state === "off" ? (
          <button className="btn-lg-primary flex-1" onClick={() => void turnOn()}>
            Turn on notifications
          </button>
        ) : null}
        {state === "on" ? (
          <>
            <button
              className="btn-lg-primary flex-1"
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
            <button className="btn-lg" onClick={() => void turnOff()}>
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
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-[13.5px] text-zinc-600">
      <div className="text-[15px] font-medium text-zinc-900">Put Pocket on your home screen</div>
      <p className="mt-1">
        Android: browser menu, then Install app. iPhone: Share, then Add to Home Screen. It opens full screen like an app.{" "}
        <Link className="underline" href="/m">
          Back to Needs you
        </Link>
      </p>
    </div>
  );
}
