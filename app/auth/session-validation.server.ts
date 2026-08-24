import {
  authenticatorSessionKey,
  sessionStorage,
  sessionValidationCookieName,
  sessionValidationSessionKey,
  sessionValidationStorage,
} from "~/auth/authenticator.server";
import { type AccountSessionState, getAccountSessionState } from "~/models/account-security";

export const SESSION_VALIDATION_LEASE_MS = 5 * 60 * 1000;

type SessionLease = {
  userId: number;
  sessionVersion: number;
  validatedAt: number;
};

export type SessionValidationDecision =
  | { kind: "anonymous"; refreshCookie?: string }
  | { kind: "validated"; refreshCookie?: string }
  | { kind: "response"; response: Response };

const inFlightValidations = new Map<string, Promise<AccountSessionState | null>>();

function isMutationMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function isFeedbackReadRequest(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  return /^\/contact\/[^/]+\/?$/.test(new URL(request.url).pathname);
}

export function isSessionValidationRequired(request: Request): boolean {
  const method = request.method.toUpperCase();
  return isMutationMethod(method) || isFeedbackReadRequest(request);
}

function readSessionLease(value: unknown): SessionLease | null {
  if (!value || typeof value !== "object") return null;
  const lease = value as Partial<SessionLease>;
  const userId = lease.userId;
  const sessionVersion = lease.sessionVersion;
  const validatedAt = lease.validatedAt;
  if (
    typeof userId !== "number" ||
    typeof sessionVersion !== "number" ||
    typeof validatedAt !== "number" ||
    !Number.isSafeInteger(userId) ||
    !Number.isSafeInteger(sessionVersion) ||
    !Number.isSafeInteger(validatedAt)
  ) {
    return null;
  }
  return {
    userId,
    sessionVersion,
    validatedAt,
  };
}

function isLeaseFresh(lease: SessionLease | null, userId: number, now: number): boolean {
  if (!lease || lease.userId !== userId) return false;
  return now >= lease.validatedAt && now - lease.validatedAt < SESSION_VALIDATION_LEASE_MS;
}

function sessionValidationFailureResponse(): Response {
  return new Response("일시적으로 로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요.", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "5",
    },
  });
}

async function expiredSessionResponse(
  env: Env,
  session: Parameters<Awaited<ReturnType<typeof sessionStorage>>["destroySession"]>[0],
  leaseSession: Parameters<Awaited<ReturnType<typeof sessionValidationStorage>>["destroySession"]>[0],
): Promise<Response> {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Location: "/unauthorized",
  });
  headers.append("Set-Cookie", await sessionStorage(env).destroySession(session));
  headers.append("Set-Cookie", await sessionValidationStorage(env).destroySession(leaseSession));
  return new Response(null, { status: 302, headers });
}

function getInFlightValidation(
  key: string,
  operation: () => Promise<AccountSessionState | null>,
): Promise<AccountSessionState | null> {
  const existing = inFlightValidations.get(key);
  if (existing) return existing;

  const promise = operation();
  inFlightValidations.set(key, promise);
  const clear = () => {
    if (inFlightValidations.get(key) === promise) inFlightValidations.delete(key);
  };
  void promise.then(clear, clear);
  return promise;
}

export async function validateSessionRequest(
  env: Env,
  request: Request,
  ctx?: ExecutionContext,
  now = Date.now(),
): Promise<SessionValidationDecision> {
  let session: Awaited<ReturnType<ReturnType<typeof sessionStorage>["getSession"]>>;
  let leaseSession: Awaited<ReturnType<ReturnType<typeof sessionValidationStorage>["getSession"]>>;
  const cookie = request.headers.get("Cookie");
  try {
    [session, leaseSession] = await Promise.all([
      sessionStorage(env).getSession(cookie),
      sessionValidationStorage(env).getSession(cookie),
    ]);
  } catch {
    return { kind: "response", response: sessionValidationFailureResponse() };
  }

  const user = session.get(authenticatorSessionKey) as { id?: unknown } | undefined;
  const lease = readSessionLease(leaseSession.get(sessionValidationSessionKey));
  if (!user || !Number.isSafeInteger(user.id)) {
    if (!lease) return { kind: "anonymous" };
    try {
      return { kind: "anonymous", refreshCookie: await sessionValidationStorage(env).destroySession(leaseSession) };
    } catch {
      return { kind: "response", response: sessionValidationFailureResponse() };
    }
  }
  const userId = user.id as number;
  const required = isSessionValidationRequired(request);
  if (!required && isLeaseFresh(lease, userId, now)) {
    return { kind: "validated" };
  }

  const key = cookie ? `session:${cookie}` : `user:${userId}`;
  let state: AccountSessionState | null;
  try {
    state = await getInFlightValidation(key, () => getAccountSessionState(env, userId, { ctx }));
  } catch {
    return { kind: "response", response: sessionValidationFailureResponse() };
  }

  if (!state?.active || (lease?.userId === userId && lease.sessionVersion !== state.sessionVersion)) {
    try {
      return { kind: "response", response: await expiredSessionResponse(env, session, leaseSession) };
    } catch {
      return { kind: "response", response: sessionValidationFailureResponse() };
    }
  }

  try {
    leaseSession.set(sessionValidationSessionKey, {
      userId,
      sessionVersion: state.sessionVersion,
      validatedAt: now,
    } satisfies SessionLease);
    return { kind: "validated", refreshCookie: await sessionValidationStorage(env).commitSession(leaseSession) };
  } catch {
    return { kind: "response", response: sessionValidationFailureResponse() };
  }
}

export function applySessionValidationResponse(response: Response, decision: SessionValidationDecision): Response {
  const downstreamSetCookie = response.headers.get("Set-Cookie");
  const hasDownstreamCookie = downstreamSetCookie !== null;
  const hasDownstreamSessionCookie =
    downstreamSetCookie?.split(",").some((cookie) => cookie.trimStart().startsWith("__session=")) ?? false;
  const hasDownstreamLeaseCookie =
    downstreamSetCookie
      ?.split(",")
      .some((cookie) => cookie.trimStart().startsWith(`${sessionValidationCookieName}=`)) ?? false;
  const refreshCookie =
    decision.kind === "validated" || decision.kind === "anonymous" ? decision.refreshCookie : undefined;
  const shouldPreventCaching = hasDownstreamCookie || refreshCookie != null;
  if (!shouldPreventCaching) return response;

  const headers = new Headers(response.headers);
  if (refreshCookie && !hasDownstreamSessionCookie && !hasDownstreamLeaseCookie) {
    headers.append("Set-Cookie", refreshCookie);
  }
  headers.set("Cache-Control", "private, no-store, no-transform");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
