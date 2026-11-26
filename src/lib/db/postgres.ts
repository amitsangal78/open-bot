import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, types } from "pg";

types.setTypeParser(1082, (value) => value);
import { z } from "zod";

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

const globalPool = globalThis as { openAgentPool?: Pool };

export function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value)
    throw new Error(
      "Set DATABASE_URL to postgresql://127.0.0.1:5432/open_agent.",
    );
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/open_agent"
  )
    throw new Error(
      "DATABASE_URL must use the open_agent database on 127.0.0.1:5432.",
    );
  return value;
}

export function getPool() {
  databaseUrl();
  globalPool.openAgentPool ??= new Pool({
    connectionString: databaseUrl(),
    max: 5,
  });
  return globalPool.openAgentPool;
}

export function appDatabase() {
  return drizzle(getPool(), { schema: { settings } });
}

export async function migratePostgres() {
  const pool = getPool();
  const folder = resolve("drizzle-pg");
  const files = readdirSync(folder)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    const applied = await pool.query(
      "SELECT to_regclass('public.schema_migrations') AS ready",
    );
    if (applied.rows[0]?.ready) {
      const existing = await pool.query(
        "SELECT id FROM schema_migrations WHERE id = $1",
        [name],
      );
      if (existing.rowCount) continue;
    }
    const sql = readFileSync(resolve(folder, name), "utf8");
    for (const statement of sql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean))
      await pool.query(statement);
    await pool.query(
      "INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING",
      [name],
    );
  }
}

export async function closePostgres() {
  await globalPool.openAgentPool?.end();
  globalPool.openAgentPool = undefined;
}

function knownTimezone(zone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
export const settingsSchema = z.object({
  displayName: z.string().trim().max(80),
  timezone: z.string().refine(knownTimezone, "Choose a timezone."),
  modelAddress: z
    .string()
    .trim()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname)
        );
      } catch {
        return false;
      }
    }, "The model address must be an http URL on this machine."),
  modelName: z.string().trim().max(120),
  notifications: z.boolean(),
});
export type AppSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: AppSettings = {
  displayName: "",
  timezone: "Asia/Kolkata",
  modelAddress: "http://127.0.0.1:11434",
  modelName: "",
  notifications: false,
};

export async function readSettings(): Promise<AppSettings> {
  const rows = await appDatabase().select().from(settings);
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return settingsSchema.parse({
    ...defaultSettings,
    ...saved,
    notifications: (saved.notifications ?? "false") === "true",
  });
}

export async function writeSettings(input: AppSettings) {
  const value = settingsSchema.parse(input);
  const db = appDatabase();
  for (const [key, stored] of Object.entries({
    ...value,
    notifications: String(value.notifications),
  })) {
    await db
      .insert(settings)
      .values({ key, value: stored })
      .onConflictDoUpdate({ target: settings.key, set: { value: stored } });
  }
  return value;
}

export async function postgresReady() {
  await getPool().query("SELECT 1");
}

export async function modelReady(address: string) {
  const url = new URL(address);
  const target = url.pathname === "/" ? new URL("/v1/models", url) : url;
  const attempts = [target];
  if (url.pathname === "/") attempts.push(new URL("/api/tags", url));
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return true;
    } catch {
      continue;
    }
  }
  return false;
}
