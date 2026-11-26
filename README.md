# Amit’s personal assistant

For current implementation, tests and open work, start with [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

A local Next.js and LangGraph assistant with streaming chat, approved actions,
Markdown memory, a unified Scheduler, stock alerts, multi-account Gmail,
Calendar and notifications. Groq is the default testing model provider.

The left menu is **Chat · Scheduler · Stocks · Inbox · Calendar · Settings**.
The to-do feature is retired; historical database rows are preserved. Scheduler
owns reminders, briefs, digests, Gmail searches, research and stock fetches,
including missed-job decisions and execution history.

Prepared content can be handed to the sibling DocYard or CreativeNest app.
DocYard owns format selection and document approvals; CreativeNest owns editing
and processing. Returned email replies need separate approval here before saving
a Gmail draft. Service credentials stay server-side. Result refresh happens once
on full load or manually, without periodic remote polling. Vector search remains
a later phase. Approved documents in `docs/` describe requirements and historical
milestones; they are not a current implementation checklist.

## Run locally

Use Node 22.15.0 from `.nvmrc`. Run commands from this project root:

```sh
nvm use
node -v
npm ci
```

`node -v` must print `v22.15.0` before `npm run db:migrate`, `npm run dev`, or `npm start`. Those scripts pass `--env-file-if-exists`, which Node only accepts from 20.12 and from 22. An older Node stops immediately with `node: bad option: --env-file-if-exists=.env.local` and exit code 9. The migrate script never runs in that case. A new terminal does not keep `nvm use`, so run it again in each shell.

If you do not already have `.env.local`, copy `.env.example` to `.env.local` and
fill it in privately. Never overwrite an existing configuration or put real keys
in `.env.example`.

```dotenv
AI_PROVIDER=groq
AI_MODEL=qwen/qwen3.8-27b
AI_MAX_OUTPUT_TOKENS=512
GROQ_API_KEY=your-key
DATA_DIR=./data
```

For a production build and local startup:

```sh
npm run build:webpack
npm start
```

Open [the assistant](http://127.0.0.1:3000). `npm start` applies migrations and runs
the web server and worker together. Ctrl+C stops both. `npm run dev` starts the
Turbopack development server plus worker; if your environment restricts Turbopack
CSS compilation sockets, use the Webpack production commands above. Restart after
changing worker code or environment variables. The app is loopback-only and not
intended to be exposed to a network or deployed as a multi-user service.

## Using the app

- **Chat:** streamed responses, persistent history and approval before assistant writes.
- **Scheduler:** create explicit one-time or recurring jobs, edit timing, filters and result handling, pause/resume,
  run now, cancel and review missed/failed runs. Custom cron uses Asia/Kolkata.
  The same changes are available through approved chat actions.
- **Stocks:** quotes, price/percentage alerts and optional selected-content handoff.
  The existing market-hours worker remains the single owner of alert monitoring.
- **Inbox:** search/read connected accounts and save approved drafts. No sending.
- **Calendar:** read upcoming events from connected accounts.
- **Settings:** models, memory, Google connections, browser notifications,
  connected-app results and returned email-reply approval.

Optional scheduled DocYard handoff submits the saved run result; it never approves
an output. A retry retains the captured content and request key. Unknown external
writes require review. Remote service outages preserve cached results.

## Run all three apps

From this folder, after installing each sibling's dependencies and configuring its
owner password, database and environment:

```sh
nvm use
npm run dev:all
```

Open-agent uses port 3000, DocYard 3001 and CreativeNest 3002, all on IPv4 loopback.
Ctrl+C stops this launcher's process groups. You can instead run `npm run dev` in
separate terminals in each app folder. Their READMEs list their prerequisites.
The launcher does not start PostgreSQL or the AWS emulator. CreativeNest uses
MongoDB Atlas. Use `npm run dev:web` for web-only development without starting
open-agent's background worker.

## Connect Google

Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/google/callback`, and a 64-hex-character
`ENCRYPTION_KEY` in `.env.local`. Generate the key locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep it stable and backed up once accounts are connected. Enable Gmail and Google
Calendar APIs in your Cloud project. Create a Web application OAuth client with
the exact callback URI above and add your accounts as test users if the OAuth
app is in Testing. In Settings, click **Connect Google account** and complete the
consent flow. Multiple accounts can be added. Use `127.0.0.1` consistently to match the registered callback; do not switch hosts
midway through sign-in. A different service on this Mac currently occupies IPv6
`localhost:3000`, so add the exact IPv4 callback above in Google Cloud.

The app requests Gmail read-only, Gmail compose and Calendar read-only scopes.
Google’s compose scope also permits sending at the API level; the application
only exposes draft creation. A draft write interrupted by a timeout is not
silently retried: inspect Gmail drafts before attempting a fresh save.
Disconnecting removes the local token but does not revoke Google-side consent.
Google Testing mode can require reconnecting accounts periodically.

## Search and model limits

Web reading supports public HTML/text/XML/JSON pages; private-network URLs are
blocked. Public search tries DuckDuckGo and a Bing RSS fallback. Free endpoints
may block requests. For a dedicated search provider, optionally set
`BRAVE_SEARCH_API_KEY` in `.env.local`. Failures appear as tool errors, not invented
search results. Groq’s free limits apply per model call; one agent task can use
multiple calls. Rate-limit retries are bounded and respect cancellation. Large
histories, memory or mail digests may still exceed free-tier quotas.

## Development commands

| Command                 | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Migrate, run development web server and worker             |
| `npm run build`         | Turbopack production build                                 |
| `npm run build:webpack` | Webpack production build                                   |
| `npm start`             | Migrate and run production web server plus worker          |
| `npm run db:generate`   | Generate SQL after schema changes                          |
| `npm run db:migrate`    | Apply committed migrations. Requires Node 22.15.0.         |
| `npm run lint`          | ESLint                                                     |
| `npm run typecheck`     | TypeScript                                                 |
| `npm test`              | Offline automated tests using isolated temporary databases |
| `npm run format:check`  | Prettier check                                             |

The provider/app smoke scripts in `scripts/` make live network requests and are
intended for an isolated `DATA_DIR`, with the test app on port 3100. They create
disposable local data; they do not connect Google accounts or send email. They
are not part of `npm test`. Optional environment values are documented in the
example file. Initial builds may download Geist fonts; browser fonts are hosted
by the local app.

## Storage and extensions

The app database is Postgres at `127.0.0.1:5432`, database name `open_agent`.
Private storage and `.env.local` are ignored by Git. Stop both processes before
taking a backup. Memory is stored as files, and the model runs on this machine.

Memory is `data/memory/USER.md` and `MEMORY.md`. Add assistant skills as
`skills/<name>/SKILL.md`; one daily-planning example is included. New ad hoc
capabilities belong in `src/tools/` with Zod schemas and the existing approval
boundary. Vector retrieval is now an approved later phase; saved-content FTS and
macOS auto-start remain separate future options. They are not installed.

The current testing output budget is 512 tokens per model response, below the
account’s observed 1,000 output-token/minute limit. Set `AI_MAX_OUTPUT_TOKENS`
only within your provider’s limits. Long responses may need follow-up turns.

Chat requests use a default approximate input budget of 5,500 tokens, including
tool schemas. `AI_MAX_INPUT_TOKENS` can override it within your provider limits.
Older turns and long source excerpts are shortened only in model requests; the
full saved history is preserved. Resume a previously interrupted research reply
after updating the app to apply the new budget. Token estimates use a local
tokenizer with headroom for provider-specific differences.
