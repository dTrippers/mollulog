import { type ActionFunctionArgs, data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  mergeEventShopStateChanges,
  normalizeEventShopOwnedQuantityPatch,
  normalizeEventShopState,
} from "~/domain/event-shop-state";
import { buildEventShopStateIdentity } from "~/domain/event-shop-state-key";
import { getEventMetadata } from "~/models/event-content";
import { getEventShopState, upsertEventShopState } from "~/models/event-shop-state";
import { updateEventShopOwnedQuantities } from "~/views/event-shop-state";

export type ActionData = {
  save?: unknown;
  base?: unknown;
  replace?: unknown;
  requestId?: unknown;
  updateOwnedQuantities?: unknown;
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data({ success: false, error: "로그인이 필요해요" }, { status: 401 });
  }

  const submittedEventUid = params.eventUid;
  if (!submittedEventUid) {
    return data({ success: false, error: "이벤트 상점을 확인할 수 없어요" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data({ success: false, error: "요청 내용을 읽지 못했어요" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return data({ success: false, error: "요청 내용을 확인해주세요" }, { status: 400 });
  }
  const actionData = body as ActionData;
  const requestId =
    typeof actionData.requestId === "string" && actionData.requestId.length <= 128 ? actionData.requestId : undefined;

  if (actionData.updateOwnedQuantities !== undefined) {
    const patch = normalizeEventShopOwnedQuantityPatch(actionData.updateOwnedQuantities);
    if (!patch || Object.keys(patch).length === 0) {
      return data({ success: false, error: "보유 재화 입력을 확인해주세요" }, { status: 400 });
    }

    try {
      const result = await updateEventShopOwnedQuantities(env, currentUser.id, submittedEventUid, patch, ctx);
      if (result.status === "event-unavailable") {
        return data({ success: false, error: "이벤트 상점 정보를 확인할 수 없어요" }, { status: 404 });
      }
      if (result.status === "currency-unavailable") {
        return data({ success: false, error: "입력한 이벤트 재화를 확인할 수 없어요" }, { status: 400 });
      }
      return { success: true };
    } catch {
      return data({ success: false, error: "보유 재화를 저장하지 못했어요. 다시 시도해주세요" }, { status: 500 });
    }
  }

  if (actionData.save !== undefined) {
    const state = normalizeEventShopState(actionData.save);
    if (!state)
      return data(
        { success: false, error: "상점 계획 내용을 확인해주세요", ...(requestId ? { requestId } : {}) },
        { status: 400 },
      );
    const replace = actionData.replace === true;
    const baseState = replace ? null : normalizeEventShopState(actionData.base);
    if (!replace && !baseState) {
      return data(
        {
          success: false,
          error: "기준 상점 계획을 확인하지 못했어요. 새로고침 후 다시 시도해주세요",
          ...(requestId ? { requestId } : {}),
        },
        { status: 400 },
      );
    }
    if (actionData.replace !== undefined && typeof actionData.replace !== "boolean") {
      return data(
        { success: false, error: "저장 방식을 확인해주세요", ...(requestId ? { requestId } : {}) },
        { status: 400 },
      );
    }
    try {
      const metadata = await getEventMetadata(publicReadEnv, submittedEventUid, ctx);
      if (!metadata) {
        return data(
          { success: false, error: "이벤트 상점 정보를 확인할 수 없어요", ...(requestId ? { requestId } : {}) },
          { status: 404 },
        );
      }
      const identity = buildEventShopStateIdentity({
        timelineUid: submittedEventUid,
        shopContentUid: metadata.shopContentUid,
      });
      const latestState = replace
        ? null
        : ((await getEventShopState(env, currentUser.id, identity.shopStateUid)) ??
          (identity.fallbackStateUid ? await getEventShopState(env, currentUser.id, identity.fallbackStateUid) : null));
      const stateToSave = baseState && latestState ? mergeEventShopStateChanges(baseState, state, latestState) : state;
      await upsertEventShopState(env, currentUser.id, identity.shopStateUid, stateToSave);
      return { success: true, ...(requestId ? { requestId } : {}) };
    } catch {
      return data(
        {
          success: false,
          error: "상점 계획을 저장하지 못했어요. 다시 시도해주세요",
          ...(requestId ? { requestId } : {}),
        },
        { status: 500 },
      );
    }
  }

  return { success: false };
};
