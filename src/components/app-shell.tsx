"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock, MessageSquare, Plug, Settings } from "lucide-react";
import { Button } from "./ui/button";
import { ChatScreen } from "./chat-screen";
import { ConnectScreen } from "./connect-screen";
import { SchedulerScreen } from "./scheduler-screen";

type Tab = "Chat" | "Scheduler" | "Connect apps" | "Settings";
type Health = { database: "ready" | "unavailable"; model: "ready" | "unavailable" };
type AppSettings = {
  displayName: string;
  timezone: string;
  modelAddress: string;
  modelName: string;
  notifications: boolean;
};

const tabs: { name: Tab; icon: typeof MessageSquare }[] = [
  { name: "Chat", icon: MessageSquare },
  { name: "Scheduler", icon: Clock },
  { name: "Connect apps", icon: Plug },
  { name: "Settings", icon: Settings },
];
const emptySettings: AppSettings = {
  displayName: "",
  timezone: "Asia/Kolkata",
  modelAddress: "http://127.0.0.1:11434",
  modelName: "",
  notifications: false,
};

async function requestJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body ? "PUT" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function AppShell() {
  const params =
    typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const requestedChat = params.get("chat") || "";
  const [tab, setTab] = useState<Tab>(params.get("tab") === "connect" ? "Connect apps" : "Chat");
  const [initialChatId] = useState(requestedChat);
  const [openChatId, setOpenChatId] = useState(requestedChat);
  const [continueChatId] = useState(params.get("continue") === "1" ? requestedChat : "");
  const [notes, setNotes] = useState<{ id: string; body: string; chatId: string | null }[]>([]);
  const [unread, setUnread] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [zones, setZones] = useState<string[]>(["Asia/Kolkata"]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/notifications");
    const add = (event: MessageEvent) => {
      const data = JSON.parse(event.data) as {
        id: string;
        body: string;
        chatId: string | null;
      };
      setNotes((current) => (current.some((item) => item.id === data.id) ? current : [...current, data]));
      if (settings.notifications && "Notification" in window && Notification.permission === "granted")
        new Notification(data.body);
    };
    const count = (event: MessageEvent) => {
      setUnread((JSON.parse(event.data) as { count: number }).count);
    };
    source.addEventListener("notification", add);
    source.addEventListener("unread", count);
    return () => source.close();
  }, [settings.notifications]);

  function showChat(id: string) {
    setOpenChatId(id);
    setTab("Chat");
    setShowNotes(false);
  }

  async function markRead() {
    await fetch("/api/notifications/read", { method: "POST" });
    setNotes([]);
    setUnread(0);
  }

  useEffect(() => {
    if (!sessionStorage.getItem("open-agent-docyard-refresh")) {
      sessionStorage.setItem("open-agent-docyard-refresh", "1");
      void fetch("/api/submissions/refresh", { method: "POST" });
    }
    const zones = Intl.supportedValuesOf("timeZone");
    setZones(zones);
    void requestJson<Health>("/api/health")
      .then(setHealth)
      .catch(() => setHealth({ database: "unavailable", model: "unavailable" }));
    void requestJson<AppSettings>("/api/settings")
      .then(setSettings)
      .catch((error: Error) => setStatus(error.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      setSettings(await requestJson<AppSettings>("/api/settings", settings));
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card p-3">
        <div className="flex items-center justify-between px-3 py-4">
          <p className="text-sm font-semibold">Open Agent</p>
          <button
            type="button"
            className="relative text-sm"
            aria-label={unread ? `${unread} notifications` : "Notifications"}
            onClick={() => setShowNotes((open) => !open)}
          >
            Bell
            {unread > 0 && <span className="ml-1">{unread}</span>}
          </button>
        </div>
        {showNotes && (
          <div className="mx-3 mb-3 rounded-lg border bg-background p-2 text-sm">
            {notes.length === 0 && <p className="text-muted-foreground">No notifications.</p>}
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  if (note.chatId) showChat(note.chatId);
                  void markRead();
                }}
              >
                {note.body}
              </button>
            ))}
            {notes.length > 0 && (
              <button type="button" className="mt-1 px-2 text-xs text-muted-foreground" onClick={() => void markRead()}>
                Mark read
              </button>
            )}
          </div>
        )}
        <nav className="flex flex-col gap-1" aria-label="Main">
          {tabs.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              aria-current={tab === name ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                tab === name ? "bg-muted font-medium" : "hover:bg-muted"
              }`}
              onClick={() => setTab(name)}
            >
              <Icon />
              {name}
            </button>
          ))}
        </nav>
      </aside>
      <main
        className={
          tab === "Chat" ? "min-w-0 flex-1" : "min-w-0 flex-1 overflow-auto p-8"
        }
      >
        {tab === "Chat" && (
          <ChatScreen
            initialChatId={openChatId || initialChatId}
            continueChatId={continueChatId}
          />
        )}
        {tab === "Scheduler" && <SchedulerScreen onOpenChat={showChat} />}
        {tab === "Connect apps" && <ConnectScreen />}
        {tab === "Settings" && (
          <section aria-label="Settings" className="max-w-lg">
            <h1 className="text-xl font-semibold">Settings</h1>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt>Postgres</dt>
                <dd>
                  {health?.database === "ready" ? "Ready" : "Unavailable"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Local model</dt>
                <dd>{health?.model === "ready" ? "Ready" : "Unavailable"}</dd>
              </div>
            </dl>
            <form className="mt-6 space-y-4" onSubmit={(event) => void save(event)}>
              <label className="block text-sm">
                Display name
                <input
                  className="mt-1"
                  value={settings.displayName}
                  maxLength={80}
                  onChange={(event) =>
                    setSettings({ ...settings, displayName: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                Timezone
                <select
                  className="mt-1"
                  value={settings.timezone}
                  onChange={(event) =>
                    setSettings({ ...settings, timezone: event.target.value })
                  }
                >
                  {(zones.includes(settings.timezone)
                    ? zones
                    : [settings.timezone, ...zones]
                  ).map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Model address
                <input
                  className="mt-1"
                  value={settings.modelAddress}
                  onChange={(event) =>
                    setSettings({ ...settings, modelAddress: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                Model name
                <input
                  className="mt-1"
                  value={settings.modelName}
                  maxLength={120}
                  onChange={(event) =>
                    setSettings({ ...settings, modelName: event.target.value })
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    if (enabled && "Notification" in window)
                      void Notification.requestPermission().then((permission) => {
                        setSettings({
                          ...settings,
                          notifications: permission === "granted",
                        });
                        if (permission !== "granted")
                          setStatus("The browser did not allow notifications.");
                      });
                    else setSettings({ ...settings, notifications: enabled });
                  }}
                />
                Browser notifications
              </label>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {status && <p className="text-sm text-muted-foreground">{status}</p>}
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
