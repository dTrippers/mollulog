import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import {
  fingerprintWebPushEndpoint,
  WebPushConfigurationError,
  type WebPushSubscriptionInput,
  WebPushSubscriptionValidationError,
} from "~/lib/web-push-crypto.server";
import {
  getWebPushNotificationState,
  isSameOriginMutation,
  recordWebPushDeliveryClick,
  subscribeWebPush,
  unsubscribeWebPush,
} from "~/models/web-push-notifications.server";

const FINGERPRINT_COOKIE = "mollulog_web_push_fingerprint";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const WEB_PUSH_EVENTS = new Set([
  "attempt",
  "success",
  "permission-denied",
  "unsupported",
  "expired",
  "error",
  "unsubscribe",
  "click",
]);

function cookieValue(request: Request): string | null {
  const cookies = request.headers.get("Cookie")?.split(";") ?? [];
  const row = cookies.find((value) => value.trim().startsWith(`${FINGERPRINT_COOKIE}=`));
  return row ? decodeURIComponent(row.trim().slice(FINGERPRINT_COOKIE.length + 1)) : null;
}

function setFingerprintCookie(fingerprint: string): string {
  return `${FINGERPRINT_COOKIE}=${encodeURIComponent(fingerprint)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearFingerprintCookie(): string {
  return `${FINGERPRINT_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function jsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function subscriptionFromPayload(value: unknown): WebPushSubscriptionInput | null {
  if (!jsonObject(value) || typeof value.endpoint !== "string" || !jsonObject(value.keys)) return null;
  const keys = value.keys;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  return {
    endpoint: value.endpoint,
    expirationTime:
      typeof value.expirationTime === "number" || value.expirationTime === null ? value.expirationTime : null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

function fingerprintFromPayload(value: unknown): string | null {
  if (!jsonObject(value) || typeof value.fingerprint !== "string") return null;
  return /^[A-Za-z0-9_-]{20,128}$/.test(value.fingerprint) ? value.fingerprint : null;
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  return data({ vapidPublicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null });
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  if (!isSameOriginMutation(request)) return data({ error: "잘못된 요청이에요" }, { status: 403 });

  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return data({ error: "잘못된 요청이에요" }, { status: 400 });
  }
  if (!jsonObject(payload) || typeof payload.intent !== "string") {
    return data({ error: "잘못된 요청이에요" }, { status: 400 });
  }

  const logger = getLogger(env, ctx, { route: "api.notifications.web-push", method: request.method });
  try {
    if (payload.intent === "subscribe") {
      const subscription = subscriptionFromPayload(payload.subscription);
      if (!subscription) return data({ error: "브라우저 알림 구독 정보를 확인할 수 없어요" }, { status: 400 });
      const result = await subscribeWebPush(env, sensei.id, subscription, { ctx });
      return data(
        { ok: true, status: result.status },
        { headers: { "Set-Cookie": setFingerprintCookie(result.fingerprint) } },
      );
    }

    if (payload.intent === "unsubscribe") {
      const subscription = subscriptionFromPayload(payload.subscription);
      const fingerprint = subscription
        ? await fingerprintWebPushEndpoint(subscription.endpoint)
        : (fingerprintFromPayload(payload) ?? cookieValue(request));
      if (!fingerprint) return data({ ok: true, status: "not-found" });
      const result = await unsubscribeWebPush(env, sensei.id, fingerprint, { ctx });
      return data({ ok: true, status: result.status }, { headers: { "Set-Cookie": clearFingerprintCookie() } });
    }

    if (payload.intent === "status") {
      const subscription = subscriptionFromPayload(payload.subscription);
      const state = await getWebPushNotificationState(env, sensei.id, {
        ctx,
        currentEndpoint: subscription?.endpoint,
      });
      return data({ ok: true, state });
    }

    if (payload.intent === "click" && typeof payload.deliveryUid === "string") {
      const recorded = await recordWebPushDeliveryClick(env, sensei.id, payload.deliveryUid, { ctx });
      logger.info("Web Push click recorded", { userId: sensei.id, outcome: recorded ? "recorded" : "ignored" });
      return data({ ok: recorded });
    }

    if (payload.intent === "event" && typeof payload.event === "string" && WEB_PUSH_EVENTS.has(payload.event)) {
      logger.info("Web Push lifecycle event", { userId: sensei.id, event: payload.event });
      return data({ ok: true });
    }

    return data({ error: "잘못된 요청이에요" }, { status: 400 });
  } catch (error) {
    const expected = error instanceof WebPushConfigurationError || error instanceof WebPushSubscriptionValidationError;
    if (!expected) logger.error("Web Push subscription mutation failed", error, { userId: sensei.id });
    return data(
      { error: expected && error instanceof Error ? error.message : "브라우저 알림 설정을 처리하지 못했어요" },
      { status: expected ? 400 : 500 },
    );
  }
};
