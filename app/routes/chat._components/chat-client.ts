export type ChatActionClientErrorCode = "session_expired" | "network";

export class ChatActionHttpError extends Error {
  constructor(readonly code: ChatActionClientErrorCode) {
    super();
  }
}

export type ChatStreamHandlers = {
  onStarted?: (started: { conversationUid: string; messageUid: string }) => void;
  onEvent?: (event: import("~/models/al1s-question-contract").QuestionRunEvent) => void;
};

export async function postChatAction<T>(
  payload: unknown,
  fetcher: typeof fetch = fetch,
  handlers: ChatStreamHandlers = {},
): Promise<T> {
  const question = typeof payload === "object" && payload !== null && "intent" in payload && payload.intent === "question";
  const response = await fetcher("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: question ? "application/x-ndjson" : "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new ChatActionHttpError(response.status === 404 ? "session_expired" : "network");
  }
  if (!question) return response.json() as Promise<T>;
  if (!response.body) throw new ChatActionHttpError("network");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parseLine = (line: string): T | null => {
    if (!line.trim()) return null;
    const message = JSON.parse(line) as Record<string, unknown>;
    if (message.type === "started") {
      if (typeof message.conversationUid !== "string" || typeof message.messageUid !== "string") {
        throw new ChatActionHttpError("network");
      }
      handlers.onStarted?.({ conversationUid: message.conversationUid, messageUid: message.messageUid });
      return null;
    }
    if (message.type === "event") {
      handlers.onEvent?.(message.event as import("~/models/al1s-question-contract").QuestionRunEvent);
      return null;
    }
    if (message.type === "result") return message as T;
    throw new ChatActionHttpError("network");
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const result = parseLine(line);
      if (result !== null) return result;
    }
    if (done) {
      const result = parseLine(buffer);
      if (result !== null) return result;
      throw new ChatActionHttpError("network");
    }
  }
}

export function mapChatActionErrorCode(error: unknown): ChatActionClientErrorCode {
  return error instanceof ChatActionHttpError ? error.code : "network";
}
