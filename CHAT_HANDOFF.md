# Three-app project handoff

Updated 2026-11-15 (Asia/Kolkata). This compact handoff replaces the need to read
the long development chat. Do not import or search that old chat for routine work.
Read the relevant app's current implementation record and source when needed.

## Workspace and runtime

Three independent sibling applications live under `/Users/amitsangal/Desktop/chatGPT`:

- `open-agent`: Next.js assistant, port 3000, Postgres database `open_agent`.
- `DocYard`: document service/dashboard, port 3001, native PostgreSQL 18 on port 5432.
- `CreativeNest`: content/media workspace, port 3002, MongoDB Atlas.

Use nvm Node **22.15.0**, not the system Node 20. Applications have separate databases,
workers, private configuration and lifecycle. No shared database access between apps.
The configured local AWS emulator uses HTTPS on port 9297 with its trusted CA and
its dedicated credentials; emulated SQS delivers CreativeNest jobs. Private asset
storage can use the local S3 emulator or explicitly selected Cloudflare R2. Never
fall back to real AWS. Do not print keys, tokens or connection strings.

## Product decisions

**open-agent** owns streaming chat, research, Markdown memory/skills, Gmail/Calendar,
stocks, Scheduler and notifications. The menu is Chat / Scheduler / Stocks / Inbox /
Calendar / Settings. To-dos and Tasks/Activity UI/tools are retired; historical data
was preserved. Explicit schedules support reminders, briefs/digests, Gmail searches,
research and stock fetches, plus optional content handoff. Missed work waits for the
owner's decision. Stock monitoring retains one worker execution owner.

**DocYard** receives prepared content, lists it, previews it read-only, lets the owner
choose multiple TXT/Word/PDF/Notion outputs, obtains approval, creates and displays
results. Receipt alone creates nothing. Editing opens CreativeNest in a separate tab.
Returned edits create a new immutable revision with fresh approval required. Files
use private Local/R2 storage; Notion pages retain separate references. Confirmed
local deletion does not delete remote Notion pages.

**CreativeNest product target, 2026-11-23:** it is a storyboard studio, not App 3.
The owner creates a storyboard, or a dashboard-registered client submits one.
Five pipelines follow approval: image creation, animation with voice, YouTube
Shorts, YouTube videos, and Instagram Reels. Publishing waits for a separate
approval. That target is not built. The paragraph below is the software that exists.

**CreativeNest, as built:** receives content from other apps or starts direct projects; edits
working drafts; saves immutable versions; and processes an explicitly reviewed saved
version. It prepares stories, email replies, YouTube/Instagram text packages, study
storyboards, narration and scene/character descriptions. Text uses the existing
`AI_PROVIDER=groq`, `AI_MODEL`, `GROQ_API_KEY` configuration. Do not silently change
the user's selected model or assume configured credentials prove live access.

Image workflow is **Nano Banana prompts → owner creates images externally → uploads
them into CreativeNest**. There is no active image-generation API integration.
Sharp 0.35.5 is a direct dependency for validation, normalization and frame preparation.

Local media generation is implemented: macOS speech voices for narrator/characters;
FFmpeg/FFprobe for audio-only WAV, silent MP4 and narrated MP4. Motion is pan/zoom/fades
of uploaded images; missing images become labelled storyboard cards. Select installed
voices, use `Character name: dialogue`, save a version, review and approve export.
Audio timing is measured. Private playback supports HTTP byte ranges and downloads.
Limits include twelve scenes/five minutes; ratios 16:9, 9:16 or square. Full prompt
packs are limited to six scenes; per-scene prompt actions support larger boards.

## Integration rules

- Selected chat/email/stock/Scheduler content uses a common version-1 envelope.
- Service clients authenticate server-to-server and use stable request keys/hashes.
- Each app owns its own approvals; a handoff never grants document generation,
  processing, Gmail draft saving or publication approval in another app.
- DocYard editing and email returns use scoped original relationships/proofs.
- CreativeNest returns reply text to open-agent, which validates original account/thread
  metadata and requires separate owner approval before Gmail draft saving.
