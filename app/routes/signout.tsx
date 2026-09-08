import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { getActiveSensei, getAuthenticator } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { validateWebPushEndpoint, WebPushSubscriptionValidationError } from "~/lib/web-push-crypto.server";
import { deactivateSubscriptionsForSignout, isSameOriginMutation } from "~/models/web-push-notifications.server";

const FINGERPRINT_COOKIE = "mollulog_web_push_fingerprint";

function fingerprintFromCookie(request: Request): string | null {
  const value = request.headers
    .get("Cookie")
    ?.split(";")
    .find((part) => part.trim().startsWith(`${FINGERPRINT_COOKIE}=`));
  if (!value) return null;
  let fingerprint: string;
  try {
    fingerprint = decodeURIComponent(value.trim().slice(FINGERPRINT_COOKIE.length + 1));
  } catch {
    return null;
  }
  return /^[A-Za-z0-9_-]{20,128}$/.test(fingerprint) ? fingerprint : null;
}

async function endpointFromRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new WebPushSubscriptionValidationError("잘못된 요청이에요");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new WebPushSubscriptionValidationError("잘못된 요청이에요");
  }
  const endpoint = (payload as { endpoint?: unknown }).endpoint;
  if (endpoint === undefined || endpoint === null) return null;
  return validateWebPushEndpoint(endpoint);
}

/**
 * Keep direct GETs side-effect free. Signout is intentionally performed by
 * the explicit same-origin POST form rendered on the profile screen.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "GET") return redirect("/edit");
  return data({ error: "잘못된 요청이에요" }, { status: 405 });
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  if (!isSameOriginMutation(request)) return data({ error: "잘못된 요청이에요" }, { status: 403 });

  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/");

  let endpoint: string | null;
  try {
    endpoint = await endpointFromRequest(request);
  } catch (error) {
    if (error instanceof WebPushSubscriptionValidationError) {
      return data({ error: error.message }, { status: 400 });
    }
    return data({ error: "잘못된 요청이에요" }, { status: 400 });
  }
  const fingerprint = fingerprintFromCookie(request);
  try {
    await deactivateSubscriptionsForSignout(env, sensei.id, endpoint, fingerprint, { ctx });
  } catch (error) {
    getLogger(env, ctx, { route: "signout" }).error("Web Push subscription deactivation failed", error, {
      userId: sensei.id,
    });
    return data(
      { error: "로그아웃하기 전에 이 브라우저의 알림 연결을 정리하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
  const headers = new Headers();
  headers.append("Set-Cookie", "mollulog_web_push_fingerprint=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
  return getAuthenticator(env, ctx).logout(request, { redirectTo: "/", headers });
};
