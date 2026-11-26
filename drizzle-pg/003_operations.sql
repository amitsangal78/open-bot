CREATE TABLE IF NOT EXISTS operations (
  id text PRIMARY KEY,
  chat_id text NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  kind text NOT NULL,
  change text NOT NULL,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
