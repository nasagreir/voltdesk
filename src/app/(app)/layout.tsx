import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Opening VoltDesk…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
