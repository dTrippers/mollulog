import type { EventShopOwnedQuantityPatch } from "~/domain/event-shop-state";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { buildEventShopStateIdentity } from "~/domain/event-shop-state-key";
import { getEventMetadata, getEventShopContent } from "~/models/event-content";
import { patchEventShopStateOwnedQuantities } from "~/models/event-shop-state";
import { getRecruitedStudents } from "~/models/recruited-student";

export type EventShopOwnedQuantityUpdateResult =
  | { status: "saved" }
  | { status: "event-unavailable" }
  | { status: "currency-unavailable" };

function getEventPaymentCurrencyUids(shopContent: NonNullable<Awaited<ReturnType<typeof getEventShopContent>>>) {
  const uids = new Set<string>();
  for (const resource of shopContent.shopResources) {
    uids.add(resource.paymentResource.uid);
    for (const tier of resource.purchaseTiers) {
      uids.add(tier.paymentResource.uid);
    }
  }

  const minigame = shopContent.minigameConfig;
  if (minigame) {
    uids.add(minigame.payment.resourceUid);
    for (const payment of minigame.payments) uids.add(payment.resourceUid);
    for (const group of minigame.rewardGroups) {
      for (const payment of group.payments) uids.add(payment.resourceUid);
    }
  }
  return uids;
}

export async function updateEventShopOwnedQuantities(
  env: Env,
  userId: number,
  timelineUid: string,
  patch: EventShopOwnedQuantityPatch,
  ctx?: ExecutionContext,
): Promise<EventShopOwnedQuantityUpdateResult> {
  const [metadata, recruitedStudents] = await Promise.all([
    getEventMetadata(env, timelineUid, ctx),
    getRecruitedStudents(env, userId),
  ]);
  if (!metadata) return { status: "event-unavailable" };

  const shopContent = await getEventShopContent(env, timelineUid, false, ctx);
  if (!shopContent || shopContent.shopResources.length === 0) return { status: "event-unavailable" };

  const acceptedUids = getEventPaymentCurrencyUids(shopContent);
  if (Object.keys(patch).some((uid) => !acceptedUids.has(uid))) {
    return { status: "currency-unavailable" };
  }

  const shopStateUid = buildEventShopStateIdentity({
    timelineUid,
    shopContentUid: metadata.shopContentUid,
  }).shopStateUid;
  await patchEventShopStateOwnedQuantities(
    env,
    userId,
    shopStateUid,
    patch,
    createDefaultEventShopState(
      shopContent.stages,
      recruitedStudents.map(({ studentUid }) => studentUid),
    ),
    { ctx },
  );
  return { status: "saved" };
}
