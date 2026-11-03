import { SessionDetail } from "@/components/dashboard/session-detail";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDetail kind="drive" id={id} />;
}