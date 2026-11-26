<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project requirements and documentation

Start with `docs/README.md`, then `docs/SPEC.md` and `docs/BUILD_PLAN.md`.
Read `docs/SCHEDULER.md` for scheduling changes and
`docs/DOCUMENT_SERVICE_INTEGRATION.md` for the separate product boundary.
`docs/ARCHITECTURE.md` and `docs/TECH_STACK.md` distinguish existing code from
approved future work; `docs/VALIDATION.md` is historical verification evidence.

Do not treat approved requirements as implemented features. The target removes
to-dos/Tasks/Activity; Scheduler stays in open-agent. The separate document-service
owns its dashboard, output selection and approvals. Remote result checks are
once on load/manual refresh, not periodic polling. Vector search is a later phase.

The user requires explicit final sign-off before requirements/design documents
are created or updated. The combined requirements update on 2026-11-10 was
explicitly authorized; it does not authorize code changes, data deletion or
creation of the sibling service. Later work follows the user's current scope.

The agent performs basic checks only; the user owns functional/live testing.
Do not run live model, Gmail, Calendar, Notion or publishing tests unless requested.
