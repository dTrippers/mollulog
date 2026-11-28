import type { RunType, TimelineContentType } from "~/domain/timeline-content";
import type { TimelineContentNameI18n } from "~/domain/timeline-content-name-i18n";
import { isInstantAfter, toUtcIso, type UtcIsoString } from "~/lib/date-time";

/** What identifies the content a timeline row shows. Row uids are irregular, so rows are matched by this. */
export type TimelineAutoSyncContentKey = {
  contentType: TimelineContentType;
  contentUid: string;
  runType: RunType;
  occurrence: number | null;
};

/** The fields a row created for a candidate gets. */
export type TimelineAutoSyncCreateFields = {
  uid: string;
  nameI18n: TimelineContentNameI18n;
  confirmed: boolean;
};

export type TimelineAutoSyncCandidate = TimelineAutoSyncContentKey & {
  startAt: UtcIsoString;
  /**
   * When the content itself ends at the source. Not the same as `end_at`; see `toUpdatedSchedule`.
   * `"release"` means the source knows only a release time (main and mini stories), so the row keeps its own end.
   */
  contentEndAt: UtcIsoString | null | "release";
  /** Null when the source may only update an existing row; an admin creates those rows. */
  create: TimelineAutoSyncCreateFields | null;
  /** The JP season a GL raid schedule corresponds to. Undefined for other contents; null when the source has none. */
  jpRaidSeason?: TimelineAutoSyncJpRaidSeason | null;
};

/** A JP raid season by its client values. A GL season number is a prediction, so a raid row is found by this. */
export type TimelineAutoSyncJpRaidSeason = { raidType: string; seasonIndex: number };

export type TimelineAutoSyncExistingRow = {
  uid: string;
  contentType: string;
  contentUid: string | null;
  runType: string;
  occurrence: number | null;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
  jpRaidType: string | null;
  jpRaidSeasonIndex: number | null;
};

export type TimelineAutoSyncSchedule = {
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
};

export type TimelineAutoSyncCreate = TimelineAutoSyncContentKey &
  TimelineAutoSyncCreateFields &
  TimelineAutoSyncSchedule & { jpRaidType: string | null; jpRaidSeasonIndex: number | null };
/**
 * The key the row was found by. The write changes the row only while it still has this key, because an admin may
 * change the row between the read and the write.
 */
export type TimelineAutoSyncUpdateMatch =
  | ({ kind: "content" } & TimelineAutoSyncContentKey)
  | ({ kind: "jpRaidSeason"; contentType: TimelineContentType } & TimelineAutoSyncJpRaidSeason);

export type TimelineAutoSyncUpdate = TimelineAutoSyncSchedule & {
  uid: string;
  match: TimelineAutoSyncUpdateMatch;
  /** The row's schedule as read. The write changes the row only while it still has it, so an admin's edit wins. */
  readSchedule: TimelineAutoSyncSchedule;
  /** A raid row's GL schedule uid as BAQL issued it, set when it differs. Never used to find the row. */
  contentUid?: string;
};

/** How a source's existing rows are updated. Every source added after campaigns and drills uses the defaults. */
export type TimelineAutoSyncUpdatePolicy = {
  /**
   * Campaigns and drills also update a matched row that has started: BAQL lists them until they end, and a running
   * campaign's end can still change. Other sources touch only rows that start after now.
   */
  updateStartedRows: boolean;
  /**
   * When the source knows no end, keep the row's own end and length (new sources) instead of making the row endless
   * with no end (campaigns and drills, as before).
   */
  keepOwnEndWithoutSourceEnd: boolean;
  /**
   * How a candidate finds its row. `content` uses the content key, whose values are in-game ids. `jpRaidSeason` (raids)
   * uses the JP season, because a GL raid schedule's uid is assembled from a predicted GL season number.
   */
  matchBy: "content" | "jpRaidSeason";
};

export const DEFAULT_TIMELINE_AUTO_SYNC_UPDATE_POLICY: TimelineAutoSyncUpdatePolicy = {
  updateStartedRows: false,
  keepOwnEndWithoutSourceEnd: true,
  matchBy: "content",
};

export type TimelineAutoSyncPlan = {
  /** Whether `updates` may hold rows that have started; the write keeps the same rule. */
  updateStartedRows: boolean;
  /** `jpRaidSeason`: the write checks the current raid rows again before it creates any. */
  matchBy: TimelineAutoSyncUpdatePolicy["matchBy"];
  creates: TimelineAutoSyncCreate[];
  updates: TimelineAutoSyncUpdate[];
  /** A new row's uid is taken by a row for a different content, so neither side is touched. */
  conflictUids: string[];
  /** Rows sharing one content key with another row. None of them is touched. */
  duplicateUids: string[];
  /** Future rows of this content type that the source does not list. Reported, never changed. */
  missingUids: string[];
  /** `jpRaidSeason` only: GL schedules without a JP schedule (their content uids). Nothing is written for them. */
  withoutJpRaidSeasonContentUids: string[];
  /** `jpRaidSeason` only: future rows without a JP season. While any exists, no row is created. */
  unlinkedUids: string[];
  /**
   * `jpRaidSeason` only: GL schedules (content uids) sharing one JP season, counted over every GL schedule the source
   * returned, including those that cannot become a candidate. Nothing is written for that season.
   */
  ambiguousJpRaidSeasonContentUids: string[];
};

