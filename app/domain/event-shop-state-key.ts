export type EventShopStateIdentityInput = {
  timelineUid: string;
  shopContentUid: string | null;
};

export type EventShopStateIdentity = {
  shopStateUid: string;
  fallbackStateUid: string | null;
};

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
