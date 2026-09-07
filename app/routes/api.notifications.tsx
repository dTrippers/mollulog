import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { isValidNotificationWatermark, type NotificationHistoryResponse } from "~/domain/notification-history";
import { getLogger } from "~/lib/observability.server";
import { getNotificationHistory, markNotificationHistoryRead } from "~/models/notification-history.server";

export type NotificationReadResponse = {
  ok: true;
  unreadCount: number;
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return data<NotificationHistoryResponse>(
      { notifications: [], snapshotMaxDeliveredAt: null, error: "로그인이 필요해요" },
      { status: 401 },
    );
  }

  const logger = getLogger(env, ctx, { route: "api.notifications", method: request.method });
  try {
    return data<NotificationHistoryResponse>(await getNotificationHistory(env, sensei.id, { ctx }));
  } catch (error) {
    logger.error("Notification history load failed", error, { userId: sensei.id });
    return data<NotificationHistoryResponse>(
      { notifications: [], snapshotMaxDeliveredAt: null, error: "알림을 불러오지 못했어요" },
      { status: 500 },
    );
  }
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return data({ error: "로그인이 필요해요" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return data({ error: "잘못된 요청이에요" }, { status: 400 });
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    (payload as { intent?: unknown }).intent !== "mark-read" ||
    !isValidNotificationWatermark((payload as { watermark?: unknown }).watermark)
  ) {
    return data({ error: "잘못된 요청이에요" }, { status: 400 });
  }

  const logger = getLogger(env, ctx, { route: "api.notifications", method: request.method });
  try {
    const result = await markNotificationHistoryRead(env, sensei.id, (payload as { watermark: string }).watermark, {
      ctx,
    });
    return data<NotificationReadResponse>({ ok: true, unreadCount: result.unreadCount });
  } catch (error) {
    logger.error("Notification read state update failed", error, { userId: sensei.id });
    return data({ error: "알림을 읽음 처리하지 못했어요" }, { status: 500 });
  }
};
