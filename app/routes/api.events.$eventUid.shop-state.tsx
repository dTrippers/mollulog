import { type ActionFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { deleteEventShopState, upsertEventShopState, type EventShopState } from "~/models/event-shop-state";

export type ActionData = {
  save?: EventShopState;
  delete?: boolean;
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const eventUid = params.eventUid as string;
  const actionData = await request.json<ActionData>();

  if (actionData.save) {
    await upsertEventShopState(env, currentUser.id, eventUid, actionData.save);
    return { success: true };
  }

  if (actionData.delete) {
    await deleteEventShopState(env, currentUser.id, eventUid);
    return { success: true };
  }

  return { success: false };
};

