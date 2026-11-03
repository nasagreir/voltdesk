import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function SetupPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Opening setup…</p>}>
      <AuthForm mode="setup" />
    </Suspense>
  );
}
