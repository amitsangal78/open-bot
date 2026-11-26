"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
type Reply = { id: string; body: string; status: string };
type Item = {
  id: string;
  destination: string;
  status: string;
  error: string | null;
  remoteId: string | null;
  results: {
    id?: string;
    outputId?: string;
    format?: string;
    status?: string;
    pageUrl?: string;
  }[];
};
export function IntegrationPanel({
  compact = false,
  sourceKind = "chat",
  sourceRef = "selected",
  title = "Selected content",
  text = "",
}: {
  compact?: boolean;
  sourceKind?: "chat" | "gmail" | "stocks" | "scheduler";
  sourceRef?: string;
  title?: string;
  text?: string;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [replies, setReplies] = useState<Reply[]>([]),
    [error, setError] = useState(""),
    [review, setReview] = useState<"docyard" | "creativenest" | null>(null),
    [edited, setEdited] = useState(""),
    [receipt, setReceipt] = useState<{
      destination: string;
      url?: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    key = useRef(""),
    loaded = useRef(false);
  async function call(body?: unknown) {
    const response = await fetch(
      "/api/integrations",
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Integration unavailable.");
    return data;
  }
  async function refresh() {
    try {
      setBusy(true);
      const data = await call({ command: "refresh" });
      setItems(data.items);
      setReplies(data.replies || []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (compact || loaded.current) return;
    loaded.current = true;
    let alive = true;
    void call()
      .then((data) => {
        if (alive) {
          setItems(data.items);
          setReplies(data.replies || []);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [compact]);
  if (compact)
    return (
      <div className="px-6 py-2 flex gap-3 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReview("docyard");
            setEdited(text);
            key.current = crypto.randomUUID();
          }}
        >
          Prepare for DocYard
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReview("creativenest");
            setEdited(text);
            key.current = crypto.randomUUID();
          }}
        >
          Process in CreativeNest
        </Button>
        {receipt && (
          <p role="status">
            Content received by {receipt.destination}.{" "}
            {receipt.url && (
              <a href={receipt.url} target="_blank" rel="noreferrer">
                Open dashboard
              </a>
            )}
          </p>
        )}
        {review && (
          <section className="panel w-full">
            <h3>Review selected content → {review}</h3>
            <p>
              Only this content is sent. Document selection and approval happen
              in DocYard; processing requires a separate action in CreativeNest.
            </p>
            <label className="field">
              Content
              <textarea
                value={edited}
                onChange={(e) => {
                  setEdited(e.target.value);
                  key.current = crypto.randomUUID();
                }}
                rows={6}
              />
            </label>
            <Button
              disabled={busy || !edited.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await call({
                    command: "submit",
                    operationId: key.current,
                    confirmed: true,
                    input: {
                      destination: review,
                      title,
                      text: edited,
                      sourceKind,
                      sourceRef,
                    },
                  });
                  let url: string | undefined;
                  try {
                    const parsed = new URL(result.dashboardUrl);
                    if (
                      ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
                      ["http:", "https:"].includes(parsed.protocol) &&
                      !parsed.username &&
                      !parsed.password
                    )
                      url = parsed.href;
                  } catch {}
                  setReceipt({ destination: review!, url });
                  setReview(null);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm handoff
            </Button>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Cancel
            </Button>
            {error && <p role="alert">{error}</p>}
          </section>
        )}
      </div>
    );
  return (
    <section className="panel">
      <h3>Connected app results</h3>
      <Button disabled={busy} onClick={() => void refresh()}>
        Refresh results
      </Button>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 && <p>No submitted content yet.</p>}
      {replies.map((reply) => (
        <details key={reply.id}>
          <summary>CreativeNest email reply · {reply.status}</summary>
          <pre className="whitespace-pre-wrap">{reply.body}</pre>
          <Button
            disabled={busy || reply.status === "draft_saved"}
            onClick={async () => {
              if (
                !window.confirm(
                  "Approve saving this exact reply as a Gmail draft? It will not be sent.",
                )
              )
                return;
              setBusy(true);
              try {
                await call({
                  command: "approve_reply",
                  replyId: reply.id,
                  confirmed: true,
                });
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Approve Gmail draft saving
          </Button>
        </details>
      ))}
      {items.map((i) => (
        <details key={i.id}>
          <summary>
            {i.destination} · {i.status}
          </summary>
          {i.error && <p>{i.error}</p>}
          {i.results.length === 0 && <p>No remote outputs yet.</p>}
          {i.results.map((output, index) => {
            const id = output.outputId || output.id;
            const safePage =
              output.pageUrl &&
              /^https:\/\/(?:(?:www\.)?notion\.so|app\.notion\.com|www\.notion\.com)\//.test(
                output.pageUrl,
              )
                ? output.pageUrl
                : null;
            return (
              <p key={id || index}>
                {output.format || "Result"} · {output.status || "Pending"}{" "}
                {output.status === "ready" &&
                  id &&
                  output.format !== "notion" &&
                  i.destination === "docyard" && (
                    <a
                      href={`/api/integrations/download?handoffId=${encodeURIComponent(i.id)}&outputId=${encodeURIComponent(id)}`}
                    >
                      Download
                    </a>
                  )}
                {safePage && (
                  <a href={safePage} target="_blank" rel="noreferrer">
                    Open Notion page
                  </a>
                )}
              </p>
            );
          })}
          {i.status === "needs_attention" && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await call({ command: "retry_handoff", id: i.id });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Check existing receipt
            </Button>
          )}
        </details>
      ))}
    </section>
  );
}
