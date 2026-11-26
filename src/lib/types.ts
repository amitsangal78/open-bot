export type ChatMessage = {
  id?: string;
  role: string;
  content: string;
  toolCalls?: { id?: string; name: string; args: Record<string, unknown> }[];
  name?: string;
};
export type Approval = { kind: string; action: Record<string, unknown> };
export type ChatView = {
  messages: ChatMessage[];
  approval: Approval | null;
  resumable: boolean;
};
export type ToolEvent = {
  id: string;
  name: string;
  status: string;
  input?: unknown;
};
