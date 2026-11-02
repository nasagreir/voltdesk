"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const body = await response.json();
      if (body.authenticated) router.replace("/");
      else if (mode === "login" && body.needsSetup) router.replace("/setup");
      else if (mode === "setup" && !body.needsSetup) router.replace("/login");
    })();
  }, [mode, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "login" ? { username, password } : { username, password, confirmPassword },
      ),
    });
    const body = await response.json();
    setPending(false);
    if (!response.ok) {
      if (body.needsSetup) router.replace("/setup");
      setError(body.error ?? "Request failed");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="garage-grid flex min-h-dvh items-center justify-center px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-card/90 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#e31937] font-semibold text-white">
            V
          </span>
          <div>
            <h1 className="font-heading text-xl">VoltDesk</h1>
            <p className="text-sm text-muted-foreground">
              {mode === "setup"
                ? "Create the operator login for this container."
                : "Sign in to the garage."}
            </p>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <label className="grid gap-1.5 text-sm">
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-sm">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {mode === "setup" && (
          <label className="grid gap-1.5 text-sm">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Working…" : mode === "setup" ? "Create login" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
