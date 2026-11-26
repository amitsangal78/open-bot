"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { WEEKDAYS } from "@/lib/schedule/time";

type Schedule = {
  id: string;
  name: string;
  time: string;
  weekdays: string[];
  prompt: string;
  status: "active" | "paused" | "cancelled";
  chatId: string;
  latestRun: { id: string; status: string; day: string | null; source: string } | null;
};

type Run = {
  id: string;
  scheduleId: string;
  name: string;
  chatId: string;
  day: string | null;
  source: string;
  status: string;
  createdAt: string;
};

const labels: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function SchedulerScreen({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [name, setName] = useState("");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<string[]>(["monday"]);
  const [prompt, setPrompt] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await send<{ schedules: Schedule[]; runs: Run[] }>("/api/schedules", "GET");
    setSchedules(data.schedules);
    setRuns(data.runs);
  }

  useEffect(() => {
    void load().catch((error: Error) => setNotice(error.message));
  }, []);

  function toggleDay(day: string) {
    setDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  function resetForm() {
    setEditing(null);
    setName("");
    setTime("09:00");
    setDays(["monday"]);
    setPrompt("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const body = { name, time, weekdays: days, prompt };
    try {
      if (editing) await send(`/api/schedules/${editing}`, "PATCH", body);
      else await send("/api/schedules", "POST", body);
      resetForm();
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function act(url: string, method: string, body?: unknown) {
    setNotice("");
    try {
      await send(url, method, body);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update the schedule.");
    }
  }

  const attention = runs.filter((run) => run.status === "missed");

  return (
    <section aria-label="Scheduler" className="max-w-3xl">
      <h1 className="text-xl font-semibold">Scheduler</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A schedule runs one prompt in its own chat. Times use the timezone in Settings.
      </p>
      {attention.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          <ul className="mt-2 space-y-2">
            {attention.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
                <span className="font-medium">{run.name}</span>
                <span className="text-muted-foreground">{run.day}</span>
                <Button type="button" size="sm" onClick={() => void act(`/api/schedules/${run.scheduleId}/decide`, "POST", { runId: run.id, decision: "run" })}>
                  Run
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void act(`/api/schedules/${run.scheduleId}/decide`, "POST", { runId: run.id, decision: "skip" })}>
                  Skip
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="mt-6 space-y-3" onSubmit={(event) => void save(event)}>
        <h2 className="text-sm font-semibold">{editing ? "Edit schedule" : "New schedule"}</h2>
        <label className="block text-sm">
          Name
          <input className="mt-1" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm">
          Time
          <input className="mt-1" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <fieldset>
          <legend className="text-sm">Weekdays</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={days.includes(day)} onChange={() => toggleDay(day)} />
                {labels[day]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm">
          Prompt
          <textarea className="mt-1" rows={3} value={prompt} maxLength={8000} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !name.trim() || !prompt.trim() || days.length === 0}>
            {editing ? "Save" : "Create"}
          </Button>
          {editing && (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
      </form>
      <ul className="mt-8 space-y-3">
        {schedules.map((item) => (
          <li key={item.id} className="rounded-lg border bg-card p-4">
            <button type="button" className="text-left" onClick={() => onOpenChat(item.chatId)}>
              <h2 className="text-sm font-semibold">{item.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.time} · {item.weekdays.map((day) => labels[day] || day).join(", ")} · {item.status}
                {item.latestRun ? ` · last run ${item.latestRun.status}` : ""}
              </p>
            </button>
            <p className="mt-2 line-clamp-2 text-sm">{item.prompt}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.status !== "cancelled" && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(item.id);
                    setName(item.name);
                    setTime(item.time);
                    setDays(item.weekdays);
                    setPrompt(item.prompt);
                  }}
                >
                  Edit
                </Button>
                {item.status === "active" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void act(`/api/schedules/${item.id}`, "PATCH", { status: "paused" })}>
                    Pause
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void act(`/api/schedules/${item.id}`, "PATCH", { status: "active" })}>
                    Resume
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => void act(`/api/schedules/${item.id}/run`, "POST", {})}>
                  Run now
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm("Cancel this schedule?"))
                      void act(`/api/schedules/${item.id}`, "PATCH", { status: "cancelled" });
                  }}
                >
                  Cancel
                </Button>
              </>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!window.confirm("Delete this schedule? Its chat stays in Chat.")) return;
                  if (editing === item.id) resetForm();
                  void act(`/api/schedules/${item.id}`, "DELETE");
                }}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <h2 className="text-sm font-semibold">Run history</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {runs.map((run) => (
              <li key={run.id}>
                <button type="button" className="hover:underline" onClick={() => onOpenChat(run.chatId)}>
                  {run.name} · {run.day || "now"} · {run.status}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {notice && (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
