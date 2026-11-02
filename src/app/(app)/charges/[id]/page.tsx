import { SessionDetail } from "@/components/dashboard/session-detail";

export default async function ChargePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDetail kind="charge" id={id} />;
}
