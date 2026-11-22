import type { EventShopMetadata } from "~/models/event-content";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { getEventContentSchedule, getEventShopContentForMetadata } from "~/models/event-content";

export type EventShopAvailability = "no-data" | "ended" | "ready" | "unavailable";

export type EventShopPortalData = {
  status: EventShopAvailability;
  since: string;
  until: string | null;
  currencies: { uid: string; type: ResourceTypeEnum; name: string; imageUrl: string | null }[];
};

export async function getEventShopPortalData(env: Env, metadata: EventShopMetadata): Promise<EventShopPortalData> {
  if (!metadata.shopAvailable) {
    return { status: "no-data", since: metadata.since, until: metadata.until, currencies: [] };
  }
  try {
    const shopContent = await getEventShopContentForMetadata(env, metadata);
    const shopSchedule = metadata.shopContentUid
      ? await getEventContentSchedule(env, metadata.shopContentUid, metadata.runType)
      : null;
    const shopUntil = shopSchedule?.endAt ?? metadata.until;
    const shopSince = shopSchedule?.startAt ?? metadata.since;
    if (
      (metadata.runType === "permanent" && !metadata.shopContentUid) ||
      !shopContent ||
      shopContent.shopResources.length === 0
    ) {
      return { status: "no-data", since: shopSince, until: shopUntil, currencies: [] };
    }
    const currencies = new Map<string, EventShopPortalData["currencies"][number]>();
    for (const shopResource of shopContent.shopResources) {
      for (const payment of [shopResource.paymentResource, ...shopResource.purchaseTiers.map((tier) => tier.paymentResource)]) {
        if (!currencies.has(payment.uid)) {
          currencies.set(payment.uid, {
            uid: payment.uid,
            type: payment.type,
            name: payment.name,
            imageUrl: payment.imageUrl ?? null,
          });
        }
      }
    }
    return {
      status: shopUntil && Date.parse(shopUntil) < Date.now() ? "ended" : "ready",
      since: shopSince,
      until: shopUntil,
      currencies: [...currencies.values()].slice(0, 4),
    };
  } catch {
    return { status: "unavailable", since: metadata.since, until: metadata.until, currencies: [] };
  }
}

export async function getEventShopAvailability(env: Env, metadata: EventShopMetadata): Promise<EventShopAvailability> {
  return (await getEventShopPortalData(env, metadata)).status;
}
