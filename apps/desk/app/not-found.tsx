import Link from "next/link";
import { Ferri } from "@/components/ferri";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-16 text-center">
      <Ferri pose="lost" size={160} decorative />
      <h1 className="h1 mt-4">This page drifted off.</h1>
      <p className="muted mt-2 max-w-[340px]">The link may be old, or the page moved.</p>
      <Link href="/" className="btn-primary mt-6 h-11 px-6">
        Back to Desk
      </Link>
      <Link href="/welcome" className="mt-2 inline-flex h-11 items-center text-[13.5px] font-medium text-zinc-500 hover:text-zinc-900">
        What is Ferri?
      </Link>
    </main>
  );
}
