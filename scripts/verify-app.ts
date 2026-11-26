import assert from "node:assert/strict";
const base = "http://127.0.0.1:3100";
async function api(body?: unknown, path = "/api/workspace") {
  const response = await fetch(
    base + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const result = await response.json();
  assert.equal(
    response.ok,
    true,
    `${path} returned HTTP ${response.status}: ${result.error || ""}`,
  );
  return result;
}
async function chat(body: unknown) {
  const response = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(125000),
  });
  assert.equal(response.status, 200);
  const stream = await response.text();
  const events = stream.split("\n\n").flatMap((frame) => {
    const type = frame.match(/^event: (.+)$/m)?.[1],
      data = frame.match(/^data: (.+)$/m)?.[1];
    return type && data ? [{ type, data: JSON.parse(data) }] : [];
  });
  const failure = events.find((e) => e.type === "error");
  if (failure) throw new Error(failure.data.error);
  return {
    id: events.find((e) => e.type === "chat")?.data.id,
    state: events.find((e) => e.type === "state")?.data,
    tokens: events.filter((e) => e.type === "token").length,
  };
}
async function main() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const taskTitle = `HTTP smoke task ${suffix}`,
    reminderTitle = `HTTP smoke reminder ${suffix}`,
    liveTitle = `Live approval smoke task ${suffix}`;
  const workspace = await api();
  assert.ok(workspace.workerRunning);
  console.log("Workspace and worker: passed");
  const blocked = await fetch(base + "/api/workspace", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(blocked.status, 403);
  console.log("Cross-origin protection: passed");
  await api({
    command: "action",
    action: { type: "todo_add", title: taskTitle },
    operationId: crypto.randomUUID(),
  });
  assert.ok(
    (await api()).todos.some((t: { title: string }) => t.title === taskTitle),
  );
  console.log("Task creation and persistence: passed");
  await api({
    command: "action",
    action: {
      type: "reminder_add",
      kind: "reminder",
      title: reminderTitle,
      at: Date.now() + 12000,
    },
    operationId: crypto.randomUUID(),
  });
  let fired = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (
      (await api()).notifications.some(
        (n: { title: string }) => n.title === reminderTitle,
      )
    ) {
      fired = true;
      break;
    }
  }
  assert.ok(fired);
  console.log("Live worker reminder notification: passed");
  const turn = await chat({
    action: "send",
    text: `Create a task titled ${liveTitle}. Use the create_task tool. Do not perform any other action.`,
  });
  assert.ok(turn.state?.approval);
  assert.ok(
    !(await api()).todos.some((t: { title: string }) => t.title === liveTitle),
  );
  console.log("Live Groq agent pauses before write: passed");
  const resumed = await chat({ action: "resume", id: turn.id, approved: true });
  assert.equal(resumed.state?.approval, null);
  assert.ok(
    (await api()).todos.some((t: { title: string }) => t.title === liveTitle),
  );
  assert.ok(resumed.tokens > 0);
  console.log("Approval, tool execution and streamed answer: passed");
  await api(
    { action: "rename", id: turn.id, title: "Verified chat" },
    "/api/chat",
  );
  const reopened = await api(
    undefined,
    `/api/chat?id=${encodeURIComponent(turn.id)}`,
  );
  assert.ok(reopened.messages.length >= 3);
  console.log("Reopen saved conversation: passed");
  await api({ action: "delete", id: turn.id }, "/api/chat");
  console.log("Delete test conversation and checkpoints: passed");
}
main().catch((error) => {
  console.log("App smoke check failed:", error.message);
  process.exitCode = 1;
});
