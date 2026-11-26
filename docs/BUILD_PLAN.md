# Build plan and delivery status

Updated 2026-11-15. Read [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for
source-backed features and precise limitations. Checked items mean implemented and
verified at the stated level, not complete live-provider/user acceptance.

## Implemented core milestones

- [x] Next.js/LangGraph chat, checkpoints, memory, tools and approval boundaries.
- [x] Unified Scheduler; Tasks/Activity/to-do retirement with historical rows preserved.
- [x] Schedule lifecycle, editing/filter changes, run-now and missed-run review/history.
- [x] Existing stock monitoring represented without another polling loop.
- [x] Shared content handoff from chat, Gmail, stocks and saved Scheduler results.
- [x] DocYard receipt, immutable revisions, read-only preview, format/destination approval,
      durable PostgreSQL jobs, TXT/DOCX/PDF/Notion outputs and private downloads.
- [x] DocYard/CreativeNest scoped editing returns and fresh revision approval.
- [x] CreativeNest authoring/versions, Groq adapter and reviewed generation jobs.
- [x] Manual Nano Banana prompt/image-upload workflow, direct Sharp dependency.
- [x] Local narrator/character voices, WAV, silent MP4 and narrated MP4 with pan/zoom/fades.
- [x] Atlas/outbox/local SQS delivery, retained private S3/R2 references, playback ranges.
- [x] Scoped email-reply return and separate Gmail draft approval in open-agent.
- [x] Once-on-load/manual remote-result checks; cached results survive outages.
- [x] Offline checks/builds; explicitly requested live Notion and local-media flow checks.

## Required setup and acceptance still open

- [ ] Set owner passwords in DocYard and CreativeNest before normal dashboard login.
- [ ] User acceptance of live Groq access/result quality, Gmail/Calendar/briefs/digests,
      notifications, cross-app editing/document and Gmail-reply roundtrips.
- [ ] Live R2 object save/read behavior and broader document-language/layout validation.
- [ ] Operational backup/restore, upgrade and deployment verification.

## Remaining roadmap and target-design gaps

- [ ] Vector/semantic search, approved source retention/indexing and embedding/backend choices.
- [ ] Remotion/GSAP timeline/composition editing, reusable per-line audio assets,
      transcription/word captions, music mixing/beat timing, articulated motion/lip-sync.
- [ ] Arbitrary audio/video imports and optional hosted generation engines.
- [ ] Additional email/social platforms and separately approved publishing integrations.
- [ ] Full CreativeNest client/configuration-management APIs and stricter collection validators.
- [ ] Optional FTS and macOS auto-start. These are not prerequisites for current core use.

## Verification policy

Default agent checks are basic/offline. The user explicitly requested the Notion
and media live checks recorded on 2026-11-15; that is not blanket authorization
for future live Google/model/publishing tests. Requirements/design changes still
require explicit sign-off; this factual sync was requested by the user.

## Historical baseline

The original phase sequence below is retained for context. Old Tasks/to-do/Activity,
provider and path references describe that earlier baseline, not the current UI.

## Historical baseline build sequence

The original phases below explain how the existing baseline was built. References
to to-dos, Tasks/Activity, old folder paths and an optional vector upgrade are
historical; the revised scope and delivery sequence above supersede them.

## Phase 0: Setup (done)

- [x] Agree requirements (`docs/SPEC.md`)
- [x] Create `~/Desktop/Grok/grok-agent` and `docs/`
- [x] Pin Node 22.15.0 with `.nvmrc`

## Phase 1: Project foundation

1. Create the Next.js app (TypeScript, Tailwind, App Router, ESLint) inside `grok-agent`.
2. Install shadcn/ui, Prettier and Vitest.
3. Get an xAI API key from https://console.x.ai and add it to `.env.local`.
4. Set up folder structure: `src/app`, `src/lib`, `src/tools`, `src/worker`, `data/`, `skills/`.
5. Set up SQLite + Drizzle with the first migration.
6. Initialise git with a `.gitignore` covering `.env.local` and `data/`.
   **Done when:** `npm run dev` shows a blank app page.

## Phase 2: Chat and agent loop

1. Install `@langchain/core`, `@langchain/langgraph`, `@langchain/xai`, `@langchain/langgraph-checkpoint-sqlite`.
2. `getModel()` helper returning `ChatXAI` for Grok.
3. Agent graph in LangGraph (model node + tool node loop), with the SQLite checkpointer.
4. Streaming chat API route using LangGraph `streamEvents` over Server-Sent Events.
5. Chat UI with message list, input and tool-call display.
6. Chat history sidebar (each chat is a LangGraph thread).
7. First tools (LangChain `tool()`): current date/time (IST), web page fetch and summarise, web search.
   **Done when:** you can chat with Grok and it can summarise a pasted link.

## Phase 3: Memory and skills

1. `USER.md` and `MEMORY.md` loaded into the system prompt.
2. `remember` tool to update memory.
3. Skills loader for `skills/*/SKILL.md`.
4. A settings page to view and edit memory.
   **Done when:** it remembers a fact about you in a new chat.

## Phase 4: To-dos, reminders and notifications

1. Tables for todos, reminders and notifications.
2. To-do page plus chat tools (add, list, complete).
3. One-time and recurring reminders (daily, weekly, custom).
4. Worker process with `node-cron`; `npm run dev` starts app and worker together.
5. Notification bell, toasts and browser notifications via Server-Sent Events.
   **Done when:** "remind me in 2 minutes" pops a notification.

## Phase 5: Missed jobs

1. Job runs logged in the database with scheduled and actual times.
2. On startup, detect jobs missed while the app was off.
3. A "Missed jobs" screen where you pick which to run and which to skip.
   **Done when:** after restarting, missed reminders are listed and nothing runs without your pick.

## Phase 6: Stock alerts

1. `PriceProvider` interface with a Yahoo Finance implementation (NSE/BSE symbols).
2. Alerts table: target price or % move, direction, active or triggered.
3. Alerts page plus chat tool ("alert me if Infosys drops 3%").
4. Worker checks every few minutes on weekdays, 9:15 AM to 3:30 PM IST.
   **Done when:** a test alert fires in the app.

## Phase 7: Gmail (multiple accounts)

1. Create a Google Cloud project, enable the Gmail API, and set up the OAuth consent screen (you do this with my guidance).
2. "Connect Gmail account" flow; add multiple accounts; tokens encrypted in SQLite.
3. `MailProvider` interface with a Gmail implementation.
4. Tools: summarise inbox, read a thread, create a draft reply (no sending).
5. Daily email digest as a scheduled LangGraph workflow.
6. Approval step (LangGraph interrupt) before any draft is saved.
   **Done when:** it summarises unread mail across two accounts and saves a draft.

## Phase 8: Google Calendar and morning brief

1. Add the Calendar read-only scope to the Google sign-in.
2. Tool for today's and upcoming events.
3. Morning brief as a LangGraph workflow: tasks + events + email digest + stock alerts in one notification and chat.
   **Done when:** the morning brief shows up at your chosen time.

## Phase 9: Ad hoc tasks

- Add tools or skills one at a time as you name them.

## Phase 10: Polish

- Settings page (model, brief time, digest time, timezone).
- Error handling, retries, logs and basic tests.
- Optional: start automatically at login with a macOS launch agent.

## Optional: Search upgrades

1. Email keyword search tool across all Gmail accounts (part of Phase 7).
2. FTS5 full-text search over saved social posts, articles and notes.
3. Semantic search with `sqlite-vec` if keyword search isn't enough.
