"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Health = {
  database: string;
  provider: string;
  model: string | null;
  keyConfigured: boolean;
};

async function fetchHealth(signal: AbortSignal): Promise<Health> {
  const response = await fetch("/api/health", { cache: "no-store", signal });
  const result: Health = await response.json();
  if (result.database !== "ready" && result.database !== "unavailable") {
    throw new Error("Unexpected health response");
  }
  return result;
}

export function SetupStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setHealth(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHealth(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section
      className="rounded-2xl border bg-card p-6"
      aria-label="Setup status"
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-semibold">Your setup</h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError(false);
            setAttempt((value) => value + 1);
          }}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Check again
        </Button>
      </div>
      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Checking local setup…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Could not check setup. Confirm the app is running and try again.
          </p>
        ) : health ? (
          <dl className="space-y-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Local database</dt>
              <dd
                className={
                  health.database === "ready"
                    ? "text-emerald-700"
                    : "text-destructive"
                }
              >
                {health.database === "ready"
                  ? "Ready"
                  : "Run npm run db:migrate"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{health.provider} API key</dt>
              <dd
                className={
                  health.keyConfigured
                    ? "text-emerald-700"
                    : "text-muted-foreground"
                }
              >
                {health.keyConfigured ? "Configured" : "Not configured"}
              </dd>
            </div>
            {health.model && (
              <div className="flex justify-between gap-4">
                <dt>Model</dt>
                <dd className="min-w-0 break-words text-right">
                  {health.model}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt>Timezone</dt>
              <dd>Asia/Kolkata</dd>
            </div>
          </dl>
        ) : null}
      </div>
      <p className="mt-6 border-t pt-5 text-xs leading-6 text-muted-foreground">
        Set your provider’s API key in .env.local, then restart the app. This
        check detects whether a key is present; it does not contact xAI or
        validate the key.
      </p>
    </section>
  );
}
