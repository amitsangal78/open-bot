# Document-service integration requirements

Status: approved integration boundary, synchronized with implemented connectors on
2026-11-15. DocYard and CreativeNest now exist as sibling applications. Read their
implementation records for concrete APIs and limits; future capabilities are not implied.

## Independent, reusable product

DocYard lives in `../DocYard`, with its own PostgreSQL database, dashboard, worker,
configuration and private Local/R2 storage. Its loopback port is 3001; open-agent uses
3000 and CreativeNest uses 3002. Each product has independent lifecycle and credentials.
No files or Notion generation code should be placed in open-agent to stand in for
this separate product. It must also support integration from other applications.

| Responsibility                                                                 | Owner                |
| ------------------------------------------------------------------------------ | -------------------- |
| Chat, Gmail, Calendar, stocks and research                                     | Open-agent           |
| Schedule timing, source collection, content preparation and user notifications | Open-agent           |
| Explicit handoff and references attached to the originating chat/run           | Open-agent connector |
| Receiving submissions and presenting read-only content                         | DocYard dashboard    |
| Selecting TXT, Word, PDF, Notion or future formats and destinations            | DocYard              |
| Approval to generate/publish and the execution of that decision                | DocYard              |
| Files, output history, Notion credentials and any generated-document search    | DocYard              |
| Cached submission status and output links                                      | Open-agent           |

The second app's dashboard is required. The earlier API-only/no-dashboard idea
is superseded by the approved decision to choose formats and approve work there.

## One reusable connector in open-agent

Chat, Gmail, Stocks and Scheduler must use one common server-side connector, not
four independent integrations. Expose the same submission capability as an
approved assistant tool and a deliberate UI handoff where appropriate. The user
can send a selected response/message/result or explicitly prepared summary.
A scheduled handoff must be configured by the user; ordinary reads are not exports.

The service receives only the necessary content snapshot. It must not query
open-agent's SQLite file, fetch from its mailbox on its behalf, receive Gmail/model
secrets, or require knowledge of open-agent's internal tables. Notion credentials
belong to the service. Credentials are never sent from browser code.

## Shared content envelope: required concepts

Every integration, including future clients, uses the same format-independent
submission shape. The current version-1 shape is implemented in the products’ content-envelope schemas;
these remain the required meanings:

| Concept                      | Meaning                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| Contract/schema version      | Allows compatible evolution and explicit rejection of unsupported input  |
| Authenticated client ID      | Which connected application owns the submission; bound to its credential |
| Stable client submission key | Makes retrying the same handoff idempotent                               |
| Origin references            | Client source kind and opaque item/run IDs for linking results back      |
| Title and prepared content   | User-selected content organized into common blocks/sections              |
| Source references            | Provenance and URLs/identifiers relevant to the content                  |
| Content/source timestamps    | Capture time and, for stocks, quote time and currency                    |

A content model must be independent of output format. It should cover text,
headings, lists, tables and source references without accepting executable code,
filesystem destinations, arbitrary renderer HTML or automatic remote-asset fetches
as instructions. Raw Gmail identifiers need not be publicly usable links.
Do not require an output type, Notion parent page or a generation-approval flag
just to submit content. Those decisions happen after receipt in the second app.
Attachments, physical printing and mailbox-wide transfers are not implied by this
initial handoff feature.

## Submission, approval and multiple outputs

1. An explicit user request or configured schedule authorizes content handoff.
2. Open-agent prepares a snapshot and sends it with client identity and a stable key.
3. The service acknowledges receipt with its unique submission ID.
4. The user opens the second dashboard to review read-only content, choose one or
   more outputs and destinations, and approve generation or publishing there.
5. The service owns execution and returns zero, one or several output references
   for the same submission. PDF + Word + Notion can coexist.
6. Open-agent presents those references in the originating chat or Scheduler run.

Submission authorization is not approval to create a file or a Notion page.
Open-agent must not implement a second document-approval gate after submission,
choose an output automatically, or trigger publishing through a status refresh.
Existing approvals for Gmail drafts and schedule changes remain in open-agent.

## Status synchronization: keep the first version simple

At full app load, check known submissions once and cache the returned statuses
and output links. Provide manual Refresh results. This is a bounded read operation;
a paginated/batched response is still one load-time synchronization, not polling.
Re-rendering, navigating tabs and receiving unrelated notification SSE events
must not restart it automatically.

No intervals, background polling, webhooks, recurring checking schedules or
completion-alert jobs are required. Do not reuse the existing workspace refresh
interval for remote document-service checks. The second dashboard is authoritative;
open-agent reflects what it last received and shows the last checked time.

Results must be a collection with enough metadata to distinguish output IDs,
kinds, titles, statuses, creation/update times and download/page links. Version
information can be displayed if supplied by the service; open-agent does not
need its own document-version system. Per-output failures must not hide successful
siblings. Preserve unfamiliar future kinds with a generic display/link rather
than failing the entire submission.

If the service cannot be reached, keep cached results and show refresh failed.
Do not change a cached remote status to failed, drop links, resubmit content or
create a Scheduler entry. Empty results can mean that no outputs have been
selected/approved yet; it is not necessarily an error.

## Authentication, isolation and retry requirements

- Each client has a separate ID and access token. The service validates identity
  from authentication and restricts submission/result access to that client.
- Version the API; record compatibility expectations before building the adapter.
- Store service URLs/tokens server-side. Do not add real secrets during this docs update.
- Enforce input limits and treat content/source URLs as untrusted data, not commands.
- Retrying the same client key with identical content returns the same submission;
  using that key for changed content must produce a conflict, not silently replace it.
- A timeout after submitting means the outcome may be unknown. Reconcile that
  key before trying another logical operation. A deliberate same-key retry reuses the saved
  snapshot and the receiver’s idempotent receipt operation. Status refreshes are read-only.
- Persist the snapshot/key and acknowledgement before reporting handoff success.
- Implemented receipt/status routes include `POST /api/v1/submissions`,
  `POST /api/v1/submissions/status-query` and scoped output download routes. Read
  [DocYard implementation status](../../DocYard/docs/IMPLEMENTATION_STATUS.md) for details.

## Storage and acceptance

Open-agent stores only needed handoff snapshots/retry state, source associations,
submission IDs, cached statuses and output references. It does not duplicate all
service files or its database. Keep the snapshot only as long as required by the
agreed retry/retention policy. Cleanup must be explicit and coordinated with
source deletion and future indexing rules.

Acceptance: all four open-agent sources submit the common envelope through one
connector; submission creates no output; approvals and format choices occur only
in the second dashboard; multiple outputs link back correctly; retries do not
duplicate submissions; refresh occurs once on load or explicitly; service outages
preserve cached results; clients cannot access each other's submissions.

The DocYard repo contains its approved product/design docs and current executable API. This file remains the authoritative description of open-agent's use of
that service. Resolve contract changes across both repositories explicitly rather
than maintaining silently divergent schema copies.

## Implemented editing and email returns

DocYard never edits content. Its owner can send a revision to CreativeNest in a new tab.
A scoped proof binds the returned content to that original submission; it creates a
fresh revision and transfers no output approval. CreativeNest can also submit newly
authored content to DocYard through the common envelope.

For Gmail, open-agent registers the original account/thread and a proof before handoff.
CreativeNest returns only selected saved reply text. It gains no mailbox tokens and
cannot save/send mail. open-agent requires separate owner approval before draft saving.
The proof is server-side payload data, not a browser URL credential.
