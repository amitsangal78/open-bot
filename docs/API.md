# API design

Updated **2026-11-21**. This is the target API for the product in
[SPEC.md](SPEC.md) and the runtime in [ARCHITECTURE.md](ARCHITECTURE.md).
The running routes are the older app. This document does not mean these paths
are implemented.

The browser calls only open-agent on `127.0.0.1:3000`. It never calls Gmail,
Notion, another MCP server, the local model, or DocYard. The server makes those
calls. Every response is loopback-only. Tokens are never included.

## How the screens call the API

| Screen | What it asks the server to do |
| --- | --- |
| Chat | List chats, open one, send a message, approve or reject a write |
| Scheduler | List schedules, create one directly, change one, open its chat, Run or Skip a missed day |
| Connect apps | List connections, start sign-in, add an MCP, disconnect |
| Settings | Read and save the name, timezone, and local model |

A schedule created from Chat does not use a separate browser call. The person
sends a normal chat message. The assistant proposes the schedule, the person
approves it in that chat, and the server saves the same schedule record the
Scheduler form saves.

## Shared rules

- `GET` reads. `POST` creates or starts something. `PATCH` changes an existing
  row.
- The body is JSON. A bad body returns `400`. A missing row returns `404`.
- A chat or schedule that is already running returns `409`.
- Lists and chats are not cached. Responses send `Cache-Control: no-store`.
- Errors return `{ "error": "a short sentence" }`.

## Health

`GET /api/health`

Returns whether Postgres answers and whether the local model server answers.

```json
{ "database": "ready", "model": "ready" }
```

`model` is `ready` or `unavailable`. The database value is `ready` or
`unavailable`.

## Chats

`GET /api/chats?view=recent`

Returns the 10 most recently updated chats, newest first.

`GET /api/chats?view=archive`

Returns every chat after those 10, newest first. This is the Archive button.
It does not change any row.

`GET /api/chats/{id}`

Returns one chat and its messages. A schedule row links here.

`POST /api/chats/{id}`

Actions:

| `action` | Body | Result |
| --- | --- | --- |
| `send` | `{ "text": "..." }` | Streams the assistant reply |
| `resume` | `{ "approved": true }` or `{ "approved": false }` | Continues a reply that is waiting for approval |
| `rename` | `{ "title": "..." }` | Renames the chat |
| `delete` | none | Deletes the chat and its messages |

`send` and `resume` stream server-sent events. A text event is a piece of the
reply. A tool event names the tool that is running. An approval event stops the
stream and includes the exact change the person must accept. A connect event
means an MCP sign-in is required and includes the connection id. The browser
then uses the Connect apps sign-in call.

Sending a new message while an approval is still open returns `409`.

## Schedules

`GET /api/schedules`

Returns every schedule: id, name, time, weekdays, prompt, status, chat id, and
the latest run status.

`POST /api/schedules`

Creates a schedule directly from the Scheduler screen. The body is the name,
the time of day, the weekdays, and the prompt. The server creates the schedule
row and the one chat that schedule owns, and returns both ids.

```json
{
  "name": "Monday mail",
  "time": "09:00",
  "weekdays": ["monday"],
  "prompt": "Summarize my unread Gmail."
}
```

`PATCH /api/schedules/{id}`

Changes the name, time, weekdays, prompt, or status. Status is `active`,
`paused`, or `cancelled`. Pausing does not create missed runs.

`DELETE /api/schedules/{id}`

Removes that schedule, its run history, and its notifications. The chat stays.
A schedule that is currently running returns `409`.

`POST /api/schedules/{id}/run`

Runs that schedule once now. The server appends the prompt to the schedule's
chat and runs the assistant there. The next weekday is unchanged.

`POST /api/schedules/{id}/decide`

Body: `{ "runId": "...", "decision": "run" }` or `"skip"`. Used from Needs
attention. `run` sends the prompt into the same chat. `skip` marks that day
skipped and does not write a message.

The chat where the person asked for a schedule is not the schedule chat. After
they approve the proposal, the server creates a new chat and returns its id in
the approval result. The Scheduler row opens that new chat.

## Connect apps

`GET /api/connections`

Returns each connection: id, name, server address, and state. State is
`needs_auth`, `connected`, or `disconnected`. The token is not returned.

`POST /api/connections`

Adds a connection.

- Gmail or Notion: `{ "provider": "gmail" }` or `{ "provider": "notion" }`.
- Add MCP: `{ "name": "Linear", "url": "https://example.com/mcp" }`.

The new row starts as `needs_auth`.

`POST /api/connections/{id}/connect`

Starts sign-in and returns `{ "url": "https://provider.example/authorize..." }`.
The browser opens that page. The provider redirects to
`GET /api/connections/callback`. The server stores the encrypted token and
marks the connection `connected`. The callback page then returns the person to
Connect apps, or back to the chat that asked them to sign in.

`POST /api/connections/{id}/disconnect`

Deletes the local token and sets the state to `disconnected`.

## Settings

`GET /api/settings`

Returns the display name, timezone, model address, and model name.

`PUT /api/settings`

Saves those four fields. The model address must be on this machine. The server
does not call Gmail or Notion from this route.

## DocYard

Sharing a summary starts in Chat. The person asks, the assistant shows the
summary, and `resume` with `approved: true` submits that text. The server stores
a `docyard_submissions` row for that chat.

`GET /api/chats/{id}/submissions`

Returns the submission id and the last known DocYard result for that chat.

`POST /api/submissions/refresh`

Checks DocYard once for known submissions and updates the stored results. It
does not submit new content and does not approve a document. The Scheduler has
no DocYard route.

## Notifications

`GET /api/notifications`

Streams notification events for the bell. A finished schedule run can add a
notification whose body links to that schedule's chat. Mark-as-read is
`POST /api/notifications/read` with no body.

## What this API does not expose

- A route the browser can use to call Gmail, Notion, or another MCP directly.
- A route that returns an access token.
- Stock quotes, Inbox, Calendar, or a built-in Google sign-in.
- A schedule type other than days, time, and a prompt.
- A Scheduler call that submits to DocYard.
