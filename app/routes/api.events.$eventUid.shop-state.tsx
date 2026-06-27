import { type ActionFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getEventMetadata } from "~/models/event-content";
import { upsertEventShopState, type EventShopState } from "~/models/event-shop-state";
import { buildEventShopStateIdentity } from "~/domain/event-shop-state-key";

export type ActionData = {
  save?: EventShopState;
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const submittedEventUid = params.eventUid as string;
  const metadata = await getEventMetadata(env, submittedEventUid);
  const eventUid = metadata
    ? buildEventShopStateIdentity({
        timelineUid: submittedEventUid,
        shopContentUid: metadata.shopContentUid,
      }).shopStateUid
    : submittedEventUid;
  const actionData = await request.json<ActionData>();

  if (actionData.save) {
    await upsertEventShopState(env, currentUser.id, eventUid, actionData.save);
    return { success: true };
  }

  return { success: false };
};
