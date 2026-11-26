"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { SignInButton } from "./sign-in-button";

type Connection = {
  id: string;
  name: string;
  url: string;
  state: "needs_auth" | "connected" | "disconnected";
};

const labels: Record<Connection["state"], string> = {
  needs_auth: "Needs auth",
  connected: "Connected",
  disconnected: "Disconnected",
};

async function send<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function ConnectScreen() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await send<{ connections: Connection[] }>("/api/connections");
    setConnections(data.connections);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      setNotice(error);
      window.history.replaceState({}, "", "/");
    }
    void load().catch((error: Error) => setNotice(error.message));
  }, []);

  const has = (server: string) => connections.some((item) => item.url === server);

  async function add(body: { provider: "gmail" | "notion" } | { name: string; url: string }) {
    setBusy(true);
    setNotice("");
    try {
      await send("/api/connections", body);
      setName("");
      setUrl("");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add the app.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    setNotice("");
    try {
      await send(`/api/connections/${id}/disconnect`, {});
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not disconnect.");
    }
  }

  function onAdd(event: FormEvent) {
    event.preventDefault();
    void add({ name: name.trim(), url: url.trim() });
  }

  return (
    <section aria-label="Connect apps" className="max-w-2xl">
      <h1 className="text-xl font-semibold">Connect apps</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign-in opens the provider. The token stays on this computer and is not
        shown here.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!has("https://gmailmcp.googleapis.com/mcp/v1") && (
          <Button type="button" disabled={busy} onClick={() => void add({ provider: "gmail" })}>
            Gmail
          </Button>
        )}
        {!has("https://mcp.notion.com/mcp") && (
          <Button type="button" disabled={busy} onClick={() => void add({ provider: "notion" })}>
            Notion
          </Button>
        )}
      </div>
      <ul className="mt-6 space-y-4">
        {connections.map((item) => (
          <li key={item.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{item.name}</h2>
                <p className="mt-1 break-all text-xs text-muted-foreground">{item.url}</p>
                <p className="mt-1 text-sm">{labels[item.state]}</p>
              </div>
              {item.state === "connected" && (
                <Button type="button" variant="outline" size="sm" onClick={() => void disconnect(item.id)}>
                  Disconnect
                </Button>
              )}
            </div>
            {item.state !== "connected" && (
              <div className="mt-3">
                <SignInButton id={item.id} name={item.name} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="mt-8 space-y-3" onSubmit={onAdd}>
        <h2 className="text-sm font-semibold">Add MCP</h2>
        <label className="block text-sm">
          Name
          <input className="mt-1" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm">
          Server address
          <input
            className="mt-1"
            value={url}
            placeholder="https://example.com/mcp"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy || !name.trim() || !url.trim()}>
          Add
        </Button>
      </form>
      {notice && (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
