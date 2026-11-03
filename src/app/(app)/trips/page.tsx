import { Suspense } from "react";
import { TripsBoard } from "@/components/dashboard/trips-board";

export default function TripsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading trips…</p>}>
      <TripsBoard />
    </Suspense>
  );
}
