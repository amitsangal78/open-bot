CREATE TABLE IF NOT EXISTS schedules (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  time_of_day text NOT NULL,
  weekdays text[] NOT NULL,
  prompt text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  chat_id text NOT NULL REFERENCES chats(id),
  checked_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedules_status CHECK (status IN ('active', 'paused', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id uuid PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  day date,
  source text NOT NULL DEFAULT 'schedule',
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_runs_status CHECK (
    status IN ('waiting', 'running', 'done', 'missed', 'skipped', 'failed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_runs_day
  ON schedule_runs (schedule_id, day)
  WHERE source = 'schedule' AND day IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  schedule_id uuid REFERENCES schedules(id) ON DELETE CASCADE,
  chat_id text,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