export function formatTimelineAutoSyncContentKey(
  key: TimelineAutoSyncContentKey | TimelineAutoSyncExistingRow,
): string {
  return JSON.stringify([key.contentType, key.contentUid, key.runType, key.occurrence]);
}

function formatJpRaidSeason(season: TimelineAutoSyncJpRaidSeason): string {
  return JSON.stringify([season.raidType, season.seasonIndex]);
}

function rowMatchKey(row: TimelineAutoSyncExistingRow, matchBy: TimelineAutoSyncUpdatePolicy["matchBy"]) {
  if (matchBy === "content") return row.contentUid === null ? null : formatTimelineAutoSyncContentKey(row);
  if (row.jpRaidType === null || row.jpRaidSeasonIndex === null) return null;
  return formatJpRaidSeason({ raidType: row.jpRaidType, seasonIndex: row.jpRaidSeasonIndex });
}

function candidateMatchKey(candidate: TimelineAutoSyncCandidate, matchBy: TimelineAutoSyncUpdatePolicy["matchBy"]) {
  if (matchBy === "content") return formatTimelineAutoSyncContentKey(candidate);
  return candidate.jpRaidSeason ? formatJpRaidSeason(candidate.jpRaidSeason) : null;
}

function toCreatedSchedule(candidate: TimelineAutoSyncCandidate): TimelineAutoSyncSchedule {
  const endAt = candidate.contentEndAt === "release" ? null : candidate.contentEndAt;
  return { startAt: candidate.startAt, endAt, endless: endAt === null };
}

/** Moves the row to the new start and keeps its own length and `endless`. */
function toShiftedSchedule(candidate: TimelineAutoSyncCandidate, existing: TimelineAutoSyncExistingRow) {
  if (existing.endAt === null) return { startAt: candidate.startAt, endAt: null, endless: existing.endless };

  const shiftMs = Date.parse(candidate.startAt) - Date.parse(existing.startAt);
  return {
    startAt: candidate.startAt,
    endAt: toUtcIso(Date.parse(existing.endAt) + shiftMs),
    endless: existing.endless,
  };
}

/**
 * `end_at` means the content's end only on a non-endless row. An endless row's `end_at` is when it leaves the
 * timeline, which the source knows nothing about, so it keeps its exposure length and moves with the start. A source
 * that knows only a release time, or no end, never clears the row's own end either.
 */
