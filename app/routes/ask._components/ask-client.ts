export type AskActionClientErrorCode = "session_expired" | "network";

export class AskActionHttpError extends Error {
  constructor(readonly code: AskActionClientErrorCode) {
    super();
  }
}

export async function postAskAction<T>(payload: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new AskActionHttpError(response.status === 404 ? "session_expired" : "network");
  }
  return response.json() as Promise<T>;
}

export function mapAskActionErrorCode(error: unknown): AskActionClientErrorCode {
  return error instanceof AskActionHttpError ? error.code : "network";
}
