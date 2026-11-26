CREATE TABLE IF NOT EXISTS mcp_connections (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'needs_auth',
  client_id text,
  client_secret_enc text,
  token_enc text,
  oauth_state text UNIQUE,
  oauth_verifier_enc text,
  oauth_chat_id text,
  oauth_expires_at timestamptz,
  oauth_meta text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcp_connections_state CHECK (state IN ('needs_auth', 'connected', 'disconnected'))
);
