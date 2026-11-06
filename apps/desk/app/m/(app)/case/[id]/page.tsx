import { notFound } from "next/navigation";
import { caseView } from "@/lib/care";
import { myCrew } from "@/lib/pocket";
import { requirePocketUser } from "@/lib/session";
import { CareScreen } from "../../care-case";

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string }> }) {
  const { id } = await params;
  const { note } = await searchParams;
  const user = await requirePocketUser(`/m/case/${id}`);
  const [v, me] = await Promise.all([caseView(id), myCrew(user)]);
  if (!v) notFound();
  const here = `/m/case/${v.id}`;
  return <CareScreen v={v} title={v.ref} backHref="/m/stuck" here={here} done={here} note={note} myIds={new Set(me.map((m) => m.id))} full />;
}
