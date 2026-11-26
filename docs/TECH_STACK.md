# Technology decisions

Updated 2026-11-15. Separate installed technologies from approved future work.
[Specification](SPEC.md) owns product requirements; installed dependencies and
source code own current implementation facts.

## Current open-agent stack

| Layer            | Current choice                                                            | Purpose                                             |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| Runtime          | Node.js 22.15.0 pinned in `.nvmrc`                                        | Project runtime                                     |
| App              | Next.js App Router, TypeScript, React                                     | Local UI and server APIs                            |
| UI               | Tailwind PostCSS, shadcn-style components, Lucide                         | Current component foundation                        |
| Agent            | LangGraph.js and LangChain.js                                             | Tool loop, checkpoints, approval interrupts         |
| Models           | `@langchain/groq` selected; `@langchain/xai` optional                     | Configurable everyday/reasoning models              |
| State            | Postgres chats and messages                                               | Saved conversations and approval decisions          |
| Operational data | Postgres database `open_agent` on 127.0.0.1:5432                          | Relational tables and migrations                    |
| Memory/skills    | Local Markdown files                                                      | User facts, notes and runtime skills                |
| Scheduler        | node-cron plus cron-parser, separate worker                               | Wake-up loop and IST occurrence calculation         |
| Notifications    | Browser notification permission in Settings                               | Local permission only                               |
| Google           | googleapis OAuth, Gmail and Calendar                                      | Read/search mail, approved drafts, read events      |
| Token encryption | Node crypto AES-256-GCM                                                   | Encrypted Google tokens at rest                     |
| Stocks           | yahoo-finance2 behind PriceProvider                                       | Quotes, previous-close rules, freshness checks      |
| Web              | DNS-pinned HTTP requests, Cheerio, public search fallbacks/optional Brave | Public-only research tools                          |
| Dates            | date-fns/date-fns-tz, Asia/Kolkata                                        | Consistent Indian times                             |
| Prompt budgeting | Bundled offline js-tiktoken estimate with headroom                        | Keep research context under provider limits         |
| Quality          | ESLint, Prettier, TypeScript, Vitest                                      | Basic/offline verification                          |
| Launch           | concurrently                                                              | App and worker together                             |

LangChain/LangGraph and relevant native/server libraries are externalized in
Next.js. Webpack production builds are available where Turbopack compiler sockets
are restricted. Model/tokenizer estimates differ from provider accounting; model
budgets are configurable and do not imply unlimited free-provider capacity.

## Implemented product boundaries and deferred work

| Area              | Current implementation                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Unified Scheduler | Internal module with lifecycle, source/result configuration and consolidated UI                                   |
| To-dos / Activity | Retired UI/tools; historical data retained                                                                        |
| Shared connector  | Implemented version-1 content receipt, client credentials, cached results and private downloads                   |
| Result refresh    | Once per full load plus manual refresh; no periodic cross-app polling                                             |
| DocYard           | Separate Next.js/PostgreSQL product; TXT/DOCX/PDF/Notion; Local/R2 storage; read-only preview and owner approvals |
| CreativeNest      | Separate Next.js/Atlas product; Groq, Nano Banana prompts, Sharp, local macOS speech and FFmpeg media exports     |
| Vector retrieval  | Deferred; no embedding model or vector backend installed                                                          |

No document renderer or Notion credentials are embedded in open-agent. The sibling
products' [current implementation records](IMPLEMENTATION_STATUS.md) describe their
installed technologies, physical schemas and remaining advanced capabilities.

## Configuration and credentials

Current server configuration includes `AI_PROVIDER`, `AI_MODEL`,
`AI_MAX_OUTPUT_TOKENS`, `AI_MAX_INPUT_TOKENS`, `DATA_DIR`, `GROQ_API_KEY`, optional
`XAI_API_KEY`, Google OAuth client/secret/redirect, `ENCRYPTION_KEY`, optional
`BRAVE_SEARCH_API_KEY` and optional LangSmith tracing settings. Real values belong
only in ignored local environment files. Do not print or copy them into docs.

The implemented connector uses `DOCYARD_URL`, `DOCYARD_CLIENT_TOKEN`,
`CREATIVENEST_URL`, `CREATIVENEST_CLIENT_TOKEN` and `CREATIVENEST_INBOUND_TOKEN`.
Matching tokens are configured privately on the receiving applications. Notion credentials
belong to document-service. Never copy credentials into docs or send mailbox/model keys across the product boundary.

## Decisions

- 2026-11-03: LangGraph/LangChain selected for resumable agent workflows and approvals.
- 2026-11-10: Groq selected for free-tier testing; xAI remains optional.
- 2026-11-10: Scheduler stays in open-agent; to-dos/Tasks/Activity retire in the target UI.
- 2026-11-10: Reusable document-service owns its dashboard, format/destination choices,
  document approvals, TXT/Word/PDF generation and Notion creation.
- 2026-11-10: Remote results refresh once on load/manual request; no background polling.
- 2026-11-10: Vector retrieval is future scope; operational relational storage stays.

- 2026-11-15: Implemented Scheduler, two sibling products and scoped cross-app returns.
  Groq/Atlas, optional R2, manual Nano Banana images and local speech/FFmpeg exports
  supersede earlier local-model-only/infrastructure-only implementation assumptions.
