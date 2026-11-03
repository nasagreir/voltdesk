import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Opening sign in…</p>}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