function toUpdatedSchedule(
  candidate: TimelineAutoSyncCandidate,
  existing: TimelineAutoSyncExistingRow,
  policy: TimelineAutoSyncUpdatePolicy,
): TimelineAutoSyncSchedule {
  const keepOwnEnd = candidate.contentEndAt === null && policy.keepOwnEndWithoutSourceEnd;
  if (candidate.contentEndAt === "release" || keepOwnEnd || existing.endless) {
    return toShiftedSchedule(candidate, existing);
  }
  return toCreatedSchedule(candidate);
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

function updateMatch(
  candidate: TimelineAutoSyncCandidate,
  matchBy: TimelineAutoSyncUpdatePolicy["matchBy"],
): TimelineAutoSyncUpdateMatch {
  const { contentType, contentUid, runType, occurrence } = candidate;
  if (matchBy === "content" || !candidate.jpRaidSeason) {
    return { kind: "content", contentType, contentUid, runType, occurrence };
  }
  return { kind: "jpRaidSeason", contentType, ...candidate.jpRaidSeason };
}

/** A GL schedule the source returned with a JP season, whether or not it became a candidate. */
export type TimelineAutoSyncJpRaidSeasonReference = {
  contentUid: string;
  jpRaidSeason: TimelineAutoSyncJpRaidSeason;
};

/**
 * Plans the writes for one content type. `existingRows` holds every row of the type, whatever its period, plus the
 * rows holding the uids of rows the candidates would create. Only rows starting after `now` are changed, unless the
 * policy also updates started rows. Which candidates may create a row is the source's choice (`create`).
 */
export function planTimelineAutoSync(
  contentType: TimelineContentType,
  candidates: readonly TimelineAutoSyncCandidate[],
  existingRows: readonly TimelineAutoSyncExistingRow[],
  now: UtcIsoString,
  policy: TimelineAutoSyncUpdatePolicy = DEFAULT_TIMELINE_AUTO_SYNC_UPDATE_POLICY,
  /** `jpRaidSeason`: every returned GL schedule with a JP season. Defaults to the candidates'. */
  jpRaidSeasonReferences?: readonly TimelineAutoSyncJpRaidSeasonReference[],
): TimelineAutoSyncPlan {
  const { matchBy } = policy;
  const isFuture = (row: TimelineAutoSyncExistingRow) => isInstantAfter(row.startAt, now);
  const isUpdatable = (row: TimelineAutoSyncExistingRow) => policy.updateStartedRows || isFuture(row);

  const rowsOfType = existingRows.filter((row) => row.contentType === contentType);
  const rowsByKey = new Map<string, TimelineAutoSyncExistingRow[]>();
  for (const row of rowsOfType) {
    const key = rowMatchKey(row, matchBy);
    if (key !== null) rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }
  const existingUids = new Set(existingRows.map((row) => row.uid));
  const candidateKeys = new Set<string>();
  const plan: TimelineAutoSyncPlan = {
    updateStartedRows: policy.updateStartedRows,
    matchBy,
    creates: [],
    updates: [],
    conflictUids: [],
    duplicateUids: [],
    missingUids: [],
    withoutJpRaidSeasonContentUids: [],
    unlinkedUids:
      matchBy === "jpRaidSeason"
        ? rowsOfType.filter((row) => isFuture(row) && rowMatchKey(row, matchBy) === null).map((row) => row.uid)
        : [],
    ambiguousJpRaidSeasonContentUids: [],
  };
  // A row without a JP season may already show a candidate's season, so a new row could duplicate it.
  const createsAllowed = plan.unlinkedUids.length === 0;

  // BAQL does not keep a JP season to one GL schedule; when several refer to it, which one is right is unknown.
  const ambiguousKeys = new Set<string>();
  if (matchBy === "jpRaidSeason") {
    const references =
      jpRaidSeasonReferences ??
      candidates.flatMap((candidate) =>
        candidate.jpRaidSeason ? [{ contentUid: candidate.contentUid, jpRaidSeason: candidate.jpRaidSeason }] : [],
      );
    const referencesByKey = new Map<string, string[]>();
    for (const reference of references) {
      const key = formatJpRaidSeason(reference.jpRaidSeason);
      referencesByKey.set(key, [...(referencesByKey.get(key) ?? []), reference.contentUid]);
    }
    for (const [key, contentUids] of referencesByKey) {
      if (contentUids.length < 2) continue;
      ambiguousKeys.add(key);
      // The season is listed at the source, so its row is not missing there.
      candidateKeys.add(key);
      plan.ambiguousJpRaidSeasonContentUids.push(...contentUids);
    }
  }

  for (const candidate of candidates) {
    const key = candidateMatchKey(candidate, matchBy);
    if (key === null) {
      plan.withoutJpRaidSeasonContentUids.push(candidate.contentUid);
      continue;
    }
    candidateKeys.add(key);
    if (ambiguousKeys.has(key)) continue;
    const matches = rowsByKey.get(key) ?? [];

    if (matches.length > 1) {
      if (matches.some(isUpdatable)) plan.duplicateUids.push(...matches.map((row) => row.uid));
      continue;
    }

    const [existing] = matches;
    if (existing) {
      // Past and ongoing rows are history unless the source's policy says otherwise.
      if (!isUpdatable(existing)) continue;

      const schedule = toUpdatedSchedule(candidate, existing, policy);
      // A raid row found by its JP season takes the GL schedule uid BAQL issued; other rows were found by it.
      const contentUid =
        matchBy === "jpRaidSeason" && candidate.contentUid !== existing.contentUid ? candidate.contentUid : undefined;
      if (!isSameSchedule(existing, schedule) || contentUid !== undefined) {
        plan.updates.push({
          uid: existing.uid,
          ...schedule,
          match: updateMatch(candidate, matchBy),
          readSchedule: { startAt: existing.startAt, endAt: existing.endAt, endless: existing.endless },
          ...(contentUid !== undefined ? { contentUid } : {}),
        });
      }
      continue;
    }

    if (!candidate.create || !createsAllowed) continue;
    if (existingUids.has(candidate.create.uid)) {
      plan.conflictUids.push(candidate.create.uid);
      continue;
    }
    existingUids.add(candidate.create.uid);
    plan.creates.push({
      contentType: candidate.contentType,
      contentUid: candidate.contentUid,
      runType: candidate.runType,
      occurrence: candidate.occurrence,
      ...candidate.create,
      ...toCreatedSchedule(candidate),
      jpRaidType: candidate.jpRaidSeason?.raidType ?? null,
      jpRaidSeasonIndex: candidate.jpRaidSeason?.seasonIndex ?? null,
    });
  }

  for (const row of rowsOfType) {
    const key = rowMatchKey(row, matchBy);
    if (key !== null && isFuture(row) && !candidateKeys.has(key)) {
      plan.missingUids.push(row.uid);
    }
  }

  return plan;
}
