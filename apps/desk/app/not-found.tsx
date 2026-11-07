import Link from "next/link";
import { Ferri } from "@/components/ferri";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-16 text-center">
      <Ferri pose="lost" size={180} decorative />
      <h1 className="h1 mt-4">This page drifted off.</h1>
      <p className="muted mt-2 max-w-[380px]">The link may be old, or the page moved. Ferri can take you back.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-primary h-10 px-5">
          Back to Desk
        </Link>
        <Link href="/welcome" className="btn h-10 px-5">
          What is Ferri?
        </Link>
      </div>
    </main>
  );
}
