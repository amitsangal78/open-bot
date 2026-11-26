"use client";

import { useState, type FormEvent } from "react";
import { Button } from "./ui/button";

export function SignInButton({
  id,
  name,
  chatId,
}: {
  id: string;
  name: string;
  chatId?: string;
}) {
  const [needs, setNeeds] = useState<"" | "client_id" | "client_secret">("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/connections/${id}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(chatId ? { chatId } : {}),
          ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
          ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        }),
      });
      const data = (await response.json()) as {
        url?: string;
        error?: string;
        code?: string;
      };
      if (
        response.status === 422 &&
        (data.code === "client_id" || data.code === "client_secret")
      ) {
        setNeeds(data.code);
        setError(data.error || "This server needs a client id.");
        return;
      }
      if (!response.ok || !data.url)
        throw new Error(data.error || "Could not start sign-in.");
      window.location.href = data.url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start sign-in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void start(event)}>
      {needs && (
        <>
          <p className="text-sm text-muted-foreground">
            Redirect URL: {window.location.origin}/api/connections/callback
          </p>
          <label className="block text-sm">
            Client id
            <input
              className="mt-1"
              value={clientId}
              autoComplete="off"
              onChange={(event) => setClientId(event.target.value)}
            />
          </label>
          {needs === "client_secret" && (
            <label className="block text-sm">
              Client secret
              <input
                className="mt-1"
                type="password"
                value={clientSecret}
                autoComplete="off"
                onChange={(event) => setClientSecret(event.target.value)}
              />
            </label>
          )}
        </>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Opening sign-in…" : `Sign in to ${name}`}
      </Button>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
    </form>
  );
}
