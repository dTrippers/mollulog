import { isInstantAfter, type UtcIsoString } from "~/lib/date-time";
import type { EventType, RaidType } from "~/models/content.d";
import type { ContentFilterState } from "./content-filter-state";
import { matchesContentFilter } from "./futures-view-model";

type FeaturedContent = {
  uid: string;
  featuredUntil: UtcIsoString | null;
  contentType: EventType | RaidType;
  raidInfo?: { raidType: RaidType };
  recruitments: { pickup: boolean }[];
};

export function selectFeaturedContent<T extends FeaturedContent>(
  contents: readonly T[],
  filter: ContentFilterState,
  now: UtcIsoString,
): T | null {
  const featured = contents.find(
    (content) => content.featuredUntil !== null && isInstantAfter(content.featuredUntil, now),
  );
  return featured && matchesContentFilter(featured, filter) ? featured : null;
}
