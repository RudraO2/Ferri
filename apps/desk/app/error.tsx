"use client";

import { Ferri } from "@/components/ferri";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-5 py-16 text-center">
      <Ferri pose="oops" size={160} decorative />
      <h1 className="h1 mt-4">Ferri got tangled up.</h1>
      <p className="muted mt-2 max-w-[420px]">
        This page could not load. Try again; if it keeps happening, the server log has the details{error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <button type="button" onClick={reset} className="btn-primary mt-6 h-10 px-5">
        Try again
      </button>
    </main>
  );
}
