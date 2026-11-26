CREATE TABLE IF NOT EXISTS chats (
  id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'idle',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  chat_id text NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  position integer NOT NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  tool_name text,
  tool_call_id text,
  tool_calls text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, position)
);

CREATE TABLE IF NOT EXISTS leases (
  id text PRIMARY KEY,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL
);
