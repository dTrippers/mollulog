import { compareInstantAsc, getInstantTime, type UtcIsoString } from "~/lib/date-time";

export type EventShopDestinationCandidate = {
  uid: string;
  since: UtcIsoString;
  until: UtcIsoString | null;
};

function compareCandidates(a: EventShopDestinationCandidate, b: EventShopDestinationCandidate): number {
  return compareInstantAsc(a.since, b.since) || a.uid.localeCompare(b.uid);
}

function compareOngoingCandidates(a: EventShopDestinationCandidate, b: EventShopDestinationCandidate): number {
  return compareInstantAsc(b.since, a.since) || a.uid.localeCompare(b.uid);
}

function isOngoing(candidate: EventShopDestinationCandidate, now: UtcIsoString): boolean {
  if (candidate.until === null) {
    return false;
  }

  const nowTime = getInstantTime(now);
  const sinceTime = getInstantTime(candidate.since);
  const untilTime = getInstantTime(candidate.until);
  return sinceTime <= nowTime && nowTime < untilTime;
}

export function selectEventShopDestination(
  candidates: readonly EventShopDestinationCandidate[],
  now: UtcIsoString,
): EventShopDestinationCandidate | null {
  const ongoing = candidates.filter((candidate) => isOngoing(candidate, now)).sort(compareOngoingCandidates);
  if (ongoing.length > 0) {
    return ongoing[0];
  }

  return (
    candidates
      .filter((candidate) => getInstantTime(candidate.since) > getInstantTime(now))
      .sort(compareCandidates)[0] ?? null
  );
}

export function getEventShopDestinationPath(uid: string): string {
  return `/events/${uid}/shop`;
}
