export type ChatActionClientErrorCode = "session_expired" | "network";

export class ChatActionHttpError extends Error {
  constructor(readonly code: ChatActionClientErrorCode) {
    super();
  }
}

export async function postChatAction<T>(payload: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new ChatActionHttpError(response.status === 404 ? "session_expired" : "network");
  }
  return response.json() as Promise<T>;
}

export function mapChatActionErrorCode(error: unknown): ChatActionClientErrorCode {
  return error instanceof ChatActionHttpError ? error.code : "network";
}
