import { randomUUID } from "node:crypto";
import { getPool } from "../db/postgres";
import { AppError } from "../core";
import { readSettings } from "../db/postgres";
import { chatIsRunning, claimChat, getChat, pendingApproval } from "../chat/store";
import { runChat } from "../chat/run";
import {
  WEEKDAYS,
  dueActions,
  initialCheckedOn,
  type Weekday,
} from "./time";

export type ScheduleInput = {
  name: string;
  time: string;
  weekdays: Weekday[];
  prompt: string;
};

export type ScheduleRow = {
  id: string;
  name: string;
  time_of_day: string;
  weekdays: string[];
  prompt: string;
  status: "active" | "paused" | "cancelled";
  chat_id: string;
  checked_on: Date | string;
};

type RunRow = {
  id: string;
  schedule_id: string;
  day: Date | string | null;
  source: string;
  status: string;
  created_at: Date;
  name?: string;
  chat_id?: string;
};

function dayText(value: Date | string | null) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function publicSchedule(row: ScheduleRow, latest: RunRow | undefined) {
  return {
    id: row.id,
    name: row.name,
    time: row.time_of_day,
    weekdays: row.weekdays,
    prompt: row.prompt,
    status: row.status,
    chatId: row.chat_id,
    latestRun: latest
      ? { id: latest.id, status: latest.status, day: dayText(latest.day), source: latest.source }
      : null,
  };
}