- No email sending or automatic social publishing. Future Outlook/social providers
  must preserve these boundaries.
- Cross-app results refresh once on load or manually, with cached results retained
  during outages. No periodic cross-app result polling or status webhooks.
- An ambiguous external write is retained for reconciliation, not blindly regenerated.

## Implemented and verified evidence

The latest recorded implementation checks passed:

- open-agent: 30 offline tests, TypeScript, lint, formatting and production build.
- DocYard: 12 offline tests, TypeScript, lint and production build.
- CreativeNest: 21 offline tests, TypeScript, lint and production build.
- Basic app/database health checks passed.
- At the user's explicit request, a clearly labelled Notion test passed receipt,
  approval, targeted worker page creation and complete content read-back.
- Real WAV, silent MP4 and narrated MP4 were generated. Streams/durations, nonzero
  audio levels and changing video-frame hashes were verified.
- An isolated authenticated media flow passed scene-image upload, saved-version
  approval, Atlas persistence, emulated SQS delivery, actual rendering, local S3
  storage, private downloads, HTTP 206 playback and rejection without authentication.
  Test files/project were retained; superseded pending test attempts were cancelled.
- Media-flow tests used local emulator storage, not live R2 or hosted generation.
- Documentation was synchronized across all three apps. Local links/formatting in
  25 Markdown documents passed; configured credential values were checked not to appear.
  A stale media-tab Planned badge was removed and lint passed.

## Remaining work / honest completion boundary

Core implementation is present; the entire roadmap is **not** complete.

- Owner passwords in DocYard and CreativeNest were still unset at the latest check.
  Run `nvm use` then `npm run owner:password` in each for normal dashboard access.
  Temporary media-test authentication did not modify the user's password files.
- Live Groq access/result quality, Gmail/Calendar, R2 storage and full cross-app
  editing/document/email-return acceptance still need user testing.
- CreativeNest's full client/configuration administration and richer MongoDB collection
  validators remain incomplete. Current database validation primarily requires string
  IDs; application Zod schemas validate content. Some settings remain environment-based.
- Vector/semantic search, FTS, additional providers, automated social publishing and
  macOS auto-start remain future work.
- Remotion/GSAP timeline editing, reusable per-line audio assets, arbitrary audio/video
  imports, music mixing, transcription/word captions, beat sync, articulated character
  motion and lip-sync remain future work. Do not describe these as implemented.
- Broader document-language/layout checks, backup/restore and production deployment
  acceptance remain outstanding. This is a local single-owner system.

## Run and inspect

From each app, `npm run dev` starts its web server and worker. From open-agent,
`npm run dev:all` starts all three after prerequisites. It does not start PostgreSQL
or the AWS emulator. Check occupied ports rather than terminating unrelated processes.

Read `AGENTS.md` and the app's `docs/README.md` first, then its implementation
record: `docs/IMPLEMENTATION_STATUS.md`, or `docs/delivery/FEATURE_AUDIT.md` in
CreativeNest.
Approved PRD/architecture/database/API documents include future targets; source and
implementation records determine what exists. Historical validation is dated evidence,
not proof of new tests. Read relevant installed Next.js guides before code changes.

Explicit manual media tests are `npm run media:smoke` and `npm run media:test-flow`
in CreativeNest. They are not part of routine offline tests. Samples were saved under
`/private/tmp/creativenest-media-smoke`; test data was not deleted automatically.

## Standing user preferences

- Be concise and explain the architecture/flow clearly when asked.
- Requirements/design document changes need explicit final sign-off. The user explicitly
  authorized the latest factual implementation/documentation sync; this is not blanket
  approval for new scope/design decisions.
- The agent performs basic/offline checks by default; the user owns functional testing.
  Live media/Notion tests were specifically requested, not blanket live-test authorization.
- Preserve existing data/configuration and never expose credentials.
- Sibling writes may require filesystem approval because the writable workspace is
  open-agent. Prepare/check changes before requesting that required filesystem access.

No next development task is selected by this handoff. Wait for the user's next request.
