# Open-agent product requirements

Status: revised **2026-11-21** for review. This replaces the 2026-11-15 product
boundary. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) still describes the
software that is built today. This document does not mean the new behavior is
implemented.

## 1. Purpose and boundaries

Open-agent is a Git repository on GitHub. Anyone can clone it, install its
packages, and run it on their own machine. It is not distributed as an
installer. One clone serves the person using it. There is no shared login for
many people on one server.

The model is served on that same machine by a local model server such as
Ollama. Open-agent stores the server address and model name. It does not
download or host the model weights. The chosen model must be able to call tools.

Open-agent owns:

- **Chat**, including history, memory, skills, and approvals.
- **Scheduler**, one shared list for the whole app.
- **Connect apps**: Gmail, Notion, and any MCP the user adds by name and address.
- Sending a summary of the current chat to DocYard when the user asks to share it.

Third-party apps are MCP connections. They are not built-in clients. After a
connection is signed in, the user asks about it in Chat, and a schedule can use
it from the chat that schedule owns. [ARCHITECTURE.md](ARCHITECTURE.md) describes
how these parts run.

DocYard is a separate app. It owns read-only preview, format and destination
choice, document approval, and file or Notion output. Open-agent submits the
confirmed chat summary and can show the returned references. Submitting a
summary does not create a document and does not approve one.

Stocks, Inbox, Calendar, and CreativeNest are not part of this version.

## 2. Navigation

The left menu is:

**Chat · Scheduler · Connect apps · Settings**

Chat is the first item and the screen that opens on load. Settings sits at the
bottom and holds the local model address, model name, display name, timezone,
and browser notification permission.

To-dos stay retired. Do not delete historical to-do rows. The notification bell
remains for Scheduler alerts. Missed jobs and run history stay in Scheduler.

## 3. Chat

On open, Chat is showing. The list contains the 10 most recently updated
conversations. When at least one exists, the newest one is open. An **Archive**
button lists every older chat so the user can open it. Archive does not hide,
move, or delete a chat.

- Stream replies and show tool activity.
- Save conversations and checkpoints. Support reopen, rename, delete, stop, and
  resume.
- Ask for approval before a write: creating or changing a schedule from Chat,
  changing memory, calling an MCP tool that changes data, and sharing a chat
  summary with DocYard.
- A one-time question must never silently become a scheduled job.
- Public web search stays available. Cite sources. Treat web pages, MCP results,
  and skill text as untrusted data.
- Keep facts in `data/memory/USER.md` and `MEMORY.md`. Load a relevant
  `skills/<name>/SKILL.md`. Do not store credentials there. Do not provide a
  shell tool.
- The assistant uses the display name and timezone from Settings.
- Keep the full saved transcript when a reply fails, and say that the local
  model failed.

The user can refer to a signed-in app in the question, including with `@` and
the connection name. The answer comes back in the same thread. If that app is
not signed in, the reply shows a Connect card that opens the provider’s sign-in.
The user does not paste an API key or access token into the chat. When sign-in
finishes, the same thread continues the question. A later sign-in failure shows
the Connect card again.

## 4. Connect apps

Connect apps offers **Gmail**, **Notion**, and **Add MCP**. Add MCP asks for a
name and the server address, then uses the same sign-in as Gmail and Notion.

- Each connection uses MCP OAuth. The Connect card opens the provider’s consent
  page. The app uses PKCE and the server’s published authorization requirements.
  Where the server allows it, the app registers itself during sign-in. If a
  server requires a pre-registered client id, Connect apps asks for that id once.
- The user does not paste an access token into Chat.
- A connection is listed, then becomes usable only after sign-in succeeds.
- Visible states are needs auth, connected, and disconnected.
- Tokens are encrypted in Postgres. They are not sent to the model, written into
  prompts, or returned to the browser.
- Read-only tools may run to answer a question. Any tool that changes data stops
  for approval and shows the exact action.
