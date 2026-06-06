import dayjs from "~/lib/dayjs";

const GAME_RESET_HOUR = 4;

const STEEL_CONTINENT_PURCHASE_DAYS_LIMITS = {
  "8540000": 14,
  "8540001": 14,
  "8540002": 7,
};

const SHOP_RESOURCE_PURCHASE_DAYS_LIMITS: Record<string, Record<string, number>> = {
  // BAQL shop data does not expose per-ticket sales periods for this event.
  "steel-continent": STEEL_CONTINENT_PURCHASE_DAYS_LIMITS,
  "854": STEEL_CONTINENT_PURCHASE_DAYS_LIMITS,
};

export function calculateShopPurchaseDays(since: Date | string | null | undefined, until: Date | string | null | undefined) {
  if (!since || !until) {
    return 0;
  }

  const start = dayjs(since).tz("Asia/Seoul");
  const end = dayjs(until).tz("Asia/Seoul");
  if (!start.isValid() || !end.isValid() || !end.isAfter(start)) {
    return 0;
  }

  let resetAt = start.hour(GAME_RESET_HOUR).minute(0).second(0).millisecond(0);
  if (resetAt.isBefore(start)) {
    resetAt = resetAt.add(1, "day");
  }

  let days = 0;
  while (resetAt.isBefore(end)) {
    days += 1;
    resetAt = resetAt.add(1, "day");
  }

  return days;
}

export function getShopResourcePurchaseDaysLimit(
  eventUid: string,
  shopResourceUid: string,
  defaultPurchaseDays: number,
) {
  return SHOP_RESOURCE_PURCHASE_DAYS_LIMITS[eventUid]?.[shopResourceUid] ?? defaultPurchaseDays;
}
