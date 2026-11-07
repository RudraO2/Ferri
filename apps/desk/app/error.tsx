"use client";

import { Ferri } from "@/components/ferri";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-5 py-16 text-center">
      <Ferri pose="oops" size={150} decorative />
      <h1 className="h1 mt-4">Ferri got tangled up.</h1>
      <p className="muted mt-2 max-w-[360px]">This page could not load. Try again.</p>
      {error.digest ? <p className="mt-1 text-[12px] text-zinc-500">Reference {error.digest} (in the server log)</p> : null}
      <button type="button" onClick={reset} className="btn-primary mt-6 h-11 px-6">
        Try again
      </button>
    </main>
  );
}
