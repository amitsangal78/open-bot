# Validation records

## Current recorded evidence — 2026-11-15

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and the sibling records.
This documentation sync does not rerun application/provider tests.

| App          | Latest recorded offline checks                                   | Additional observed evidence                                                                                              |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| open-agent   | 30 tests, TypeScript, lint, formatting, production Webpack build | Basic web/database health; Scheduler lifecycle/configuration and captured handoff retry tests                             |
| DocYard      | 12 tests, TypeScript, lint, production build                     | Native PostgreSQL setup; explicitly requested Notion receipt/approval/creation/read-back test                             |
| CreativeNest | 21 tests, TypeScript, lint, production build                     | Real WAV/silent MP4/narrated MP4; isolated authenticated upload/version/approval/SQS/render/S3/download/range-access flow |

CreativeNest media validation used the local AWS emulator and Atlas, not live R2
or hosted generation. Video streams/durations, audible audio levels, changing frame
hashes and portrait H.264/AAC output were observed. Test authentication was temporary;
normal owner passwords remained unset. The Notion test used labelled harmless content,
a stable receipt key and one targeted approved job; it did not process Gmail content.

Live Groq quality/model availability, Gmail/Calendar behavior, R2, full cross-app
editing/email roundtrips and broad user acceptance are not established by these checks.
Historical Groq/Yahoo/Google observations below must not be treated as new verification.

---

# Historical validation record (2026-11-10)

Scope: historical evidence for the existing implementation. The approved
Scheduler/to-do retirement, reusable document-service integration and future
vector roadmap in [SPEC.md](SPEC.md) are documentation-only changes and have not
been implemented or validated by this record. The user subsequently reported
Google account connection; live mail/calendar testing remains user-owned.

The v1 implementation is present. The following records observed checks, not a
claim that every external account/provider has been exercised.

## Passed

- Production Webpack build, TypeScript and ESLint.
- 21 offline automated tests: persistence, migration replay, foreign keys,
  cron in IST, missed-job enumeration, crash recovery, worker leases, approval
  checkpoint reopening, approval/rejection without duplicate writes, memory,
  token encryption/tamper rejection, public-address filtering, market sessions,
  stock thresholds and one-time alert delivery, ambiguous/successful draft replay.
- Live Groq model reply and tool proposal. Approved task creation, streamed
  continuation (56 token events), reopened state and no duplicate writes.
- Live reminder delivered an in-app notification through the worker in an
  isolated temporary workspace.
- Live Yahoo quote and public article extraction.
- Public search returned five results after adding text/XML RSS support.
- Production UI loaded with Groq selected and worker running. Task and Settings
  screens inspected in the browser. Cross-origin mutation requests rejected.
- Production page returns HTTP 200 and framing protection; database health is ready.

## Provider/configuration findings

Groq rejected a 2,048-token request because this account reported a 1,000
output-token/minute limit. The testing budget is now 512 via
`AI_MAX_OUTPUT_TOKENS`. Transient rate-limit retries are bounded; oversized
requests fail with guidance instead of waiting indefinitely. Free quotas can
still delay agent turns, and long replies may require follow-up turns.

Another local service answers IPv6 `localhost:3000`, while this app binds
`127.0.0.1:3000`. Google redirect configuration is standardized to:

`http://127.0.0.1:3000/api/google/callback`

Add this exact URI to the Google Cloud Web OAuth client. The application does
not alter the unrelated IPv6 service.

## Requires user account consent

Google OAuth, Gmail read/search/drafts/digests, and Calendar/brief code are
implemented. They have not been verified against the user's actual accounts.
Complete **Settings → Connect Google account** after registering the IPv4
callback. No live email draft was created and no email was sent during testing.
Token crypto and draft-write replay protections were verified with test data.

Ad hoc tasks beyond the included skill remain undefined by the user. Optional
semantic search, saved-content FTS and macOS auto-start are future extensions.

## Final build notes

The everyday Qwen configuration disables thinking so the small testing output
budget is spent on user-visible answers and tool calls. Write tools now use
explicit typed fields (create task, update task, create reminder, create alert,
remember, cancel schedule and save draft) rather than a JSON string action.
LangChain/LangGraph dependencies are externalized in Next.js to preserve a single
native server runtime. The final build, lint, formatting, TypeScript and 21 offline
tests passed after these changes. The last requested live end-to-end test was
declined, so the final typed-tool build is not recorded as live-verified. The
production app and worker were launched; the isolated test instance was stopped.

## Chat input-limit fix

A saved research run failed with Groq HTTP 413: 8,241 requested input tokens,
above the account's 7,000 input-token limit. The generic error hid that cause.
Chat now applies a configurable approximate 5,500-token prompt budget, counting
tool definitions and using a bundled offline tokenizer. Older turns and long
source excerpts are shortened in the outgoing request only; stored checkpoints,
user messages, tool arguments and call/result pairing are preserved. Provider
HTTP 413 errors now receive specific guidance rather than a generic failure.

Offline replay preparation of the saved run reduced the estimate from 7,458 to
4,324 tokens without changing its saved messages or invoking a model/tool. The
installed model's tokenizer differs, so the request budget leaves headroom.
26 automated tests, lint, TypeScript, formatting and the production build pass.
The app/worker were restarted. No live model, Gmail or Calendar request was made
for this fix; the user can reopen the interrupted conversation and resume it.
