"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { SignInButton } from "./sign-in-button";

type ChatSummary = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  toolName: string | null;
};

type Approval = { id: string; kind: string; change: string };

type ShareStatus = {
  id: string;
  status: string;
  dashboardUrl: string;
  outputs: { outputId: string; format: string; status: string; pageUrl: string | null }[];
  lastError: string | null;
};

type OpenChat = ChatSummary & {
  messages: ChatMessage[];
  approval: Approval | null;
  connect: { id: string; name: string } | null;
};

async function readJson<T>(url: string, body?: unknown): Promise<T> {
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

export function ChatScreen({
  initialChatId = "",
  continueChatId = "",
}: {
  initialChatId?: string;
  continueChatId?: string;
}) {
  const [recent, setRecent] = useState<ChatSummary[]>([]);
  const [archive, setArchive] = useState<ChatSummary[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [chat, setChat] = useState<OpenChat | null>(null);
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [scheduleChat, setScheduleChat] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [share, setShare] = useState<ShareStatus | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  async function loadLists(preferId?: string) {
    const [recentList, archiveList] = await Promise.all([
      readJson<{ chats: ChatSummary[] }>("/api/chats?view=recent"),
      readJson<{ chats: ChatSummary[] }>("/api/chats?view=archive"),
    ]);
    setRecent(recentList.chats);
    setArchive(archiveList.chats);
    const known = [...recentList.chats, ...archiveList.chats];
    if (preferId && known.some((item) => item.id === preferId)) return preferId;
    return recentList.chats[0]?.id || "";
  }

  async function openChat(id: string) {
    const [opened, shared] = await Promise.all([
      readJson<OpenChat>(`/api/chats/${id}`),
      readJson<{ submission: ShareStatus | null }>(`/api/chats/${id}/submissions`).catch(
        () => ({ submission: null }),
      ),
    ]);
    setChat({ ...opened, connect: opened.connect || null });
    setShare(shared.submission);
    setTitle(opened.title);
    return opened;
  }

  async function refreshShare() {
    if (!chat) return;
    setNotice("");
    try {
      const result = await readJson<{ ok: boolean; error?: string }>(
        "/api/submissions/refresh",
        {},
      );
      const shared = await readJson<{ submission: ShareStatus | null }>(
        `/api/chats/${chat.id}/submissions`,
      );
      setShare(shared.submission);
      if (!result.ok) setNotice(result.error || "DocYard did not respond. The last status is unchanged.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "DocYard did not respond.");
    }
  }

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [chat?.messages, sending]);

  async function refresh(id: string) {
    const nextId = await loadLists(id);
    if (nextId) await openChat(nextId);
    else setChat(null);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || chat?.approval) return;
    const id = chat?.id || crypto.randomUUID();
    setDraft("");
    setNotice("");
    setSending(true);
    if (!chat) {
      setChat({
        id,
        title: text.slice(0, 80),
        status: "running",
        updatedAt: new Date().toISOString(),
        messages: [],
        approval: null,
        connect: null,
      });
      setTitle(text.slice(0, 80));
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/chats/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", text }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Request failed.");
      }
      setChat((current) =>
        current
          ? {
              ...current,
              messages: [
                ...current.messages,
                { id: crypto.randomUUID(), role: "user", content: text, toolName: null },
                {
                  id: "live",
                  role: "assistant",
                  content: "",
                  toolName: null,
                },
              ],
            }
          : current,
      );
      await readStream(response, id);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setNotice(error instanceof Error ? error.message : "Request failed.");
    } finally {
      abortRef.current = null;
      setSending(false);
      await refresh(id).catch((error: Error) => setNotice(error.message));
    }
  }

  async function resume(id = chat?.id) {
    if (!id || sending) return;
    setNotice("");
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/chats/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Request failed.");
      }
      await readStream(response, id);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const message = error instanceof Error ? error.message : "Request failed.";
        if (!message.includes("already running")) setNotice(message);
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      await refresh(id).catch((error: Error) => setNotice(error.message));
    }
  }

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const fallback = await loadLists(initialChatId);
        const openId = initialChatId || fallback;
        if (!openId || cancel) return;
        await openChat(openId);
        if (!continueChatId || cancel) return;
        const key = `open-agent-continue:${continueChatId}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        window.history.replaceState({}, "", "/");
        await resume(continueChatId);
      } catch (error) {
        if (!cancel)
          setNotice(error instanceof Error ? error.message : "Could not open the chat.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [initialChatId, continueChatId]);

  async function readStream(response: Response, id: string) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const type = chunk.match(/^event: (.+)$/m)?.[1];
        const dataLine = chunk.match(/^data: (.*)$/m)?.[1];
        if (!type || !dataLine) continue;
        const data = JSON.parse(dataLine) as {
          text?: string;
          name?: string;
          status?: string;
          error?: string;
          id?: string;
          change?: string;
          kind?: string;
          chatId?: string;
        };
        if (type === "error" && data.error) setNotice(data.error);
        if (type === "connect" && data.id && data.name) {
          const connectionId = data.id;
          const connectionName = data.name;
          setChat((current) =>
            current && current.id === id
              ? {
                  ...current,
                  status: "needs_auth",
                  connect: { id: connectionId, name: connectionName },
                }
              : current,
          );
        }
        if (type === "schedule" && data.chatId && data.name) {
          setScheduleChat({ id: data.chatId, name: data.name });
          void loadLists(id);
        }
        if (type === "approval" && data.change) {
          const change = data.change;
          const approvalId = data.id || "approval";
          const kind = data.kind || "memory";
          setChat((current) =>
            current && current.id === id
              ? {
                  ...current,
                  status: "awaiting_approval",
                  approval: { id: approvalId, kind, change },
                }
              : current,
          );
        }
        if (type === "text" && data.text) {
          const text = data.text;
          setChat((current) => {
            if (!current || current.id !== id) return current;
            const messages = [...current.messages];
            const last = messages.at(-1);
            if (last?.role === "assistant" && !last.toolName)
              messages[messages.length - 1] = {
                ...last,
                content: last.content + text,
              };
            else
              messages.push({
                id: crypto.randomUUID(),
                role: "assistant",
                content: text,
                toolName: null,
              });
            return { ...current, messages };
          });
        }
        if (type === "tool" && data.name) {
          const name = data.name;
          const status = data.status;
          setChat((current) => {
            if (!current || current.id !== id) return current;
            return {
              ...current,
              messages: [
                ...current.messages,
                {
                  id: crypto.randomUUID(),
                  role: "tool",
                  content: status === "running" ? "Running" : "Finished",
                  toolName: name,
                },
              ],
            };
          });
        }
      }
    }
  }

  async function rename(event?: { preventDefault?: () => void }) {
    event?.preventDefault?.();
    if (!chat) return;
    const next = title.trim();
    if (!next || next === chat.title) return;
    try {
      await readJson(`/api/chats/${chat.id}`, { action: "rename", title: next });
      await refresh(chat.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not rename.");
    }
  }

  async function remove() {
    if (!chat || !window.confirm("Delete this chat and its messages?")) return;
    try {
      await readJson(`/api/chats/${chat.id}`, { action: "delete" });
      setChat(null);
      const nextId = await loadLists();
      if (nextId) await openChat(nextId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete.");
    }
  }

  function startNew() {
    abortRef.current?.abort();
    setChat(null);
    setTitle("");
    setDraft("");
    setNotice("");
    setScheduleChat(null);
    setShare(null);
  }

  async function decide(approved: boolean) {
    if (!chat || sending) return;
    setNotice("");
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/chats/${chat.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume", approved }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Request failed.");
      }
      setChat((current) => (current ? { ...current, approval: null } : current));
      await readStream(response, chat.id);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setNotice(error instanceof Error ? error.message : "Request failed.");
    } finally {
      abortRef.current = null;
      setSending(false);
      await refresh(chat.id).catch((error: Error) => setNotice(error.message));
    }
  }

  const waiting = Boolean(chat?.approval);
  const canResume =
    chat &&
    !waiting &&
    (chat.status === "stopped" || chat.status === "failed") &&
    !sending;

  return (
    <section aria-label="Chat" className="flex h-full min-h-0">
      <div className="flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="p-3">
          <Button type="button" className="w-full" onClick={startNew}>
            New chat
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
          <ChatList
            label="Recent"
            chats={recent}
            currentId={chat?.id}
            onOpen={(id) => {
              setScheduleChat(null);
              void openChat(id).catch((error: Error) => setNotice(error.message));
            }}
          />
          <button
            type="button"
            className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => setShowArchive((open) => !open)}
          >
            Archive
          </button>
          {showArchive && (
            <ChatList
              label="Archive"
              chats={archive}
              currentId={chat?.id}
              empty="No older chats."
              onOpen={(id) => {
                setScheduleChat(null);
                void openChat(id).catch((error: Error) => setNotice(error.message));
              }}
            />
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          {chat ? (
            <form className="min-w-0 flex-1" onSubmit={(event) => void rename(event)}>
              <input
                aria-label="Chat title"
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={(event) => void rename(event)}
              />
            </form>
          ) : (
            <h1 className="text-sm font-semibold">New chat</h1>
          )}
          {chat && (
            <Button type="button" variant="outline" size="sm" onClick={() => void remove()}>
              Delete
            </Button>
          )}
        </header>
        <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          {!chat?.messages.length && (
            <p className="text-sm text-muted-foreground">
              Send a message. The reply comes from the local model in Settings.
            </p>
          )}
          {chat?.messages.map((message) => (
            <MessageView key={message.id} message={message} />
          ))}
        </div>
        {chat?.connect && (
          <div className="mx-4 mb-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Sign in to {chat.connect.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This chat needs {chat.connect.name} before it can continue.
            </p>
            <div className="mt-3">
              <SignInButton
                id={chat.connect.id}
                name={chat.connect.name}
                chatId={chat.id}
              />
            </div>
          </div>
        )}
        {share && (
          <div className="mx-4 mb-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">DocYard</h2>
            <p className="mt-2 text-sm">
              Status: {share.status.replaceAll("_", " ")}
            </p>
            {share.lastError && (
              <p className="mt-2 text-sm text-muted-foreground">{share.lastError}</p>
            )}
            {share.outputs.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {share.outputs.map((output) => (
                  <li key={output.outputId}>
                    {output.format} · {output.status}
                    {output.pageUrl ? (
                      <>
                        {" "}
                        <a href={output.pageUrl}>{output.pageUrl}</a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              {share.dashboardUrl && (
                <a className="text-sm underline" href={share.dashboardUrl}>
                  Open in DocYard
                </a>
              )}
              <Button type="button" variant="outline" onClick={() => void refreshShare()}>
                Refresh
              </Button>
            </div>
          </div>
        )}
        {scheduleChat && (
          <div className="mx-4 mb-3 rounded-lg border bg-card p-4">
            <p className="text-sm">Saved {scheduleChat.name}.</p>
            <div className="mt-3">
              <Button
                type="button"
                onClick={() => {
                  const id = scheduleChat.id;
                  setScheduleChat(null);
                  void openChat(id);
                }}
              >
                Open schedule chat
              </Button>
            </div>
          </div>
        )}
        {chat?.approval && (
          <div className="mx-4 mb-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Approve this change</h2>
            <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm">
              {chat.approval.change}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={sending}
                onClick={() => void decide(true)}
              >
                Accept
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={() => void decide(false)}
              >
                Reject
              </Button>
            </div>
          </div>
        )}
        {notice && (
          <p className="px-4 text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        )}
        <form className="flex items-end gap-2 border-t p-4" onSubmit={(event) => void send(event)}>
          <textarea
            aria-label="Message"
            rows={2}
            value={draft}
            maxLength={8000}
            disabled={sending || waiting}
            placeholder="Message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          {sending ? (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={waiting || !draft.trim()}>
              Send
            </Button>
          )}
          {canResume && (
            <Button type="button" variant="outline" onClick={() => void resume()}>
              Resume
            </Button>
          )}
        </form>
      </div>
    </section>
  );
}

function ChatList({
  label,
  chats,
  currentId,
  empty,
  onOpen,
}: {
  label: string;
  chats: ChatSummary[];
  currentId?: string;
  empty?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <p className="px-3 py-2 text-xs text-muted-foreground">{label}</p>
      {chats.length === 0 && empty && (
        <p className="px-3 text-sm text-muted-foreground">{empty}</p>
      )}
      {chats.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === currentId ? "true" : undefined}
          className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${
            item.id === currentId ? "bg-muted font-medium" : "hover:bg-muted"
          }`}
            onClick={() => onOpen(item.id)}
        >
          <span className="block truncate">{item.title}</span>
        </button>
      ))}
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "tool") {
    return (
      <p className="text-xs text-muted-foreground">
        {message.toolName}: {message.content}
      </p>
    );
  }
  const mine = message.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[40rem] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          mine ? "bg-primary text-primary-foreground" : "bg-card border"
        }`}
      >
        {message.content}
      </p>
    </div>
  );
}
