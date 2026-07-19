import { nanoid } from "nanoid/non-secure";
import {
  defaultPyroxenePlannerOptions,
  normalizePyroxenePlannerOptions,
  type PyroxenePlannerOptions,
  type StoredPyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import {
  createOptimisticApPackageTimelineItems,
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticMonthlyPackageTimelineItems,
  createOptimisticOtherTimelineItems,
  PYROXENE_AP_CHARGE_MAX_COUNT,
  PYROXENE_SOURCE_DEFINITIONS,
  type PyroxeneMonthlyPackageType,
} from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import type { PyroxeneTimelineItem, PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";

export const GUEST_PYROXENE_PLANNER_VERSION = 1 as const;
export const GUEST_PYROXENE_PLANNER_STORAGE_KEY = "mollulog::guest-pyroxene-planner::v1";

export type GuestPyroxeneResources = PickupResources & { inputAt: string };
export type GuestPyroxeneFavorite = { contentUid: string; studentUid: string };

type GuestRecordBase = { recordId: string; createdAt: string };
export type GuestPyroxeneRecord =
  | (GuestRecordBase & {
      kind: "buy";
      quantity: number;
      date: string;
      repeatType?: PyroxeneTimelineRepeatType;
      monthlyCount?: number;
    })
  | (GuestRecordBase & {
      kind: "monthlyPackage";
      startDate: string;
      packageType: PyroxeneMonthlyPackageType;
      autoRepurchase: boolean;
    })
  | (GuestRecordBase & { kind: "apPackage"; startDate: string; autoRepurchase: boolean })
  | (GuestRecordBase & { kind: "attendance"; startDate: string })
  | (GuestRecordBase & {
      kind: "other";
      resources: PickupResources;
      description: string;
      date: string;
    });

export type GuestPyroxenePlannerData = {
  resources: GuestPyroxeneResources | null;
  records: GuestPyroxeneRecord[];
  options: PyroxenePlannerOptions;
  optionsChanged: boolean;
  collectedSourceKeys: string[];
  eventTrials: Record<string, number>;
  favoriteStudents: GuestPyroxeneFavorite[];
};

export type GuestPyroxenePlannerEnvelope = {
  version: typeof GUEST_PYROXENE_PLANNER_VERSION;
  datasetId: string;
  revision: number;
  updatedAt: string;
  data: GuestPyroxenePlannerData;
};

export type VerifiedGuestPyroxeneImport = {
  resources: boolean;
  options: boolean;
  recordIds: string[];
  sourceKeys: string[];
  eventUids: string[];
  favorites: GuestPyroxeneFavorite[];
};

export function createEmptyGuestPyroxenePlanner(): GuestPyroxenePlannerEnvelope {
  return {
    version: GUEST_PYROXENE_PLANNER_VERSION,
    datasetId: nanoid(16),
    revision: 0,
    updatedAt: new Date().toISOString(),
    data: {
      resources: null,
      records: [],
      options: defaultPyroxenePlannerOptions,
      optionsChanged: false,
      collectedSourceKeys: [],
      eventTrials: {},
      favoriteStudents: [],
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown, min = 0, max = 10_000_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isStableId(value: unknown, length: number): value is string {
  return typeof value === "string" && new RegExp(`^[A-Za-z0-9_-]{${length}}$`).test(value);
}

function parseResources(value: unknown): GuestPyroxeneResources | null | undefined {
  if (value === null) return null;
  if (!isPlainObject(value) || !isIsoDate(value.inputAt)) return undefined;
  if (
    !isFiniteInteger(value.pyroxene) ||
    !isFiniteInteger(value.oneTimeTicket) ||
    !isFiniteInteger(value.tenTimeTicket)
  ) {
    return undefined;
  }
  return {
    inputAt: value.inputAt,
    pyroxene: value.pyroxene,
    oneTimeTicket: value.oneTimeTicket,
    tenTimeTicket: value.tenTimeTicket,
  };
}

function parseOptions(value: unknown): PyroxenePlannerOptions | null {
  if (!isPlainObject(value)) return null;
  const { event, raid, tactical, consumption, timeline } = value;
  if (
    !isPlainObject(event) ||
    !["average", "average_pity", "ceil"].includes(String(event.pickupChance)) ||
    !isPlainObject(raid) ||
    !["platinum", "gold", "silver", "bronze"].includes(String(raid.tier)) ||
    !isPlainObject(tactical) ||
    !["in10", "in100", "in200", "over200"].includes(String(tactical.level)) ||
    !isPlainObject(consumption) ||
    !isFiniteInteger(consumption.apChargeCount, 0, PYROXENE_AP_CHARGE_MAX_COUNT) ||
    !isPlainObject(timeline) ||
    !Array.isArray(timeline.display)
  ) {
    return null;
  }
  const validSources = new Set<string>(PYROXENE_SOURCE_DEFINITIONS.map(({ type }) => type));
  if (!timeline.display.every((source) => typeof source === "string" && validSources.has(source))) return null;
  return normalizePyroxenePlannerOptions(value as StoredPyroxenePlannerOptions);
}

function parseRecord(value: unknown): GuestPyroxeneRecord | null {
  if (!isPlainObject(value) || !isStableId(value.recordId, 12) || !isIsoDate(value.createdAt)) {
    return null;
  }
  const base = { recordId: value.recordId, createdAt: value.createdAt };
  if (
    value.kind === "buy" &&
    isFiniteInteger(value.quantity, 1) &&
    isIsoDate(value.date) &&
    (value.repeatType === undefined || value.repeatType === "fixed_days" || value.repeatType === "monthly_first") &&
    (value.monthlyCount === undefined || isFiniteInteger(value.monthlyCount, 1, 120))
  ) {
    const repeatType = value.repeatType ?? "fixed_days";
    const monthlyCount = value.monthlyCount;
    return { ...base, kind: "buy", quantity: value.quantity, date: value.date, repeatType, monthlyCount };
  }
  if (
    value.kind === "monthlyPackage" &&
    isIsoDate(value.startDate) &&
    (value.packageType === "half" || value.packageType === "full") &&
    typeof value.autoRepurchase === "boolean"
  ) {
    return {
      ...base,
      kind: value.kind,
      startDate: value.startDate,
      packageType: value.packageType,
      autoRepurchase: value.autoRepurchase,
    };
  }
  if (value.kind === "apPackage" && isIsoDate(value.startDate) && typeof value.autoRepurchase === "boolean") {
    return { ...base, kind: value.kind, startDate: value.startDate, autoRepurchase: value.autoRepurchase };
  }
  if (value.kind === "attendance" && isIsoDate(value.startDate)) {
    return { ...base, kind: value.kind, startDate: value.startDate };
  }
  if (
    value.kind === "other" &&
    isPlainObject(value.resources) &&
    typeof value.description === "string" &&
    value.description.length <= 200 &&
    isIsoDate(value.date)
  ) {
    const resources = value.resources;
    if (
      isFiniteInteger(resources.pyroxene) &&
      isFiniteInteger(resources.oneTimeTicket) &&
      isFiniteInteger(resources.tenTimeTicket)
    ) {
      return {
        ...base,
        kind: value.kind,
        date: value.date,
        description: value.description,
        resources: {
          pyroxene: resources.pyroxene,
          oneTimeTicket: resources.oneTimeTicket,
          tenTimeTicket: resources.tenTimeTicket,
        },
      };
    }
  }
  return null;
}

export function parseGuestPyroxenePlanner(raw: string): GuestPyroxenePlannerEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isPlainObject(parsed) ||
    parsed.version !== 1 ||
    !isStableId(parsed.datasetId, 16) ||
    !isFiniteInteger(parsed.revision, 0) ||
    !isIsoDate(parsed.updatedAt) ||
    !isPlainObject(parsed.data)
  ) {
    return null;
  }
  const data = parsed.data;
  const resources = parseResources(data.resources);
  if (resources === undefined || !Array.isArray(data.records) || data.records.length > 500) return null;
  const records = data.records.map(parseRecord);
  if (records.some((record) => record === null)) return null;

  if (
    !Array.isArray(data.collectedSourceKeys) ||
    data.collectedSourceKeys.length > 1_000 ||
    !data.collectedSourceKeys.every((value) => typeof value === "string" && value.length > 0 && value.length <= 200) ||
    !Array.isArray(data.favoriteStudents) ||
    data.favoriteStudents.length > 1_000 ||
    !data.favoriteStudents.every(
      (value) =>
        isPlainObject(value) &&
        typeof value.contentUid === "string" &&
        typeof value.studentUid === "string" &&
        value.contentUid.length > 0 &&
        value.studentUid.length > 0 &&
        value.contentUid.length <= 200 &&
        value.studentUid.length <= 200,
    ) ||
    !isPlainObject(data.eventTrials) ||
    typeof data.optionsChanged !== "boolean"
  ) {
    return null;
  }
  const collectedSourceKeys = [...new Set(data.collectedSourceKeys as string[])];
  const favoriteStudents = (data.favoriteStudents as GuestPyroxeneFavorite[]).filter(
    (favorite, index, all) =>
      all.findIndex(
        (candidate) => candidate.contentUid === favorite.contentUid && candidate.studentUid === favorite.studentUid,
      ) === index,
  );
  const eventTrials: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.eventTrials)) {
    if (key.length === 0 || key.length > 200 || !isFiniteInteger(value, 0, 10_000)) return null;
    eventTrials[key] = value;
  }
  const options = parseOptions(data.options);
  if (!options) return null;
  return {
    version: 1,
    datasetId: parsed.datasetId,
    revision: parsed.revision,
    updatedAt: parsed.updatedAt,
    data: {
      resources,
      records: records as GuestPyroxeneRecord[],
      options,
      optionsChanged: data.optionsChanged,
      collectedSourceKeys,
      eventTrials,
      favoriteStudents,
    },
  };
}

export function guestPyroxeneRecordToTimelineItems(record: GuestPyroxeneRecord): PyroxeneTimelineItem[] {
  switch (record.kind) {
    case "buy":
      return createOptimisticBuyTimelineItems(record.quantity, new Date(record.date), {
        repeatType: record.repeatType,
        monthlyCount: record.monthlyCount,
        uid: record.recordId,
      });
    case "monthlyPackage":
      return createOptimisticMonthlyPackageTimelineItems(
        new Date(record.startDate),
        record.packageType,
        record.autoRepurchase,
        record.recordId,
      );
    case "apPackage":
      return createOptimisticApPackageTimelineItems(new Date(record.startDate), record.autoRepurchase, record.recordId);
    case "attendance":
      return createOptimisticAttendanceTimelineItems(new Date(record.startDate), record.recordId);
    case "other":
      return createOptimisticOtherTimelineItems(
        record.resources,
        record.description,
        new Date(record.date),
        record.recordId,
      );
  }
}

export function guestPyroxeneTimelineItems(data: GuestPyroxenePlannerData): PyroxeneTimelineItem[] {
  return data.records.flatMap(guestPyroxeneRecordToTimelineItems);
}

export function pyroxeneTimelineItemFingerprint(item: PyroxeneTimelineItem): string {
  return JSON.stringify({
    eventAt: item.eventAt,
    source: item.source,
    repeatType: item.repeatType,
    repeatIntervalDays: item.repeatIntervalDays,
    repeatCount: item.repeatCount,
    autoRepurchase: item.autoRepurchase,
    description: item.description,
    pyroxeneDelta: item.pyroxeneDelta,
    oneTimeTicketDelta: item.oneTimeTicketDelta,
    tenTimeTicketDelta: item.tenTimeTicketDelta,
  });
}

export function guestPyroxeneRecordFingerprint(record: GuestPyroxeneRecord): string {
  return guestPyroxeneRecordToTimelineItems(record).map(pyroxeneTimelineItemFingerprint).sort().join("|");
}

export function hasGuestPyroxenePlannerData(data: GuestPyroxenePlannerData): boolean {
  return Boolean(
    data.resources ||
      data.records.length ||
      data.optionsChanged ||
      data.collectedSourceKeys.length ||
      Object.keys(data.eventTrials).length ||
      data.favoriteStudents.length,
  );
}

function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function clearVerifiedGuestPyroxeneImport(
  current: GuestPyroxenePlannerData,
  submitted: GuestPyroxenePlannerData,
  verified: VerifiedGuestPyroxeneImport,
): GuestPyroxenePlannerData {
  const verifiedRecordIds = new Set(verified.recordIds);
  const submittedRecords = new Map(submitted.records.map((record) => [record.recordId, record]));
  const verifiedSourceKeys = new Set(verified.sourceKeys);
  const verifiedEventUids = new Set(verified.eventUids);
  const verifiedFavoriteKeys = new Set(
    verified.favorites.map((favorite) => `${favorite.contentUid}\u0000${favorite.studentUid}`),
  );
  const eventTrials = { ...current.eventTrials };

  for (const eventUid of verifiedEventUids) {
    if (current.eventTrials[eventUid] === submitted.eventTrials[eventUid]) delete eventTrials[eventUid];
  }

  const clearResources =
    verified.resources && current.resources !== null && isSameValue(current.resources, submitted.resources);
  const clearOptions = verified.options && current.optionsChanged && isSameValue(current.options, submitted.options);

  return {
    ...current,
    resources: clearResources ? null : current.resources,
    options: clearOptions ? defaultPyroxenePlannerOptions : current.options,
    optionsChanged: clearOptions ? false : current.optionsChanged,
    records: current.records.filter((record) => {
      if (!verifiedRecordIds.has(record.recordId)) return true;
      return !isSameValue(record, submittedRecords.get(record.recordId));
    }),
    collectedSourceKeys: current.collectedSourceKeys.filter((key) => !verifiedSourceKeys.has(key)),
    eventTrials,
    favoriteStudents: current.favoriteStudents.filter(
      (favorite) => !verifiedFavoriteKeys.has(`${favorite.contentUid}\u0000${favorite.studentUid}`),
    ),
  };
}

export function createGuestRecord<T extends Omit<GuestPyroxeneRecord, "recordId" | "createdAt">>(
  record: T,
): T & GuestRecordBase {
  return { ...record, recordId: nanoid(12), createdAt: new Date().toISOString() };
}
