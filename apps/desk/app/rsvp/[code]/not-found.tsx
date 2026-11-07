import { Ferri } from "@/components/ferri";

export default function RsvpNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-zinc-50 px-5 pt-12 pb-8">
      <Ferri pose="lost" size={120} decorative className="mb-4 self-center" />
      <div className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em]">We couldn&apos;t find this RSVP link</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-zinc-700">
          Check that you opened the whole link from your email. If it still doesn&apos;t work, reply to that email and the organizers will help you.
        </p>
      </div>
    </main>
  );
}
