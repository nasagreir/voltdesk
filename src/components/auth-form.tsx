"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/lib/auth/next-path";

export function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = safeNextPath(search.get("next"));
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
    router.replace(mode === "login" ? nextPath : "/");
    router.refresh();
  }

  return (
    <main className="garage-grid flex min-h-dvh items-center justify-center overflow-y-auto px-4 py-8 short:items-start short:py-3">
      <div className="w-full max-w-md">
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-white/10 bg-card/90 p-6 shadow-2xl short:space-y-3 short:p-4"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#e31937] font-semibold text-white">
              V
            </span>
            <div>
              <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">VoltDesk</p>
              <h1 className="font-heading text-xl">{mode === "setup" ? "Create the login" : "Sign in"}</h1>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === "setup"
              ? "This container has no account yet. The username and password stay on this machine."
              : "The garage is on this container. Sign in with the account created at first start."}
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <label className="grid gap-1.5 text-sm">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={mode === "setup" ? 8 : 1}
            />
          </label>
          {mode === "setup" && (
            <label className="grid gap-1.5 text-sm">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Working…" : mode === "setup" ? "Create login" : "Sign in"}
          </Button>
        </form>
        <details className="mt-3 rounded-2xl border border-white/10 bg-card/70 px-4 py-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer text-foreground">
            {mode === "setup" ? "Reset this later from the container" : "Forgot the password?"}
          </summary>
          <div className="mt-3 space-y-2">
            <p>
              There is no email reset. On the Proxmox host, enter the container and set a new password. That signs
              existing browsers out of the account.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 text-xs leading-relaxed text-foreground">
              {`pct enter CTID
voltdesk-user list
voltdesk-user reset-password USERNAME`}
            </pre>
            <p>
              Type the new password twice. It is not shown. Press Enter at the prompt to generate one instead. Leave
              the password off the command so it does not land in shell history.
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}
