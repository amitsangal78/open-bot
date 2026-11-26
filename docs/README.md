# Documentation map

Read [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) first for implemented
features, physical source locations, verification and remaining work, synchronized
2026-11-15. Requirements and target designs do not prove feature completion.

## Reading order

1. [SPEC.md](SPEC.md): product requirements and three-app ownership boundaries.
2. [BUILD_PLAN.md](BUILD_PLAN.md): delivery status and remaining acceptance work.
3. [SCHEDULER.md](SCHEDULER.md): internal Scheduler behavior and lifecycle.
4. [DOCUMENT_SERVICE_INTEGRATION.md](DOCUMENT_SERVICE_INTEGRATION.md): reusable handoff,
   separate approvals, result refresh and editing/reply-return boundaries.
5. [ARCHITECTURE.md](ARCHITECTURE.md): runtime and integration architecture.
6. [API.md](API.md): target HTTP API. It is not the running routes.
7. [FEATURE.md](FEATURE.md): build order for this version.
8. [PROGRESS.md](PROGRESS.md): status of each feature.
9. [TECH_STACK.md](TECH_STACK.md): installed technologies and deferred choices.
10. [VALIDATION.md](VALIDATION.md): dated checks, including historical evidence.

The root [README](../README.md) explains launch/configuration. [AGENTS.md](../AGENTS.md)
records agent rules. Read installed Next.js guides before changing application code.

## Current ownership

- open-agent owns source gathering, Gmail/Calendar, stocks, Scheduler and notifications.
  Its menu has no Tasks/Activity; to-dos are retired without deleting historical data.
- [DocYard](../../DocYard/docs/README.md) owns read-only preview, TXT/Word/PDF/Notion
  selection, document approval, generation and output references.
- [CreativeNest](../../CreativeNest/docs/product/PRD.md) is its own product as of
  2026-11-23: a storyboard studio with five pipelines. The code still running is
  the earlier studio in its feature audit. Client registration, YouTube publish,
  and Instagram publish are not built.
- DocYard's edit action and open-agent email-reply return still describe the
  software built before that change. Receipt alone creates no output.
- Postgres database `open_agent` is the operational storage. Vector search is deferred.

The user's request authorized a factual implementation sync on 2026-11-15.
Future requirements/design changes still require explicit final sign-off. Agent-run
checks remain basic unless the user requests a specific live test, as they did for
Notion and media. Preserve earlier dated validation as historical evidence.
