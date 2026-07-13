import { type ActionFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { buildEventShopStateIdentity } from "~/domain/event-shop-state-key";
import { withD1Session } from "~/lib/d1-session";
import { getEventMetadata } from "~/models/event-content";
import { type EventShopState, upsertEventShopState } from "~/models/event-shop-state";

export type ActionData = {
  save?: EventShopState;
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = withD1Session(env, "first-unconstrained");
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const submittedEventUid = params.eventUid as string;
  const metadata = await getEventMetadata(publicReadEnv, submittedEventUid, ctx);
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
