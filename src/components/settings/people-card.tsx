"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Person {
  username: string;
  you: boolean;
}

export function PeopleCard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch("/api/users", { cache: "no-store" });
    const body = (await response.json()) as { users?: Person[]; error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not load people");
      return;
    }
    setPeople(body.users ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json()) as { username?: string; error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not add that person");
        return;
      }
      setUsername("");
      setPassword("");
      setNotice(`${body.username} can sign in and connect their own Tesla.`);
      await load();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Each person signs in and pastes their own Tesla Fleet client id and refresh token. Their car, places, history, and bot tokens stay on that login. A password reset is still <span className="font-mono">voltdesk-user reset-password</span> on the container.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <ul className="space-y-1 text-sm">
          {people.map((person) => (
            <li key={person.username} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
              <span className="truncate font-medium">{person.username}</span>
              {person.you && <span className="text-xs text-muted-foreground">This login</span>}
            </li>
          ))}
        </ul>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="person-username">Username</Label>
            <Input
              id="person-username"
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="person-password">Password</Label>
            <Input
              id="person-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add person"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
