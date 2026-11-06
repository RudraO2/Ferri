export default function RsvpNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-zinc-50 px-5 pt-16 pb-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
        <h1 className="text-[20px] font-semibold tracking-tight">We couldn&apos;t find this RSVP link</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-zinc-700">
          Check that you opened the whole link from your email. If it still doesn&apos;t work, reply to that email and the organizers will help you.
        </p>
      </div>
    </main>
  );
}
