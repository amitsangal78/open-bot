export type ConnectionRef = {
  id: string;
  name: string;
  state: string;
};

export function mentionedConnections<T extends ConnectionRef>(
  text: string,
  connections: T[],
) {
  const found: T[] = [];
  const names = [...connections].sort((a, b) => b.name.length - a.name.length);
  let rest = text;
  for (const connection of names) {
    const name = connection.name.trim();
    if (!name) continue;
    const pattern = new RegExp(
      `(^|\\s)@${escapeRegExp(name)}(?=$|\\s|[.,!?;:])`,
      "i",
    );
    if (pattern.test(rest)) {
      found.push(connection);
      rest = rest.replace(pattern, "$1");
    }
  }
  if (found.length) return found;
  for (const connection of names) {
    const name = connection.name.trim();
    if (name.length < 3) continue;
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9])${escapeRegExp(name)}(?=$|[^A-Za-z0-9])`,
      "i",
    );
    if (pattern.test(text)) found.push(connection);
  }
  return found;
}

export function connectTarget(
  messages: { role: string; toolCalls: string | null }[],
) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant" || !message.toolCalls) continue;
    let calls: { function?: { name?: string; arguments?: string } }[] = [];
    try {
      calls = JSON.parse(message.toolCalls) as typeof calls;
    } catch {
      continue;
    }
    const connect = calls.find((call) => call.function?.name === "connect");
    if (!connect?.function?.arguments) continue;
    try {
      const args = JSON.parse(connect.function.arguments) as {
        id?: string;
        name?: string;
      };
      if (args.id && args.name) return { id: args.id, name: args.name };
    } catch {
      continue;
    }
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
