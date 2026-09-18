export type EventShopStateIdentityInput = {
  timelineUid: string;
  shopContentUid: string | null;
};

export type EventShopStateIdentity = {
  shopStateUid: string;
  fallbackStateUid: string | null;
};

/** Where the loader resolved the persisted shop state from. */
export type SavedShopStateSource = "primary" | "fallback" | "none";

export function buildEventShopStateIdentity({
  timelineUid,
  shopContentUid,
}: EventShopStateIdentityInput): EventShopStateIdentity {
  const shopStateUid = shopContentUid ?? timelineUid;

  return {
    shopStateUid,
    fallbackStateUid: shopStateUid === timelineUid ? null : timelineUid,
  };
}
