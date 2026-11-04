import { type ActionFunctionArgs, data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { jankenLocale as t } from "~/locales/ko";
import {
  getPlannerState,
  InvalidJankenPlannerEntryError,
  isPlannerStateRevisionConflictError,
  PLANNER_STATE_REVISION_CONFLICT_MESSAGE,
  saveJankenPlannerEntry,
} from "~/models/planner-state";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return data({ success: false, error: t.loginRequired }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data({ success: false, error: t.unreadableSaveInput }, { status: 400 });
  }
  if (
    !isRecord(body) ||
    typeof body.shopStateUid !== "string" ||
    !body.shopStateUid.trim() ||
    !(body.base === null || isRecord(body.base)) ||
    !isRecord(body.entry)
  ) {
    return data({ success: false, error: t.invalidSaveInput }, { status: 400 });
  }
  try {
    const entry = await saveJankenPlannerEntry(
      env,
      sensei.id,
      body.shopStateUid,
      body.entry as never,
      body.base as never,
      { ctx },
    );
    return data({ success: true, entry });
  } catch (error) {
    if (error instanceof InvalidJankenPlannerEntryError) {
      return data({ success: false, error: t.invalidSaveInput }, { status: 400 });
    }
    if (isPlannerStateRevisionConflictError(error)) {
      const latest = (await getPlannerState(env, sensei.id, { ctx })).jankenProgress[body.shopStateUid] ?? null;
      return data(
        { success: false, conflict: true, error: PLANNER_STATE_REVISION_CONFLICT_MESSAGE, latest },
        { status: 409 },
      );
    }
    return data({ success: false, error: t.saveFailed }, { status: 500 });
  }
}