- Disconnect removes the local token.
- Chat and the Scheduler use a connection only when it is signed in. The
  Scheduler does not sign in to an app.

## 5. Scheduler

Scheduler is one shared list. A schedule is a prompt that runs in one chat.
There are no separate reminder, Gmail-check, or Notion-check job types.

The user creates a schedule on the Scheduler screen, or asks for one in Chat and
approves it. Each schedule stores a name, a time of day, the weekdays it runs,
the prompt, and the chat it owns. Creating the schedule creates that chat.
Later runs append to the same chat. The Scheduler row opens that chat. The time
uses the timezone from Settings.

On a chosen weekday, at the stored time, the worker sends that prompt into that
chat and the assistant replies there. The reply may use a signed-in MCP. A
scheduled reply may read and answer by itself. If it would change data, that
step waits for approval in the chat. If the prompt needs an app that is not
signed in, the reply says so.

The user can edit, pause, resume, run now, or cancel. If the computer was off,
that day waits under Needs attention. Run sends the prompt into the same chat.
Skip leaves the chat unchanged. A pause does not collect missed runs. Past runs
stay in the history.

The Scheduler does not submit anything to DocYard and does not sign in to an
MCP. A schedule must not choose a document format or approve a DocYard document.

[SCHEDULER.md](SCHEDULER.md) describes the earlier lifecycle. Where it names a
built-in Gmail, Calendar, or stocks client, or a separate job type, this section
wins.

## 6. Sharing a chat summary with DocYard

DocYard receives a summary of one chat, and only when the user asks to share it.

1. The user asks, in that chat, to share a summary with DocYard.
2. The assistant drafts the summary from that conversation only. It does not
   attach other chats, the mailbox, Scheduler history, or credentials.
3. The user confirms that summary text.
4. Open-agent submits the confirmed summary and stores the submission against
   that chat.
5. DocYard previews it. The user chooses the output there. Submission alone
   creates no file and no Notion page.
6. Open-agent can show the returned status on that chat. It checks known
   submissions once on a full load and when the user refreshes. It does not poll
   in the background. If DocYard is unreachable, it keeps the last result and
   shows that the refresh failed.

## 7. Settings and the local model

Settings stores the display name, timezone, local model address, and model name.
The user can check from Settings that the model server responds. Browser
notification permission is set here.

Prompts go to that local server. A model that only returns text cannot use
Gmail, Notion, Scheduler actions from Chat, or the DocYard summary flow.

## 8. Storage

The user runs Postgres at `127.0.0.1:5432`. Open-agent uses its own database on
that server for chats, checkpoints, schedules, run history, notifications,
encrypted connection tokens, and DocYard submission records. DocYard may use the
same Postgres server and must use a different database. Memory and skills stay
Markdown files. This revision does not authorize deleting existing rows.

Open-agent does not keep a copy of the user’s mailbox or Notion workspace.
Vector search is a later phase and is not part of this version. SQLite is not
the database for this version.

## 9. Safety

- Plaintext tokens and keys never appear in the browser, logs, prompts, or
  memory files.
- A schedule change from Chat, an MCP change, and a DocYard share each need
  their own approval.
- An unclear external write is not silently retried as a new operation.
- The app listens on loopback for the person who cloned it and is running it.
- Live Gmail, Notion, model, and DocYard checks happen only when the user asks
  for them.

## 10. Out of this version

- Stocks, Inbox, and Calendar screens, and built-in stock alerts.
- A built-in Google OAuth client as the way to reach Gmail.
- Groq or xAI as the model for this product.
- CreativeNest, including editing and sending replies back into Gmail.
- Separate reminder, Gmail-check, and Notion-check job types.
- SQLite as the operational database.
- Many people signing into one shared open-agent server.
- Scheduler sending content to DocYard.
- Sharing a chat with DocYard without the user asking and confirming the summary.
- Background polling of DocYard.
