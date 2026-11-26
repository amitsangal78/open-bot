# Features

Updated **2026-11-21**. This is the build order for the product in
[SPEC.md](SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [API.md](API.md).
Status for each feature lives in [PROGRESS.md](PROGRESS.md). One feature is in
progress at a time. Features 1 through 6 are done. Feature 7 is the current build.

## 1. App shell and Postgres

The clone runs against its own Postgres database on `127.0.0.1:5432`. The left
menu is Chat, Scheduler, Connect apps, and Settings. Chat opens first. Settings
saves the display name, timezone, local model address, model name, and browser
notification permission. Health reports whether Postgres and the local model
server answer. The web app and the worker start together.

## 2. Chat

Chat shows the 10 most recently updated conversations and opens the newest one.
Archive lists the older chats and does not delete them. A message streams a
reply from the local model, including tool activity. The person can reopen,
rename, delete, stop, and resume a chat. The full transcript stays saved when
the model fails. Public web search, memory, and skills are available. Web
pages, tool results, and skill text are untrusted data. There is no shell tool.

## 3. Approvals

A write waits in the chat until the person accepts the exact change. This card
is what a later schedule, memory change, MCP change, and DocYard share uses. A
one-time question does not become a schedule by itself.

## 4. Connect apps

Gmail, Notion, and Add MCP appear on Connect apps. Add MCP takes a name and a
server address, then uses the same sign-in. A connection is `needs_auth`,
`connected`, or `disconnected`. The Connect card can appear in Chat. `@` uses a
signed-in app in that thread. A read can run immediately. A change uses the
approval card. Disconnect removes the local token. The token is never sent to
the browser or the model. A later sign-in failure shows the Connect card again.

## 5. Scheduler

The Scheduler screen creates a schedule with weekdays, a time, and a prompt.
That schedule owns one new chat. On a chosen day the worker appends the prompt
to that chat and the assistant replies there. The schedule row opens that chat.
Edit, pause, resume, run now, cancel, and delete work. Delete removes the schedule and leaves its chat. A missed day waits for Run or
Skip. Pausing does not collect missed days. Run history and the notification
bell are on this feature. A scheduled read can answer by itself. A scheduled
change waits for approval in that chat. If the prompt needs an app that is not
signed in, the reply says so. The Scheduler does not call DocYard.

## 6. Schedule from Chat

The person asks in a normal chat. The assistant proposes the days, time, and
prompt. After approval, the server saves the same schedule record the Scheduler
form saves and creates a new chat for the future runs. The conversation where
they asked stays a normal chat.

## 7. DocYard

The person asks, in that chat, to share a summary. The assistant drafts it from
that conversation only. After the person confirms the text, the server submits
it. DocYard still chooses the format and approves the document. The chat shows
the returned status. Results refresh once on a full load and when the person
asks. If DocYard is down, the last result stays. The Scheduler cannot submit a
summary.

## Out of this build

Stocks, Inbox, Calendar, Groq, xAI, CreativeNest, SQLite, and vector search are
not features in this list.
