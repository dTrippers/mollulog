import type { RunType, TimelineContentType } from "~/domain/timeline-content";
import type { TimelineContentNameI18n } from "~/domain/timeline-content-name-i18n";
import { isInstantAfter, toUtcIso, type UtcIsoString } from "~/lib/date-time";

export type TimelineAutoSyncCandidate = {
  uid: string;
  contentType: TimelineContentType;
  contentUid: string;
  runType: RunType;
  occurrence: number | null;
  nameI18n: TimelineContentNameI18n;
  startAt: UtcIsoString;
  /** When the content itself ends at the source. Not the same as `end_at`; see `toSchedule`. */
  contentEndAt: UtcIsoString | null;
  confirmed: boolean;
};

export type TimelineAutoSyncExistingRow = {
  uid: string;
  contentType: string;
  contentUid: string | null;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
};

export type TimelineAutoSyncSchedule = {
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
};

export type TimelineAutoSyncCreate = Omit<TimelineAutoSyncCandidate, "contentEndAt"> & TimelineAutoSyncSchedule;
export type TimelineAutoSyncUpdate = TimelineAutoSyncSchedule & { uid: string };

export type TimelineAutoSyncPlan = {
  creates: TimelineAutoSyncCreate[];
  updates: TimelineAutoSyncUpdate[];
  /** The uid is taken by a row for a different content, so neither side is touched. */
  conflictUids: string[];
  /** Future rows of this content type that the source no longer lists. Reported, never changed. */
  missingUids: string[];
};

function toCreatedSchedule(candidate: TimelineAutoSyncCandidate): TimelineAutoSyncSchedule {
  return {
    startAt: candidate.startAt,
    endAt: candidate.contentEndAt,
    endless: candidate.contentEndAt === null,
  };
}

/**
 * `end_at` means the content's end only on a non-endless row. An endless row's `end_at` is when it leaves the
 * timeline, which the source knows nothing about, so it keeps its exposure length and moves with the start.
 */
function toUpdatedSchedule(
  candidate: TimelineAutoSyncCandidate,
  existing: TimelineAutoSyncExistingRow,
): TimelineAutoSyncSchedule {
  if (!existing.endless) return toCreatedSchedule(candidate);
  if (existing.endAt === null) return { startAt: candidate.startAt, endAt: null, endless: true };

  const shiftMs = Date.parse(candidate.startAt) - Date.parse(existing.startAt);
  return {
    startAt: candidate.startAt,
    endAt: toUtcIso(Date.parse(existing.endAt) + shiftMs),
    endless: true,
  };
}

function isSameInstant(a: UtcIsoString | null, b: UtcIsoString | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}

function isSameSchedule(existing: TimelineAutoSyncExistingRow, schedule: TimelineAutoSyncSchedule): boolean {
  return (
    isSameInstant(existing.startAt, schedule.startAt) &&
    isSameInstant(existing.endAt, schedule.endAt) &&
    existing.endless === schedule.endless
  );
}

export function planTimelineAutoSync(
  contentType: TimelineContentType,
  candidates: readonly TimelineAutoSyncCandidate[],
  existingRows: readonly TimelineAutoSyncExistingRow[],
  now: UtcIsoString,
): TimelineAutoSyncPlan {
  const existingByUid = new Map(existingRows.map((row) => [row.uid, row]));
  const candidateUids = new Set(candidates.map((candidate) => candidate.uid));
  const plan: TimelineAutoSyncPlan = { creates: [], updates: [], conflictUids: [], missingUids: [] };

  for (const candidate of candidates) {
    const existing = existingByUid.get(candidate.uid);
    if (!existing) {
      const { contentEndAt: _contentEndAt, ...fields } = candidate;
      plan.creates.push({ ...fields, ...toCreatedSchedule(candidate) });
      continue;
    }

    if (existing.contentType !== candidate.contentType || existing.contentUid !== candidate.contentUid) {
      plan.conflictUids.push(candidate.uid);
      continue;
    }

    const schedule = toUpdatedSchedule(candidate, existing);
    if (!isSameSchedule(existing, schedule)) {
      plan.updates.push({ uid: candidate.uid, ...schedule });
    }
  }

  for (const row of existingRows) {
    const expectedAtSource =
      row.contentType === contentType && row.contentUid !== null && isInstantAfter(row.startAt, now);
    if (expectedAtSource && !candidateUids.has(row.uid)) {
      plan.missingUids.push(row.uid);
    }
  }

  return plan;
}
