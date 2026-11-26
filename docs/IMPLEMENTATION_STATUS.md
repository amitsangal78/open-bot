# Current implementation and remaining work

Last synchronized with source: **2026-11-15, Asia/Kolkata**.
This is an implementation inventory, not a declaration that the entire roadmap or
all live-provider workflows are complete. The user authorized this factual documentation
synchronization. Future requirements/design changes still need final sign-off.

## Three-product ownership

| App          | Runtime/data                                        | Owns                                                                                             |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| open-agent   | Port 3000; SQLite/Drizzle and LangGraph checkpoints | Chat, research, Gmail/Calendar, stocks, Scheduler, notifications and approved handoffs           |
| DocYard      | Port 3001; independent native PostgreSQL 18         | Read-only revision review, format/destination selection, approvals, TXT/DOCX/PDF/Notion creation |
| CreativeNest | Port 3002; independent MongoDB Atlas                | Code on 2026-11-15: authoring, Groq text, Nano Banana prompts, local media. Product target from 2026-11-23 is five storyboard pipelines and is not built |

DocYard does not edit content. It opens CreativeNest in a separate tab; returned
content creates a fresh immutable DocYard revision requiring fresh output approval.
CreativeNest returns email replies to open-agent for separate approved Gmail draft
saving. No app exposes email sending or automatic social publishing.

Read the [DocYard implementation record](../../DocYard/docs/IMPLEMENTATION_STATUS.md)
and [CreativeNest implementation record](../../CreativeNest/docs/delivery/FEATURE_AUDIT.md)
for their current APIs, physical schemas and implementation limits.

## Implemented in open-agent

- The menu is Chat, Scheduler, Stocks, Inbox, Calendar and Settings. Tasks/Activity
  and to-do tools are retired; historical `todos` rows remain preserved.
- Streaming LangGraph chat, history/checkpoints, approval interrupts, cancellation,
  Markdown memory/skills and bounded model context are implemented. Groq is selected;
  xAI remains optional. Provider quota/model availability is not guaranteed by configuration.
- Scheduler supports reminder, morning brief, digest, Gmail search, research and
  stock-fetch jobs. Create/edit/pause/resume/run-now/cancel share backend operations.
  Editing covers timing, filters, account selection and result handling.
- Schedules have active/paused/completed/cancelled lifecycle. Run history distinguishes
  missed/running/done/skipped/failed/needs_attention. Missed work waits for Run/Skip.
- Occurrence IDs, leases, captured run configuration and saved prepared results support
  replay protection. An uncertain scheduled handoff retries the same captured payload/key.
- Stock monitoring appears as a system row in Scheduler; the existing market-hours
  worker branch remains its single execution owner. It is not a second polling schedule.
- The notification bell and Settings own delivered alerts and browser permissions.
- Multi-account Google OAuth, Gmail search/read/approved draft saving and read-only
  Calendar are implemented. Actual mailbox/calendar acceptance testing remains user-owned.
- Chat, selected email, stock quotes and Scheduler results use the same connector.
  A handoff receives content only; it never approves a document or starts processing.
- Remote results check once on full load/manual refresh, retain caches on outage, and
  expose authenticated DocYard downloads/Notion links. There is no periodic cross-app polling.
- Email lineage records bind CreativeNest replies to the original account/thread and
  a proof. Returned text remains pending until the owner approves Gmail draft saving.

## Implementation map

| Area                               | Source                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Scheduler domain and worker        | `src/lib/jobs/scheduler.ts`, `src/worker/index.ts`                                |
| Approval-gated actions/tools       | `src/lib/actions.ts`, `src/tools/index.ts`                                        |
| UI                                 | `src/components/assistant-app.tsx`, `scheduler-view.tsx`, `integration-panel.tsx` |
| Shared connector and reply lineage | `src/lib/integrations.ts`, `src/lib/replies.ts`                                   |
| Operational tables                 | `src/lib/db/schema.ts`                                                            |
| Additive migrations                | `drizzle/0002_scheduler_integrations.sql`, `0003_reply_handoffs.sql`              |
| API                                | `src/app/api/workspace`, `integrations`, `integrations/download`, `v1/replies`    |
| Multi-app launcher                 | `scripts/dev-all.mjs`                                                             |

Added operational tables include `handoffs`, `mail_sources`, `reply_origins` and
`returned_replies`; schedule/run fields store lifecycle, configuration and results.
The database is conventional relational SQLite. There is no installed vector index.

`GET /api/integrations` reads cached handoffs/replies. `POST` supports submit,
refresh, same-key handoff retry and owner-confirmed reply approval. Service replies
use authenticated `/api/v1/replies` and `/api/v1/replies/{id}`. Payload definitions
are authoritative in source; tokens never belong in browser requests or documents.

## Verification evidence

- Latest recorded open-agent checks: **30 offline tests**, TypeScript, lint, formatting
  and a production Webpack build passed on 2026-11-15. These were not rerun for this
  documentation-only synchronization.
- Scheduler tests cover pause/resume, captured configuration during edits, and uncertain
  handoff retry without replacing prepared Gmail-run content.
- Basic web/database health passed. This does not establish live Gmail/Calendar behavior.
- At the user's explicit request, DocYard's live Notion receipt/approval/creation/read-back
  flow and CreativeNest's local media flows were tested. Those results do not validate
  every other integration. See the separate products' implementation records.

## Setup and remaining work

- Owner passwords in DocYard and CreativeNest were still unset at the latest check.
  Run `nvm use` and `npm run owner:password` in each app before normal dashboard login.
- Start each app with `npm run dev`, or run `npm run dev:all` here after prerequisites.
  The launcher does not start PostgreSQL or the AWS emulator. Work requires running workers.
- Complete user acceptance testing for live Groq processing, Gmail/Calendar and reply-return
  workflows, cross-app editing/document roundtrips, notifications and R2 storage. Implemented
  adapters and filled credentials are not proof that these live flows passed.
- Vector/semantic search, FTS, extra email/social providers, publishing, and macOS auto-start
  remain future work. Advanced media limitations are recorded in CreativeNest.
- This is a local single-owner implementation, not a completed hosted/multi-user deployment.
