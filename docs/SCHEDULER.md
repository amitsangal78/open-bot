# Scheduler requirements and implementation boundary

Status: approved requirements, synchronized with implementation on 2026-11-15.
See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for evidence and limits.
Product authority: [SPEC.md](SPEC.md).

## Purpose and navigation

One Scheduler inside open-agent owns when explicitly requested work runs and how
its runs are tracked. It replaces Tasks in the left menu. Activity is removed;
its missed-job and history functions move here. Ordinary to-dos and their chat
capabilities are retired, not relocated into Scheduler. Historical data is not
purged without separate authorization.

The notification bell owns delivered alerts and mark-as-read. Settings owns
browser notification permissions. No second Scheduler or status-check schedule
is introduced in document-service.

## Implemented baseline

| Area           | Implementation                                                                 |
| -------------- | ------------------------------------------------------------------------------ |
| UI             | Scheduler: Schedules, Needs attention and Run history                          |
| Domain/process | `src/lib/jobs/scheduler.ts`, separate `src/worker/index.ts`                    |
| Persistence    | SQLite schedules, job_runs, leases and handoff associations                    |
| Kinds          | reminder, brief, digest, gmail, research, stock                                |
| Controls       | Create/edit/pause/resume/run-now/cancel through shared actions                 |
| Lifecycle      | active, paused, completed, cancelled                                           |
| Run outcomes   | missed, running, done, skipped, failed, needs_attention                        |
| Recovery       | Explicit review of missed/interrupted work; no automatic historical replay     |
| Results        | Captured configuration/prepared results, optional notification/DocYard handoff |
| Stock polling  | Virtual system row; one existing market-hours worker branch                    |

The Scheduler is an internal module, not a separate published library. To-do UI/tools
and their brief inputs are removed; historical rows remain. Edit and retry behavior
have offline tests. Live scheduled-provider acceptance remains user-owned.

## Listing and job types

All schedules created via chat, forms or approved system configuration use this
same listing. Do not create recurring work just because an ordinary request was
made. System stock monitoring must be visible without scheduling an additional
polling loop per UI row or alert.

| Type                   | Example                                   | Source configuration                                         |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| Reminder/notification  | Remind me tomorrow at 10 AM               | Message and trigger time                                     |
| Gmail fetch/search     | Fetch bank emails every Friday            | Explicit account selection, query and reporting window       |
| Email digest           | Prepare a daily unread-mail summary       | Accounts, filters, period and summary instruction            |
| Data fetch/research    | Fetch a named source each morning         | Registered provider/tool and validated parameters            |
| Stock monitoring/fetch | Watch configured alerts                   | Symbols/rules, market-hours policy and freshness constraints |
| Morning brief          | Summarise my morning                      | Calendar, email, reminders, scheduled work and stock context |
| Content handoff        | Send a scheduled result to the second app | An explicit handoff flag/destination client configuration    |

A content handoff is result handling, not a renderer. Scheduler must not ask for
TXT, Word, PDF or Notion as required scheduling parameters. The second app decides
those after receiving the content. General fetching means registered tool/provider
handlers, not arbitrary shell commands or stored executable code.

## Views and controls

- **Schedules:** name, type, source/filter summary, recurrence/timezone, next run,
  schedule status, last run outcome and latest result link.
- **Needs attention:** every missed/failed/uncertain run, scheduled time, reason,
  and the permitted Run/Retry or Skip decision. No hidden automatic replay.
- **Run history:** scheduled/actual times, execution status, error, saved result
  and any linked document-service submission/results.

Create, edit, pause/resume, run now, and delete/cancel must use the same backend
operations whether initiated in the UI or through approved chat tools. Show the
concrete proposed change before confirming a write. Do not delete run history
when a schedule is cancelled. Editing affects future occurrences, not snapshots
of already-created runs. Running work is not silently cancelled by an edit.

## States and timing rules

The implemented schema separates schedule lifecycle from run outcomes:

- Schedule: active, paused, completed, cancelled.
- Run: queued, running, succeeded, missed, failed, skipped; distinguish an uncertain
  external submission when its outcome is unknown.

The stored success name is `done`; existing records remain readable. An active schedule can have a failed latest
run; do not conflate these two statuses. Pending document approval is a remote
submission status, not a failed schedule execution.

Use Asia/Kolkata initially. Support a one-time future instant, daily/weekly
recurrence and validated five-field cron. Show the first run and repeat rule
clearly. Pausing prevents future dispatch and creates no missed-run backlog for
the intentionally paused period. Resuming chooses the next future occurrence.
A one-time reminder whose chosen time passed while paused must request a new
future time or explicit Run now, not silently execute.

Real downtime/sleep or a crash marks affected work for user review. Preserve every
missed occurrence using bounded enumeration batches. A manual run does not
silently move the recurring schedule's next occurrence or replay older ones.
Use a stable occurrence ID and exclusive worker/run claims to prevent duplicates.

## Result handling and the second app

A schedule may save its result, notify the user, and/or explicitly submit that
result through the common document connector. Source collection and any requested
summary happen in open-agent. Document generation and Notion approvals happen in
the second dashboard, not in a Scheduler dialog.

Snapshot the intended source window and prepared content per run. A retry of the
same handoff uses the same submission key and snapshot; it must not gather a
changed set of emails and silently submit different content under the same key.
Show preparation, handoff and remote-output statuses separately. The local run
can complete when the service acknowledges receipt, even while remote approval
is pending. On uncertainty, reconcile the existing submission before retrying.

Remote result statuses refresh once when open-agent loads or when the user
selects Refresh results. They are not a repeating Scheduler job. If the second
app is unavailable, preserve the local result and allow an explicit retry of
handoff without repeating source fetching or completed side effects.

## Module and migration implementation

Keep scheduling as an internal module around `src/lib/jobs/`, backed by SQLite.
Do not publish a new library, create a third application or introduce a second
clock/worker for the same schedules. Extract cohesive helpers/handlers during
implementation rather than growing a single UI or scheduler file indefinitely.

1. Add explicit lifecycle/handler/source/result fields through reviewed migrations.
2. Preserve existing reminder, brief and digest schedules and their run history.
3. Retire to-do UI/tools and remove their use in briefs, skills and prompts.
4. Move scheduling forms and Activity review/history to the new Scheduler views.
5. Add edit, pause/resume, run-now and cancellation with clear timing semantics.
6. Represent existing stock monitoring without duplicate checks; preserve sessions.
7. Register Gmail/data/notification handlers and optional content-handoff handling.
8. Verify migration and behavior using offline tests; let the user test real jobs.

## Acceptance criteria

- Exactly one Scheduler entry; no Tasks or Activity menu entries or to-do tools.
- Existing schedules/history survive migration; no unapproved deletion of data.
- Chat/form schedules appear together; one-time reads create no schedules.
- Pausing/resuming, edits and Run now follow the timing rules above.
- Downtime produces reviewable missed jobs without auto-execution.
- Stock monitoring has one owner and respects market/freshness rules.
- Optional document handoff creates a submission, never an output or approval.
- Results and history remain usable when the separate service is offline.
- Agent-run checks remain basic/offline; user owns functional/live testing.
