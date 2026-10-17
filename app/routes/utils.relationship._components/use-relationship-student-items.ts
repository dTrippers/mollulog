import { useCallback, useEffect, useState } from "react";
import type { StudentFavoriteGift } from "~/domain/relationship-gifts";

type StudentItemsResponse = { uid: string; name: string; favoriteItems: StudentFavoriteGift[] };
type LoadState =
  | { uid: string; status: "loading" }
  | { uid: string; status: "error" }
  | { uid: string; status: "ready"; favoriteItems: StudentFavoriteGift[] };

function isStudentItemsResponse(value: unknown, uid: string): value is StudentItemsResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<StudentItemsResponse>;
  return response.uid === uid && typeof response.name === "string" && Array.isArray(response.favoriteItems);
}

export function useRelationshipStudentItems(uid: string) {
  const [state, setState] = useState<LoadState | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: The retry counter intentionally reissues the same student request.
  useEffect(() => {
    const controller = new AbortController();
    setState({ uid, status: "loading" });
    void fetch(`/api/students/${encodeURIComponent(uid)}/items`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Student gift request failed");
        return response.json() as Promise<unknown>;
      })
      .then((response) => {
        if (!isStudentItemsResponse(response, uid)) throw new Error("Student gift response was invalid");
        setState({ uid, status: "ready", favoriteItems: response.favoriteItems });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ uid, status: "error" });
      });
    return () => controller.abort();
  }, [uid, retryKey]);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);
  const currentState = state?.uid === uid ? state : { uid, status: "loading" as const };
  return { ...currentState, retry };
}
