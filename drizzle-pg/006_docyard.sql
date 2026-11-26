CREATE TABLE IF NOT EXISTS docyard_submissions (
  id uuid PRIMARY KEY,
  chat_id text NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  submission_key text NOT NULL UNIQUE,
  docyard_id text,
  status text NOT NULL,
  dashboard_path text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS docyard_submissions_chat
  ON docyard_submissions (chat_id, created_at DESC);