export function parseSchedule(input: ScheduleInput) {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  const time = input.time.trim();
  const weekdays = [...new Set(input.weekdays)];
  if (!name || name.length > 80) throw new AppError("Enter a name.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new AppError("Enter a time as HH:MM.");
  if (!weekdays.length || weekdays.some((day) => !WEEKDAYS.includes(day)))
    throw new AppError("Choose at least one weekday.");
  if (!prompt || prompt.length > 8000) throw new AppError("Enter a prompt.");
  return { name, time, weekdays, prompt };
}

export async function listSchedules() {
  const schedules = await getPool().query<ScheduleRow>(
    `SELECT id, name, time_of_day, weekdays, prompt, status, chat_id, checked_on
     FROM schedules ORDER BY created_at ASC`,
  );
  const runs = await getPool().query<RunRow>(
    `SELECT DISTINCT ON (schedule_id)
       id, schedule_id, day, source, status, created_at
     FROM schedule_runs
     ORDER BY schedule_id, created_at DESC`,
  );
  const latest = new Map(runs.rows.map((row) => [row.schedule_id, row]));
  return schedules.rows.map((row) => publicSchedule(row, latest.get(row.id)));
}

export async function listRuns() {
  const result = await getPool().query<RunRow>(
    `SELECT runs.id, runs.schedule_id, runs.day, runs.source, runs.status, runs.created_at,
            schedules.name, schedules.chat_id
     FROM schedule_runs runs
     JOIN schedules ON schedules.id = runs.schedule_id
     ORDER BY runs.created_at DESC
     LIMIT 30`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    scheduleId: row.schedule_id,
    name: row.name || "",
    chatId: row.chat_id || "",
    day: dayText(row.day),
    source: row.source,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function createSchedule(input: ScheduleInput) {
  const parsed = parseSchedule(input);
  const settings = await readSettings();
  const id = randomUUID();
  const chatId = randomUUID();
  const checkedOn = initialCheckedOn(
    new Date(),
    settings.timezone,
    parsed.time,
    parsed.weekdays,
  );
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO chats (id, title) VALUES ($1, $2)`, [
      chatId,
      parsed.name,
    ]);
    await client.query(
      `INSERT INTO schedules
        (id, name, time_of_day, weekdays, prompt, chat_id, checked_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, parsed.name, parsed.time, parsed.weekdays, parsed.prompt, chatId, checkedOn],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { id, chatId };
}

export async function updateSchedule(
  id: string,
  input: Partial<ScheduleInput> & { status?: "active" | "paused" | "cancelled" },
) {
  const current = await requireSchedule(id);
  if (current.status === "cancelled")
    throw new AppError("A cancelled schedule stays cancelled.");
  const next = parseSchedule({
    name: input.name ?? current.name,
    time: input.time ?? current.time_of_day,
    weekdays: (input.weekdays ?? current.weekdays) as Weekday[],
    prompt: input.prompt ?? current.prompt,
  });
  const status = input.status ?? current.status;
  if (current.status === "paused" && status === "active") {
    const settings = await readSettings();
    const checkedOn = initialCheckedOn(
      new Date(),
      settings.timezone,
      next.time,
      next.weekdays,
    );
    await getPool().query(
      `UPDATE schedules
       SET name = $2, time_of_day = $3, weekdays = $4, prompt = $5, status = 'active',
           checked_on = $6, updated_at = now()
       WHERE id = $1`,
      [id, next.name, next.time, next.weekdays, next.prompt, checkedOn],
    );
    await getPool().query(`UPDATE chats SET title = $2 WHERE id = $1`, [
      current.chat_id,
      next.name,
    ]);
    return;
  }
  await getPool().query(
    `UPDATE schedules
     SET name = $2, time_of_day = $3, weekdays = $4, prompt = $5, status = $6, updated_at = now()
     WHERE id = $1`,
    [id, next.name, next.time, next.weekdays, next.prompt, status],
  );
  await getPool().query(`UPDATE chats SET title = $2 WHERE id = $1`, [
    current.chat_id,
    next.name,
  ]);
}

export async function deleteSchedule(id: string) {
  const current = await requireSchedule(id);
  if (await chatIsRunning(current.chat_id))
    throw new AppError("This schedule is running.", 409);
  await getPool().query(`DELETE FROM schedules WHERE id = $1`, [id]);
}

export async function runScheduleNow(id: string) {
  const schedule = await requireSchedule(id);
  if (schedule.status === "cancelled")
    throw new AppError("A cancelled schedule cannot run.");
  const runId = randomUUID();
  await getPool().query(
    `INSERT INTO schedule_runs (id, schedule_id, day, source, status)
     VALUES ($1, $2, CURRENT_DATE, 'now', 'running')`,
    [runId, id],
  );
  await deliver(schedule, runId);
  return { id: runId, chatId: schedule.chat_id };
}

export async function decideRun(id: string, runId: string, decision: "run" | "skip") {
  const schedule = await requireSchedule(id);
  const run = await getPool().query<RunRow>(
    `SELECT id, schedule_id, day, source, status, created_at
     FROM schedule_runs WHERE id = $1 AND schedule_id = $2`,
    [runId, id],
  );
  const row = run.rows[0];
  if (!row) throw new AppError("Run not found.", 404);
  if (row.status !== "missed")
    throw new AppError("That day is not waiting for a decision.");
  if (decision === "skip") {
    await getPool().query(
      `UPDATE schedule_runs SET status = 'skipped', updated_at = now() WHERE id = $1`,
      [runId],
    );
    return { chatId: schedule.chat_id };
  }
  await getPool().query(
    `UPDATE schedule_runs SET status = 'running', updated_at = now() WHERE id = $1`,
    [runId],
  );
  await deliver(schedule, runId);
  return { chatId: schedule.chat_id };
}

export async function tickSchedules(owner: string) {
  const claimed = await getPool().query(
    `INSERT INTO leases (id, owner, expires_at)
     VALUES ('worker:scheduler', $1, now() + interval '30 seconds')
     ON CONFLICT (id) DO UPDATE
     SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
     WHERE leases.expires_at < now() OR leases.owner = $1
     RETURNING owner`,
    [owner],
  );
  if (!claimed.rowCount) return;
  const settings = await readSettings();
  const schedules = await getPool().query<ScheduleRow>(
    `SELECT id, name, time_of_day, weekdays, prompt, status, chat_id, checked_on
     FROM schedules WHERE status <> 'cancelled'`,
  );
  for (const schedule of schedules.rows) {
    const plan = dueActions({
      now: new Date(),
      timeZone: settings.timezone,
      time: schedule.time_of_day,
      weekdays: schedule.weekdays,
      checkedOn: dayText(schedule.checked_on) || "1970-01-01",
      status: schedule.status,
    });
    let ran = false;
    for (const action of plan.actions) {
      if (action.action === "miss") {
        await insertDay(schedule, action.date, "missed");
        continue;
      }
      if (ran) continue;
      const runId = await insertDay(schedule, action.date, "running");
      if (!runId) continue;
      ran = true;
      try {
        await deliver(schedule, runId);
      } catch (error) {
        console.error(
          "[worker]",
          error instanceof Error ? error.message : "A schedule run failed.",
        );
      }
    }
    await getPool().query(`UPDATE schedules SET checked_on = $2, updated_at = now() WHERE id = $1`, [
      schedule.id,
      plan.checkedOn,
    ]);
  }
}

async function insertDay(schedule: ScheduleRow, day: string, status: string) {
  const id = randomUUID();
  const result = await getPool().query(
    `INSERT INTO schedule_runs (id, schedule_id, day, source, status)
     VALUES ($1, $2, $3, 'schedule', $4)
     ON CONFLICT (schedule_id, day) WHERE source = 'schedule' AND day IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [id, schedule.id, day, status],
  );
  if (status === "missed" && result.rowCount)
    await notify(schedule, `${schedule.name} missed ${day}. Run or skip it in Scheduler.`);
  return result.rows[0]?.id as string | undefined;
}

async function deliver(schedule: ScheduleRow, runId: string) {
  const owner = randomUUID();
  try {
    if (await pendingApproval(schedule.chat_id))
      throw new AppError("A change is still waiting in that chat.");
    if (!(await claimChat(schedule.chat_id, owner)))
      throw new AppError("This conversation is already running.", 409);
    await runChat({
      chatId: schedule.chat_id,
      owner,
      signal: AbortSignal.timeout(240_000),
      mode: "send",
      text: schedule.prompt,
      allowShare: false,
      emit: () => undefined,
    });
    const chat = await getChat(schedule.chat_id);
    const failed = chat?.status === "failed" || chat?.status === "stopped";
    await finish(schedule, runId, failed ? "failed" : "done", chat?.status);
  } catch (error) {
    await finish(schedule, runId, "failed");
    if (error instanceof AppError) throw error;
  }
}

async function finish(
  schedule: ScheduleRow,
  runId: string,
  status: "done" | "failed",
  chatStatus?: string,
) {
  await getPool().query(
    `UPDATE schedule_runs SET status = $2, updated_at = now() WHERE id = $1 AND status = 'running'`,
    [runId, status],
  );
  const waiting = chatStatus === "awaiting_approval";
  const body = waiting
    ? `${schedule.name} is waiting for approval.`
    : status === "done"
      ? `${schedule.name} finished.`
      : `${schedule.name} failed.`;
  await notify(schedule, body);
}

async function notify(schedule: ScheduleRow, body: string) {
  await getPool().query(
    `INSERT INTO notifications (id, schedule_id, chat_id, body) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), schedule.id, schedule.chat_id, body],
  );
}

async function requireSchedule(id: string) {
  const result = await getPool().query<ScheduleRow>(
    `SELECT id, name, time_of_day, weekdays, prompt, status, chat_id, checked_on
     FROM schedules WHERE id = $1`,
    [id],
  );
  if (!result.rowCount) throw new AppError("Schedule not found.", 404);
  return result.rows[0];
}

export async function unreadNotifications() {
  const result = await getPool().query<{
    id: string;
    chat_id: string | null;
    body: string;
    created_at: Date;
  }>(
    `SELECT id, chat_id, body, created_at FROM notifications
     WHERE read_at IS NULL ORDER BY created_at ASC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function markNotificationsRead() {
  await getPool().query(
    `UPDATE notifications SET read_at = now() WHERE read_at IS NULL`,
  );
}
