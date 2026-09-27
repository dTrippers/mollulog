import { nanoid } from "nanoid/non-secure";
import {
  type EventShopOwnedQuantityPatch,
  type EventShopState,
  mergeEventShopStateChanges,
  normalizeEventShopState,
  patchEventShopOwnedQuantities,
} from "~/domain/event-shop-state";
import {
  createEmptyGuestEventShopPlanner,
  type GuestEventShopPlan,
  type GuestEventShopPlannerData,
  type GuestEventShopPlannerEnvelope,
  normalizeGuestEventShopPlanner,
  upsertGuestEventShopPlan,
} from "~/domain/guest-event-shop-planner";
import {
  createEmptyGuestPyroxenePlanner,
  type GuestPyroxeneFavorite,
  type GuestPyroxenePlannerData,
  type GuestPyroxenePlannerEnvelope,
  type GuestPyroxeneRecord,
  type GuestPyroxeneResources,
  guestPyroxeneRecordToTimelineItems,
  guestPyroxeneTimelineItems,
  parseGuestPyroxenePlanner,
} from "~/domain/guest-pyroxene-planner";
import {
  type PlannerStateDocumentV1,
  type PlannerStateTimelineRecord,
  projectPlannerStateDocument,
  sortPlannerStateTimelineRecords,
} from "~/domain/planner-state";
import {
  defaultPyroxenePlannerOptions,
  normalizePyroxenePlannerOptions,
  type PyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import {
  extractPyroxeneTimelineBaseUid,
  PYROXENE_ATTENDANCE_CONFIG,
  PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS,
  PYROXENE_MONTHLY_PACKAGE_CONFIG,
} from "~/domain/pyroxene-sources";
import dayjs from "~/lib/dayjs";

export const GUEST_PLANNER_STORAGE_KEY = "mollulog::guest-planner::v1";

const MAX_GUEST_PLANNER_RECORDS = 500;
const MAX_GUEST_PLANNER_COLLECTED_SOURCE_KEYS = 1_000;
const MAX_GUEST_PLANNER_FAVORITES = 1_000;
const MAX_GUEST_PLANNER_EVENT_DATA = 500;
const MAX_GUEST_PLANNER_EVENT_SHOPS = 500;
const MAX_GUEST_PLANNER_LEGACY_CONFLICTS = 20;
const MAX_GUEST_PLANNER_ID_LENGTH = 200;
const MAX_EVENT_SHOP_STATE_ENTRIES = 5_000;

export type GuestPlannerEnvelope = {
  datasetId: string;
  revision: number;
  updatedAt: string;
  document: PlannerStateDocumentV1;
  pyroxeneOptionsChanged: boolean;
  favorites: GuestPyroxeneFavorite[];
  eventShopTimelineUids: Record<string, string>;
  legacyMirror: GuestPlannerLegacyMirror | null;
  legacyConflicts: GuestPlannerLegacyConflict[];
  legacyUnreadable: { pyroxene: string | null; eventShops: string | null };
};

export type GuestPlannerLegacyMirror = {
  pyroxene: GuestPyroxenePlannerEnvelope;
  eventShops: GuestEventShopPlannerEnvelope;
};

export type GuestPlannerLegacyConflictKeys = {
  pyroxene: {
    resources: boolean;
    records: string[];
    options: boolean;
    eventTrials: string[];
    favorites: string[];
    collectedSourceKeys: string[];
  };
  eventShopUids: string[];
  removed: {
    resources: boolean;
    records: string[];
    eventTrials: string[];
    favorites: string[];
    collectedSourceKeys: string[];
    eventShopUids: string[];
  };
};

export type GuestPlannerLegacyConflict = {
  id: string;
  pyroxene: GuestPyroxenePlannerEnvelope | null;
  eventShops: GuestEventShopPlannerEnvelope | null;
  keys: GuestPlannerLegacyConflictKeys;
};

export type GuestPlannerSection =
  | "resources"
  | "records"
  | "options"
  | "recruitment"
  | "collectedSourceKeys"
  | "eventShops";

export type GuestPlannerLegacySources = {
  pyroxene: GuestPyroxenePlannerEnvelope | null;
  eventShops: GuestEventShopPlannerEnvelope | null;
  pyroxeneSignature: string | null;
  eventShopsSignature: string | null;
  pyroxeneCorrupt: boolean;
  eventShopsCorrupt: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isFavorite(value: unknown): value is GuestPyroxeneFavorite {
  return (
    isRecord(value) &&
    isStableId(value.contentUid) &&
    isStableId(value.studentUid) &&
    value.contentUid.length <= 200 &&
    value.studentUid.length <= 200
  );
}

function hasBoundedEventShopState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  let entryCount = 0;
  const mapFields = [
    "itemQuantities",
    "itemPurchaseDays",
    "selectedBonusStudentUidsByItem",
    "enabledStages",
    "existingPaymentItemQuantities",
    "extraStageRuns",
    "overriddenRequiredQuantities",
  ];
  for (const field of mapFields) {
    const map = value[field];
    if (!isRecord(map)) return false;
    const entries = Object.entries(map);
    if (
      entries.length > 1_000 ||
      entries.some(([key]) => key.length === 0 || key.length > MAX_GUEST_PLANNER_ID_LENGTH)
    ) {
      return false;
    }
    entryCount += entries.length;
    if (entryCount > MAX_EVENT_SHOP_STATE_ENTRIES) return false;
    if (field === "selectedBonusStudentUidsByItem") {
      for (const [, students] of entries) {
        if (
          !Array.isArray(students) ||
          students.length > MAX_GUEST_PLANNER_FAVORITES ||
          students.some(
            (studentUid) => typeof studentUid !== "string" || studentUid.length === 0 || studentUid.length > 200,
          )
        ) {
          return false;
        }
        entryCount += students.length;
        if (entryCount > MAX_EVENT_SHOP_STATE_ENTRIES) return false;
      }
    }
  }
  const selectedStudents = value.selectedBonusStudentUids;
  if (
    !Array.isArray(selectedStudents) ||
    selectedStudents.length > MAX_GUEST_PLANNER_FAVORITES ||
    selectedStudents.some(
      (studentUid) => typeof studentUid !== "string" || studentUid.length === 0 || studentUid.length > 200,
    )
  ) {
    return false;
  }
  entryCount += selectedStudents.length;
  return entryCount <= MAX_EVENT_SHOP_STATE_ENTRIES;
}

function normalizeLegacyPyroxene(value: unknown): GuestPyroxenePlannerEnvelope | null {
  try {
    return parseGuestPyroxenePlanner(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeLegacyEventShops(value: unknown): GuestEventShopPlannerEnvelope | null {
  try {
    if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.plans)) return null;
    const plans = Object.entries(value.data.plans);
    if (
      plans.length > MAX_GUEST_PLANNER_EVENT_SHOPS ||
      plans.some(
        ([key, plan]) =>
          key.length > MAX_GUEST_PLANNER_ID_LENGTH ||
          !isRecord(plan) ||
          typeof plan.timelineUid !== "string" ||
          plan.timelineUid.length > MAX_GUEST_PLANNER_ID_LENGTH ||
          typeof plan.shopStateUid !== "string" ||
          plan.shopStateUid.length > MAX_GUEST_PLANNER_ID_LENGTH ||
          !hasBoundedEventShopState(plan.state),
      )
    ) {
      return null;
    }
    return normalizeGuestEventShopPlanner(value);
  } catch {
    return null;
  }
}

function isStringList(value: unknown, maxCount: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxCount &&
    value.every((item) => typeof item === "string" && item.length > 0 && item.length <= MAX_GUEST_PLANNER_ID_LENGTH)
  );
}

function normalizeLegacyConflict(value: unknown): GuestPlannerLegacyConflict | null {
  if (
    !isRecord(value) ||
    !isStableId(value.id) ||
    value.id.length > MAX_GUEST_PLANNER_ID_LENGTH ||
    !isRecord(value.keys)
  )
    return null;
  const pyroxene = value.pyroxene === null ? null : normalizeLegacyPyroxene(value.pyroxene);
  const eventShops = value.eventShops === null ? null : normalizeLegacyEventShops(value.eventShops);
  if ((value.pyroxene !== null && !pyroxene) || (value.eventShops !== null && !eventShops)) return null;
  const keys = value.keys;
  if (
    !isRecord(keys.pyroxene) ||
    typeof keys.pyroxene.resources !== "boolean" ||
    !isStringList(keys.pyroxene.records, MAX_GUEST_PLANNER_RECORDS) ||
    typeof keys.pyroxene.options !== "boolean" ||
    !isStringList(keys.pyroxene.eventTrials, MAX_GUEST_PLANNER_EVENT_DATA) ||
    !isStringList(keys.pyroxene.favorites, MAX_GUEST_PLANNER_FAVORITES) ||
    !isStringList(keys.pyroxene.collectedSourceKeys, MAX_GUEST_PLANNER_COLLECTED_SOURCE_KEYS) ||
    !isStringList(keys.eventShopUids, MAX_GUEST_PLANNER_EVENT_SHOPS) ||
    !isRecord(keys.removed) ||
    typeof keys.removed.resources !== "boolean" ||
    !isStringList(keys.removed.records, MAX_GUEST_PLANNER_RECORDS) ||
    !isStringList(keys.removed.eventTrials, MAX_GUEST_PLANNER_EVENT_DATA) ||
    !isStringList(keys.removed.favorites, MAX_GUEST_PLANNER_FAVORITES) ||
    !isStringList(keys.removed.collectedSourceKeys, MAX_GUEST_PLANNER_COLLECTED_SOURCE_KEYS) ||
    !isStringList(keys.removed.eventShopUids, MAX_GUEST_PLANNER_EVENT_SHOPS)
  ) {
    return null;
  }
  return {
    id: value.id,
    pyroxene,
    eventShops,
    keys: {
      pyroxene: {
        resources: keys.pyroxene.resources,
        records: keys.pyroxene.records,
        options: keys.pyroxene.options,
        eventTrials: keys.pyroxene.eventTrials,
        favorites: keys.pyroxene.favorites,
        collectedSourceKeys: keys.pyroxene.collectedSourceKeys,
      },
      eventShopUids: keys.eventShopUids,
      removed: {
        resources: keys.removed.resources,
        records: keys.removed.records,
        eventTrials: keys.removed.eventTrials,
        favorites: keys.removed.favorites,
        collectedSourceKeys: keys.removed.collectedSourceKeys,
        eventShopUids: keys.removed.eventShopUids,
      },
    },
  };
}

function emptyPlannerDocument(): PlannerStateDocumentV1 {
  return {
    schemaVersion: 1,
    pyroxene: {
      resources: null,
      records: [],
      options: projectPlannerStateDocument({
        resources: [],
        timelineItems: [],
        plannerOptions: [],
        collectedSources: [],
        eventData: [],
        eventShops: [],
      }).pyroxene.options,
      collectedSourceKeys: [],
      eventData: {},
    },
    eventShops: {},
    ap: null,
  };
}

export function createEmptyGuestPlanner(datasetId = nanoid(16)): GuestPlannerEnvelope {
  return {
    datasetId,
    revision: 0,
    updatedAt: new Date().toISOString(),
    document: emptyPlannerDocument(),
    pyroxeneOptionsChanged: false,
    favorites: [],
    eventShopTimelineUids: {},
    legacyMirror: null,
    legacyConflicts: [],
    legacyUnreadable: { pyroxene: null, eventShops: null },
  };
}

function projectDocument(value: unknown): PlannerStateDocumentV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.pyroxene) || !isRecord(value.eventShops)) {
    return null;
  }
  const pyroxene = value.pyroxene;
  if (
    !(pyroxene.resources === null || isRecord(pyroxene.resources)) ||
    !Array.isArray(pyroxene.records) ||
    pyroxene.records.length > MAX_GUEST_PLANNER_RECORDS ||
    pyroxene.records.some(
      (item) =>
        !isRecord(item) ||
        typeof item.uid !== "string" ||
        item.uid.length === 0 ||
        item.uid.length > MAX_GUEST_PLANNER_ID_LENGTH ||
        typeof item.description !== "string" ||
        item.description.length > 200,
    ) ||
    !isRecord(pyroxene.options) ||
    !Array.isArray(pyroxene.collectedSourceKeys) ||
    pyroxene.collectedSourceKeys.length > MAX_GUEST_PLANNER_COLLECTED_SOURCE_KEYS ||
    pyroxene.collectedSourceKeys.some(
      (key) => typeof key !== "string" || key.length === 0 || key.length > MAX_GUEST_PLANNER_ID_LENGTH,
    ) ||
    !isRecord(pyroxene.eventData) ||
    Object.keys(pyroxene.eventData).length > MAX_GUEST_PLANNER_EVENT_DATA ||
    Object.keys(pyroxene.eventData).some(
      (eventUid) => eventUid.length === 0 || eventUid.length > MAX_GUEST_PLANNER_ID_LENGTH,
    ) ||
    Object.keys(value.eventShops).length > MAX_GUEST_PLANNER_EVENT_SHOPS ||
    Object.entries(value.eventShops).some(
      ([eventUid, state]) =>
        eventUid.length === 0 || eventUid.length > MAX_GUEST_PLANNER_ID_LENGTH || !hasBoundedEventShopState(state),
    ) ||
    value.ap !== null
  ) {
    return null;
  }

  try {
    return projectPlannerStateDocument({
      resources: pyroxene.resources ? [pyroxene.resources] : [],
      timelineItems: pyroxene.records,
      plannerOptions: [{ options: pyroxene.options }],
      collectedSources: pyroxene.collectedSourceKeys.map((sourceKey) => ({ sourceKey })),
      eventData: Object.entries(pyroxene.eventData).map(([eventUid, state]) => ({ eventUid, ...(state as object) })),
      eventShops: Object.entries(value.eventShops).map(([eventUid, state]) => ({ eventUid, ...(state as object) })),
    });
  } catch {
    return null;
  }
}

export function normalizeGuestPlanner(value: unknown): GuestPlannerEnvelope | null {
  if (!isRecord(value)) return null;
  if (
    !isStableId(value.datasetId) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    (value.pyroxeneOptionsChanged !== undefined && typeof value.pyroxeneOptionsChanged !== "boolean") ||
    !Array.isArray(value.favorites) ||
    value.favorites.length > MAX_GUEST_PLANNER_FAVORITES ||
    !value.favorites.every(isFavorite) ||
    !isRecord(value.eventShopTimelineUids) ||
    (value.legacyConflicts !== undefined &&
      (!Array.isArray(value.legacyConflicts) ||
        value.legacyConflicts.length > MAX_GUEST_PLANNER_LEGACY_CONFLICTS ||
        value.legacyConflicts.some((item) => !normalizeLegacyConflict(item)))) ||
    (value.legacyUnreadable !== undefined &&
      (!isRecord(value.legacyUnreadable) ||
        ![value.legacyUnreadable.pyroxene, value.legacyUnreadable.eventShops].every(
          (raw) => raw === null || (typeof raw === "string" && raw.length <= 200_000),
        )))
  ) {
    return null;
  }

  const document = projectDocument(value.document);
  if (!document) return null;
  if (Object.keys(value.eventShopTimelineUids).length > MAX_GUEST_PLANNER_EVENT_SHOPS) return null;
  const eventShopTimelineUids: Record<string, string> = {};
  for (const [shopStateUid, timelineUid] of Object.entries(value.eventShopTimelineUids)) {
    if (
      !isStableId(shopStateUid) ||
      shopStateUid.length > MAX_GUEST_PLANNER_ID_LENGTH ||
      !isStableId(timelineUid) ||
      timelineUid.length > MAX_GUEST_PLANNER_ID_LENGTH ||
      !document.eventShops[shopStateUid]
    )
      return null;
    eventShopTimelineUids[shopStateUid] = timelineUid;
  }
  if (Object.keys(document.eventShops).some((shopStateUid) => !eventShopTimelineUids[shopStateUid])) return null;

  const envelope: GuestPlannerEnvelope = {
    datasetId: value.datasetId,
    revision: value.revision as number,
    updatedAt: value.updatedAt,
    document,
    pyroxeneOptionsChanged:
      (value.pyroxeneOptionsChanged as boolean | undefined) ??
      stableJson(document.pyroxene.options) !== stableJson(emptyPlannerDocument().pyroxene.options),
    favorites: value.favorites as GuestPyroxeneFavorite[],
    eventShopTimelineUids,
    legacyMirror: null,
    legacyConflicts: (value.legacyConflicts ?? [])
      .map(normalizeLegacyConflict)
      .filter((item): item is GuestPlannerLegacyConflict => item !== null),
    legacyUnreadable: {
      pyroxene: (value.legacyUnreadable as GuestPlannerEnvelope["legacyUnreadable"] | undefined)?.pyroxene ?? null,
      eventShops: (value.legacyUnreadable as GuestPlannerEnvelope["legacyUnreadable"] | undefined)?.eventShops ?? null,
    },
  };
  if (value.legacyMirror === null) {
    envelope.legacyMirror = null;
  } else if (value.legacyMirror !== undefined) {
    if (!isRecord(value.legacyMirror)) return null;
    const pyroxene = normalizeLegacyPyroxene(value.legacyMirror.pyroxene);
    const eventShops = normalizeLegacyEventShops(value.legacyMirror.eventShops);
    if (!pyroxene || !eventShops) return null;
    envelope.legacyMirror = { pyroxene, eventShops };
  }
  return envelope;
}

export function parseGuestPlanner(raw: string): GuestPlannerEnvelope | null {
  try {
    return normalizeGuestPlanner(JSON.parse(raw));
  } catch {
    return null;
  }
}

function timelineRecordsForLegacy(record: GuestPyroxeneRecord): PlannerStateTimelineRecord[] {
  return guestPyroxeneRecordToTimelineItems(record).map(({ userId: _userId, ...item }) => item);
}

function sortLegacyRecords(records: readonly PlannerStateTimelineRecord[]): PlannerStateTimelineRecord[] {
  return [...records].sort((left, right) => left.uid.localeCompare(right.uid));
}

function timelineGroupToLegacyRecord(
  records: readonly PlannerStateTimelineRecord[],
  recordId: string,
  createdAt: string,
): GuestPyroxeneRecord {
  const first = records[0];
  if (!first) throw new Error("이전 버전 플래너 형식으로 계획을 저장할 수 없어요.");
  const base = { recordId, createdAt };
  if (records.length === 1 && first.source === "buy" && first.description === "청휘석 구매") {
    return {
      ...base,
      kind: "buy",
      quantity: first.pyroxeneDelta,
      date: first.eventAt,
      repeatType: first.repeatType,
      monthlyCount: 1,
    };
  }
  if (records.length === 1 && first.source === "other") {
    if (first.pyroxeneDelta < 0 || first.oneTimeTicketDelta < 0 || first.tenTimeTicketDelta < 0) {
      throw new Error("이전 버전 플래너에서 지원하지 않는 재화 계획이에요.");
    }
    return {
      ...base,
      kind: "other",
      resources: {
        pyroxene: first.pyroxeneDelta,
        oneTimeTicket: first.oneTimeTicketDelta,
        tenTimeTicket: first.tenTimeTicketDelta,
      },
      description: first.description,
      date: first.eventAt,
    };
  }
  if (records.length === 1 && first.source === "package_ap") {
    return { ...base, kind: "apPackage", startDate: first.eventAt, autoRepurchase: first.autoRepurchase };
  }
  if (records.length === 2) {
    const onetime = records.find((record) => record.source === "package_onetime");
    const daily = records.find((record) => record.source === "package_daily");
    const packageType = (
      Object.keys(PYROXENE_MONTHLY_PACKAGE_CONFIG) as Array<keyof typeof PYROXENE_MONTHLY_PACKAGE_CONFIG>
    ).find((type) => onetime?.description === `${PYROXENE_MONTHLY_PACKAGE_CONFIG[type].name} (초회)`);
    if (packageType && onetime && daily) {
      return {
        ...base,
        kind: "monthlyPackage",
        startDate: onetime.eventAt,
        packageType,
        autoRepurchase: onetime.autoRepurchase,
      };
    }
  }
  if (records.every((record) => record.source === "attendance")) {
    const sorted = [...records].sort((left, right) => left.eventAt.localeCompare(right.eventAt));
    const firstDay = PYROXENE_ATTENDANCE_CONFIG.find(({ pyroxene }) =>
      sorted.some((record) => record.pyroxeneDelta === pyroxene),
    )?.day;
    if (
      firstDay !== undefined &&
      sorted.every((record) => record.repeatIntervalDays === PYROXENE_ATTENDANCE_REPEAT_INTERVAL_DAYS)
    ) {
      return {
        ...base,
        kind: "attendance",
        startDate: dayjs(sorted[0].eventAt)
          .subtract(firstDay - 1, "day")
          .toISOString(),
      };
    }
  }
  throw new Error("이전 버전 플래너 형식으로 계획을 저장할 수 없어요.");
}

export function guestPlannerPyroxeneDataForLegacyMirror(
  envelope: GuestPlannerEnvelope,
  previousData: GuestPyroxenePlannerData | null = envelope.legacyMirror?.pyroxene.data ?? null,
): GuestPyroxenePlannerData {
  const oldRecords = new Map((previousData?.records ?? []).map((record) => [record.recordId, record]));
  const grouped = new Map<string, PlannerStateTimelineRecord[]>();
  for (const record of envelope.document.pyroxene.records) {
    const recordId = extractPyroxeneTimelineBaseUid(record.uid);
    grouped.set(recordId, [...(grouped.get(recordId) ?? []), record]);
  }
  const records: GuestPyroxeneRecord[] = [];
  const recordIdsInOrder = new Set<string>();
  for (const record of previousData?.records ?? []) {
    if (grouped.has(record.recordId)) recordIdsInOrder.add(record.recordId);
  }
  for (const recordId of grouped.keys()) recordIdsInOrder.add(recordId);
  for (const recordId of recordIdsInOrder) {
    const group = grouped.get(recordId);
    if (!group) continue;
    const previous = oldRecords.get(recordId);
    if (
      previous &&
      stableJson(sortLegacyRecords(timelineRecordsForLegacy(previous))) === stableJson(sortLegacyRecords(group))
    ) {
      records.push(previous);
    } else {
      records.push(timelineGroupToLegacyRecord(group, recordId, previous?.createdAt ?? group[0].eventAt));
    }
  }
  return {
    resources: envelope.document.pyroxene.resources,
    records,
    options: normalizePyroxenePlannerOptions(envelope.document.pyroxene.options),
    optionsChanged: envelope.pyroxeneOptionsChanged,
    collectedSourceKeys: [...new Set(envelope.document.pyroxene.collectedSourceKeys)],
    eventTrials: Object.fromEntries(
      Object.entries(envelope.document.pyroxene.eventData)
        .filter(([, state]) => state.expectedTrials !== null)
        .map(([eventUid, state]) => [eventUid, state.expectedTrials as number]),
    ),
    favoriteStudents: [...envelope.favorites],
  };
}

type LegacyMapConflict<T> = { key: string; value: T | null };

const MISSING = Symbol("missing legacy value");

function valuesEqual(left: unknown, right: unknown): boolean {
  return left === MISSING || right === MISSING ? left === right : stableJson(left) === stableJson(right);
}

function mergeLegacyValue(
  base: unknown,
  submitted: unknown,
  latest: unknown,
  path: string,
  conflicts: string[],
): unknown {
  if (valuesEqual(submitted, base)) return latest;
  if (valuesEqual(latest, base) || valuesEqual(latest, submitted)) return submitted;
  if (isRecord(base) && isRecord(submitted) && isRecord(latest)) {
    const merged: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(submitted), ...Object.keys(latest)]);
    for (const key of keys) {
      const value = mergeLegacyValue(
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(submitted, key) ? submitted[key] : MISSING,
        Object.hasOwn(latest, key) ? latest[key] : MISSING,
        path ? `${path}.${key}` : key,
        conflicts,
      );
      if (value !== MISSING) merged[key] = value;
    }
    return merged;
  }
  conflicts.push(path);
  return latest;
}

function mergeLegacyMap<T>(
  base: Readonly<Record<string, T>>,
  submitted: Readonly<Record<string, T>>,
  latest: Readonly<Record<string, T>>,
): { values: Record<string, T>; conflicts: LegacyMapConflict<T>[] } {
  const values: Record<string, T> = {};
  const conflicts: LegacyMapConflict<T>[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(submitted), ...Object.keys(latest)]);
  for (const key of keys) {
    const b = Object.hasOwn(base, key) ? base[key] : MISSING;
    const s = Object.hasOwn(submitted, key) ? submitted[key] : MISSING;
    const l = Object.hasOwn(latest, key) ? latest[key] : MISSING;
    let value: unknown;
    if (valuesEqual(s, b)) value = l;
    else if (valuesEqual(l, b) || valuesEqual(l, s)) value = s;
    else {
      conflicts.push({ key, value: s === MISSING ? null : (s as T) });
      value = l;
    }
    if (value !== MISSING) values[key] = value as T;
  }
  return { values, conflicts };
}

function mergeLegacySet(
  base: readonly string[],
  submitted: readonly string[],
  latest: readonly string[],
): { values: string[]; conflicts: LegacyMapConflict<boolean>[] } {
  const toMap = (items: readonly string[]) => Object.fromEntries(items.map((item) => [item, true]));
  const result = mergeLegacyMap(toMap(base), toMap(submitted), toMap(latest));
  return { values: Object.keys(result.values).sort(), conflicts: result.conflicts };
}

function favoriteIdentity(favorite: GuestPyroxeneFavorite): string {
  return `${favorite.contentUid}\u0000${favorite.studentUid}`;
}

function mergePyroxeneLegacyData(
  base: GuestPyroxenePlannerData,
  submitted: GuestPyroxenePlannerData,
  latest: GuestPyroxenePlannerData,
) {
  const conflicts = {
    resources: false,
    records: [] as string[],
    options: false,
    eventTrials: [] as string[],
    favorites: [] as string[],
    collectedSourceKeys: [] as string[],
    removed: {
      resources: false,
      records: [] as string[],
      eventTrials: [] as string[],
      favorites: [] as string[],
      collectedSourceKeys: [] as string[],
    },
  };
  const resourceConflicts: string[] = [];
  const resources = mergeLegacyValue(
    base.resources,
    submitted.resources,
    latest.resources,
    "resources",
    resourceConflicts,
  );
  conflicts.resources = resourceConflicts.length > 0;
  conflicts.removed.resources = conflicts.resources && submitted.resources === null;

  const recordMap = (records: readonly GuestPyroxeneRecord[]) =>
    Object.fromEntries(records.map((record) => [record.recordId, record]));
  const records = mergeLegacyMap(recordMap(base.records), recordMap(submitted.records), recordMap(latest.records));
  conflicts.records = records.conflicts.map(({ key }) => key);
  conflicts.removed.records = records.conflicts.filter(({ value }) => value === null).map(({ key }) => key);

  const optionConflicts: string[] = [];
  const options = mergeLegacyValue(base.options, submitted.options, latest.options, "options", optionConflicts);
  const optionsChangedConflicts: string[] = [];
  const optionsChanged = mergeLegacyValue(
    base.optionsChanged,
    submitted.optionsChanged,
    latest.optionsChanged,
    "optionsChanged",
    optionsChangedConflicts,
  );
  conflicts.options = optionConflicts.length > 0 || optionsChangedConflicts.length > 0;

  const eventTrials = mergeLegacyMap(base.eventTrials, submitted.eventTrials, latest.eventTrials);
  conflicts.eventTrials = eventTrials.conflicts.map(({ key }) => key);
  conflicts.removed.eventTrials = eventTrials.conflicts.filter(({ value }) => value === null).map(({ key }) => key);

  const baseFavorites = new Map(base.favoriteStudents.map((favorite) => [favoriteIdentity(favorite), favorite]));
  const submittedFavorites = new Map(
    submitted.favoriteStudents.map((favorite) => [favoriteIdentity(favorite), favorite]),
  );
  const latestFavorites = new Map(latest.favoriteStudents.map((favorite) => [favoriteIdentity(favorite), favorite]));
  const favoritePresence = mergeLegacyMap(
    Object.fromEntries([...baseFavorites.keys()].map((key) => [key, true])),
    Object.fromEntries([...submittedFavorites.keys()].map((key) => [key, true])),
    Object.fromEntries([...latestFavorites.keys()].map((key) => [key, true])),
  );
  conflicts.favorites = favoritePresence.conflicts.map(({ key }) => key);
  conflicts.removed.favorites = favoritePresence.conflicts.filter(({ value }) => value === null).map(({ key }) => key);
  const favoriteStudents = Object.keys(favoritePresence.values)
    .map((key) => submittedFavorites.get(key) ?? latestFavorites.get(key) ?? baseFavorites.get(key))
    .filter((favorite): favorite is GuestPyroxeneFavorite => favorite !== undefined);

  const collectedSourceKeys = mergeLegacySet(
    base.collectedSourceKeys,
    submitted.collectedSourceKeys,
    latest.collectedSourceKeys,
  );
  conflicts.collectedSourceKeys = collectedSourceKeys.conflicts.map(({ key }) => key);
  conflicts.removed.collectedSourceKeys = collectedSourceKeys.conflicts
    .filter(({ value }) => value === null)
    .map(({ key }) => key);

  return {
    data: {
      resources: resources === MISSING ? null : (resources as GuestPyroxeneResources | null),
      records: Object.values(records.values),
      options: normalizePyroxenePlannerOptions(options as PyroxenePlannerOptions),
      optionsChanged: optionsChanged as boolean,
      collectedSourceKeys: collectedSourceKeys.values,
      eventTrials: eventTrials.values,
      favoriteStudents,
    } satisfies GuestPyroxenePlannerData,
    conflicts,
  };
}

function mergeEventShopPlan(
  base: GuestEventShopPlan | undefined,
  submitted: GuestEventShopPlan | undefined,
  latest: GuestEventShopPlan | undefined,
): { value: GuestEventShopPlan | undefined; conflict: boolean } {
  if (valuesEqual(submitted ?? MISSING, base ?? MISSING)) return { value: latest, conflict: false };
  if (valuesEqual(latest ?? MISSING, base ?? MISSING) || valuesEqual(latest ?? MISSING, submitted ?? MISSING)) {
    return { value: submitted, conflict: false };
  }
  if (!base || !submitted || !latest) return { value: latest, conflict: true };
  if (
    submitted.timelineUid !== base.timelineUid &&
    latest.timelineUid !== base.timelineUid &&
    submitted.timelineUid !== latest.timelineUid
  ) {
    return { value: latest, conflict: true };
  }
  const baseState = normalizeEventShopState(base.state);
  const submittedState = normalizeEventShopState(submitted.state);
  const latestState = normalizeEventShopState(latest.state);
  if (!baseState || !submittedState || !latestState) return { value: latest, conflict: true };
  const changedFields = (state: EventShopState) =>
    (Object.keys(baseState) as Array<keyof EventShopState>).filter(
      (key) => stableJson(baseState[key]) !== stableJson(state[key]),
    );
  const submittedFields = new Set(changedFields(submittedState));
  const latestFields = new Set(changedFields(latestState));
  for (const field of submittedFields) {
    if (latestFields.has(field) && stableJson(submittedState[field]) !== stableJson(latestState[field])) {
      return { value: latest, conflict: true };
    }
  }
  return {
    value: {
      ...latest,
      timelineUid: submitted.timelineUid === base.timelineUid ? latest.timelineUid : submitted.timelineUid,
      state: mergeEventShopStateChanges(baseState, submittedState, latestState),
    },
    conflict: false,
  };
}

export function mergeGuestPlannerLegacyChanges(
  current: GuestPlannerEnvelope,
  submittedPyroxene: GuestPyroxenePlannerEnvelope,
  submittedEventShops: GuestEventShopPlannerEnvelope,
): { envelope: GuestPlannerEnvelope; conflict: GuestPlannerLegacyConflict | null; changed: boolean } {
  const mirror = current.legacyMirror ?? createGuestPlannerLegacyMirror(current, null);
  const basePyroxene = mirror.pyroxene.data;
  const baseEventShops = mirror.eventShops.data;
  const latestPyroxene = guestPlannerPyroxeneDataForLegacyMirror(current, basePyroxene);
  const latestEventShops = guestPlannerEventShopDataForLegacyMirror(current);
  const changed =
    stableJson(submittedPyroxene.data) !== stableJson(basePyroxene) ||
    stableJson(submittedEventShops.data) !== stableJson(baseEventShops);
  if (!changed) return { envelope: current, conflict: null, changed: false };

  const pyroxeneMerge = mergePyroxeneLegacyData(basePyroxene, submittedPyroxene.data, latestPyroxene);
  const eventShopValues: Record<string, GuestEventShopPlan> = {};
  const eventShopConflicts: string[] = [];
  const removedEventShopConflicts: string[] = [];
  const eventShopUids = new Set([
    ...Object.keys(baseEventShops.plans),
    ...Object.keys(submittedEventShops.data.plans),
    ...Object.keys(latestEventShops.plans),
  ]);
  for (const shopStateUid of eventShopUids) {
    const result = mergeEventShopPlan(
      baseEventShops.plans[shopStateUid],
      submittedEventShops.data.plans[shopStateUid],
      latestEventShops.plans[shopStateUid],
    );
    if (result.conflict) {
      eventShopConflicts.push(shopStateUid);
      if (!submittedEventShops.data.plans[shopStateUid]) removedEventShopConflicts.push(shopStateUid);
    }
    if (result.value) eventShopValues[shopStateUid] = result.value;
  }

  const pyroxeneConflicts = pyroxeneMerge.conflicts;
  const hasConflict =
    pyroxeneConflicts.resources ||
    pyroxeneConflicts.records.length > 0 ||
    pyroxeneConflicts.options ||
    pyroxeneConflicts.eventTrials.length > 0 ||
    pyroxeneConflicts.favorites.length > 0 ||
    pyroxeneConflicts.collectedSourceKeys.length > 0 ||
    eventShopConflicts.length > 0;
  const nextEventData = { ...current.document.pyroxene.eventData };
  const eventTrialUids = new Set([
    ...Object.keys(basePyroxene.eventTrials),
    ...Object.keys(submittedPyroxene.data.eventTrials),
    ...Object.keys(latestPyroxene.eventTrials),
  ]);
  for (const eventUid of eventTrialUids) {
    if (
      stableJson(submittedPyroxene.data.eventTrials[eventUid] ?? null) ===
      stableJson(basePyroxene.eventTrials[eventUid] ?? null)
    ) {
      continue;
    }
    const expectedTrials = pyroxeneMerge.data.eventTrials[eventUid] ?? null;
    const existing = nextEventData[eventUid];
    if (existing?.completed) nextEventData[eventUid] = { ...existing, expectedTrials };
    else if (expectedTrials === null) delete nextEventData[eventUid];
    else nextEventData[eventUid] = { completed: false, expectedTrials };
  }
  const document: PlannerStateDocumentV1 = {
    ...current.document,
    pyroxene: {
      ...current.document.pyroxene,
      resources: pyroxeneMerge.data.resources,
      records: sortPlannerStateTimelineRecords(pyroxeneMerge.data.records.flatMap(timelineRecordsForLegacy)),
      options: pyroxeneMerge.data.options,
      collectedSourceKeys: pyroxeneMerge.data.collectedSourceKeys,
      eventData: nextEventData,
    },
    eventShops: Object.fromEntries(Object.entries(eventShopValues).map(([key, plan]) => [key, plan.state])),
  };
  const next: GuestPlannerEnvelope = {
    ...current,
    document,
    pyroxeneOptionsChanged: pyroxeneMerge.data.optionsChanged,
    favorites: pyroxeneMerge.data.favoriteStudents,
    legacyMirror: {
      ...mirror,
      pyroxene: { ...mirror.pyroxene, data: pyroxeneMerge.data },
    },
    eventShopTimelineUids: Object.fromEntries(
      Object.entries(eventShopValues).map(([key, plan]) => [key, plan.timelineUid]),
    ),
  };
  const conflict = hasConflict
    ? {
        id: `${submittedPyroxene.datasetId}:${submittedPyroxene.revision}:${submittedEventShops.revision}`,
        pyroxene: submittedPyroxene,
        eventShops: submittedEventShops,
        keys: {
          pyroxene: {
            resources: pyroxeneConflicts.resources,
            records: pyroxeneConflicts.records,
            options: pyroxeneConflicts.options,
            eventTrials: pyroxeneConflicts.eventTrials,
            favorites: pyroxeneConflicts.favorites,
            collectedSourceKeys: pyroxeneConflicts.collectedSourceKeys,
          },
          eventShopUids: eventShopConflicts,
          removed: {
            resources: pyroxeneConflicts.removed.resources,
            records: pyroxeneConflicts.removed.records,
            eventTrials: pyroxeneConflicts.removed.eventTrials,
            favorites: pyroxeneConflicts.removed.favorites,
            collectedSourceKeys: pyroxeneConflicts.removed.collectedSourceKeys,
            eventShopUids: removedEventShopConflicts,
          },
        },
      }
    : null;
  if (conflict && !next.legacyConflicts.some((entry) => entry.id === conflict.id)) {
    next.legacyConflicts = [...next.legacyConflicts, conflict];
  }
  return { envelope: next, conflict, changed: true };
}

export function guestPlannerEventShopDataForLegacyMirror(envelope: GuestPlannerEnvelope): GuestEventShopPlannerData {
  const plans: Record<string, GuestEventShopPlan> = {};
  for (const [shopStateUid, state] of Object.entries(envelope.document.eventShops)) {
    const timelineUid = envelope.eventShopTimelineUids[shopStateUid];
    if (!timelineUid) throw new Error("이전 버전 플래너 형식으로 상점 계획을 저장할 수 없어요.");
    plans[shopStateUid] = { shopStateUid, timelineUid, state };
  }
  return { plans };
}

export function createGuestPlannerLegacyMirror(
  envelope: GuestPlannerEnvelope,
  previous: GuestPlannerLegacyMirror | null,
): GuestPlannerLegacyMirror {
  const emptyPyroxene = createEmptyGuestPyroxenePlanner();
  const emptyEventShops = createEmptyGuestEventShopPlanner();
  return {
    pyroxene: {
      version: 1,
      datasetId: previous?.pyroxene.datasetId ?? envelope.datasetId ?? emptyPyroxene.datasetId,
      revision: previous?.pyroxene.revision ?? 0,
      updatedAt: previous?.pyroxene.updatedAt ?? envelope.updatedAt,
      data: guestPlannerPyroxeneDataForLegacyMirror(envelope, previous?.pyroxene.data ?? null),
    },
    eventShops: {
      version: 1,
      datasetId: previous?.eventShops.datasetId ?? envelope.datasetId ?? emptyEventShops.datasetId,
      revision: previous?.eventShops.revision ?? 0,
      updatedAt: previous?.eventShops.updatedAt ?? envelope.updatedAt,
      data: guestPlannerEventShopDataForLegacyMirror(envelope),
    },
  };
}

export function guestPlannerEventShopPlans(envelope: GuestPlannerEnvelope): GuestEventShopPlan[] {
  return Object.entries(envelope.document.eventShops).flatMap(([shopStateUid, state]) => {
    const timelineUid = envelope.eventShopTimelineUids[shopStateUid];
    return timelineUid ? [{ timelineUid, shopStateUid, state }] : [];
  });
}

export function upsertGuestPlannerEventShopPlan(
  envelope: GuestPlannerEnvelope,
  plan: GuestEventShopPlan,
): GuestPlannerEnvelope {
  const currentPlans = {
    plans: Object.fromEntries(guestPlannerEventShopPlans(envelope).map((item) => [item.shopStateUid, item])),
  };
  const nextPlans = upsertGuestEventShopPlan(currentPlans, plan).plans;
  const nextPlan = nextPlans[plan.shopStateUid];
  return {
    ...envelope,
    document: {
      ...envelope.document,
      eventShops: { ...envelope.document.eventShops, [plan.shopStateUid]: nextPlan.state },
    },
    eventShopTimelineUids: { ...envelope.eventShopTimelineUids, [plan.shopStateUid]: nextPlan.timelineUid },
  };
}

export function patchGuestPlannerEventShopOwnedQuantities(
  envelope: GuestPlannerEnvelope,
  plan: Pick<GuestEventShopPlan, "timelineUid" | "shopStateUid"> & {
    defaults: EventShopState;
    patch: EventShopOwnedQuantityPatch;
  },
): GuestPlannerEnvelope {
  const current = envelope.document.eventShops[plan.shopStateUid] ?? plan.defaults;
  const nextState = patchEventShopOwnedQuantities(current, plan.patch);
  return upsertGuestPlannerEventShopPlan(envelope, {
    timelineUid: plan.timelineUid,
    shopStateUid: plan.shopStateUid,
    state: nextState,
  });
}

export function guestPlannerHasData(envelope: GuestPlannerEnvelope): boolean {
  return guestPlannerHasPrimaryData(envelope) || envelope.legacyConflicts.some(guestPlannerLegacyConflictHasData);
}

export function guestPlannerHasPrimaryData(envelope: GuestPlannerEnvelope): boolean {
  const { pyroxene } = envelope.document;
  return Boolean(
    pyroxene.resources ||
      pyroxene.records.length ||
      envelope.pyroxeneOptionsChanged ||
      pyroxene.collectedSourceKeys.length ||
      Object.keys(pyroxene.eventData).length ||
      Object.keys(envelope.document.eventShops).length ||
      envelope.favorites.length,
  );
}

export function guestPlannerLegacyConflictHasData(conflict: GuestPlannerLegacyConflict): boolean {
  return Boolean(
    (conflict.pyroxene &&
      (conflict.keys.pyroxene.resources ||
        conflict.keys.pyroxene.records.length ||
        conflict.keys.pyroxene.options ||
        conflict.keys.pyroxene.eventTrials.length ||
        conflict.keys.pyroxene.favorites.length ||
        conflict.keys.pyroxene.collectedSourceKeys.length ||
        conflict.keys.removed.resources ||
        conflict.keys.removed.records.length ||
        conflict.keys.removed.eventTrials.length ||
        conflict.keys.removed.favorites.length ||
        conflict.keys.removed.collectedSourceKeys.length)) ||
      (conflict.eventShops && (conflict.keys.eventShopUids.length || conflict.keys.removed.eventShopUids.length)),
  );
}

export function guestPlannerLegacyConflictCounts(envelope: GuestPlannerEnvelope): {
  pyroxene: number;
  eventShops: number;
} {
  const pyroxene = new Set<string>();
  const eventShops = new Set<string>();
  for (const conflict of envelope.legacyConflicts) {
    const keys = conflict.keys;
    if (keys.pyroxene.resources || keys.removed.resources) pyroxene.add("resources");
    for (const key of [...keys.pyroxene.records, ...keys.removed.records]) pyroxene.add(`record:${key}`);
    if (keys.pyroxene.options) pyroxene.add("options");
    for (const key of [...keys.pyroxene.eventTrials, ...keys.removed.eventTrials]) pyroxene.add(`event:${key}`);
    for (const key of [...keys.pyroxene.favorites, ...keys.removed.favorites]) pyroxene.add(`favorite:${key}`);
    for (const key of [...keys.pyroxene.collectedSourceKeys, ...keys.removed.collectedSourceKeys]) {
      pyroxene.add(`source:${key}`);
    }
    for (const key of [...keys.eventShopUids, ...keys.removed.eventShopUids]) eventShops.add(key);
  }
  return { pyroxene: pyroxene.size, eventShops: eventShops.size };
}

export function createGuestPlannerConflictEnvelope(
  conflict: GuestPlannerLegacyConflict,
  source: "pyroxene" | "eventShops",
): GuestPlannerEnvelope | null {
  if (source === "pyroxene") {
    if (
      !conflict.pyroxene ||
      !(
        conflict.keys.pyroxene.resources ||
        conflict.keys.pyroxene.records.length ||
        conflict.keys.pyroxene.options ||
        conflict.keys.pyroxene.eventTrials.length ||
        conflict.keys.pyroxene.favorites.length ||
        conflict.keys.pyroxene.collectedSourceKeys.length ||
        conflict.keys.removed.resources ||
        conflict.keys.removed.records.length ||
        conflict.keys.removed.eventTrials.length ||
        conflict.keys.removed.favorites.length ||
        conflict.keys.removed.collectedSourceKeys.length
      )
    )
      return null;
    const data = conflict.pyroxene.data;
    const keys = conflict.keys.pyroxene;
    const filtered = {
      ...conflict.pyroxene,
      data: {
        resources: keys.resources ? data.resources : null,
        records: data.records.filter((record) => keys.records.includes(record.recordId)),
        options: data.options,
        optionsChanged: keys.options,
        collectedSourceKeys: data.collectedSourceKeys.filter((key) => keys.collectedSourceKeys.includes(key)),
        eventTrials: Object.fromEntries(
          keys.eventTrials.flatMap((uid) =>
            Object.hasOwn(data.eventTrials, uid) ? [[uid, data.eventTrials[uid]]] : [],
          ),
        ),
        favoriteStudents: data.favoriteStudents.filter((favorite) =>
          keys.favorites.includes(favoriteIdentity(favorite)),
        ),
      },
    } satisfies GuestPyroxenePlannerEnvelope;
    const envelope = createGuestPlannerFromLegacySources({ pyroxene: filtered, eventShops: null });
    envelope.legacyMirror = createGuestPlannerLegacyMirror(envelope, {
      pyroxene: filtered,
      eventShops: createEmptyGuestEventShopPlanner(),
    });
    return envelope;
  }
  if (
    !conflict.eventShops ||
    (conflict.keys.eventShopUids.length === 0 && conflict.keys.removed.eventShopUids.length === 0)
  )
    return null;
  const plans = Object.fromEntries(
    conflict.keys.eventShopUids.flatMap((uid) =>
      Object.hasOwn(conflict.eventShops?.data.plans ?? {}, uid) ? [[uid, conflict.eventShops?.data.plans[uid]]] : [],
    ),
  );
  const filtered = { ...conflict.eventShops, data: { plans } } as GuestEventShopPlannerEnvelope;
  const envelope = createGuestPlannerFromLegacySources({ pyroxene: null, eventShops: filtered });
  envelope.legacyMirror = createGuestPlannerLegacyMirror(envelope, {
    pyroxene: createEmptyGuestPyroxenePlanner(),
    eventShops: filtered,
  });
  return envelope;
}

export function updateGuestPlannerOptions(
  envelope: GuestPlannerEnvelope,
  options: PyroxenePlannerOptions,
): GuestPlannerEnvelope {
  return {
    ...envelope,
    pyroxeneOptionsChanged: true,
    document: {
      ...envelope.document,
      pyroxene: { ...envelope.document.pyroxene, options: normalizePyroxenePlannerOptions(options) },
    },
  };
}

export function hasUnresolvedGuestPlannerOptions(
  optionsChanged: boolean,
  guestOptions: PyroxenePlannerOptions,
  accountOptions: PyroxenePlannerOptions,
): boolean {
  return (
    optionsChanged &&
    stableJson(normalizePyroxenePlannerOptions(guestOptions)) !==
      stableJson(normalizePyroxenePlannerOptions(accountOptions))
  );
}

function clearLegacyConflictSections(
  conflicts: readonly GuestPlannerLegacyConflict[],
  sections: ReadonlySet<GuestPlannerSection>,
): GuestPlannerLegacyConflict[] {
  return conflicts
    .map((conflict) => {
      let pyroxene = conflict.pyroxene;
      let eventShops = conflict.eventShops;
      const keys = {
        pyroxene: { ...conflict.keys.pyroxene },
        eventShopUids: [...conflict.keys.eventShopUids],
        removed: {
          resources: conflict.keys.removed.resources,
          records: [...conflict.keys.removed.records],
          eventTrials: [...conflict.keys.removed.eventTrials],
          favorites: [...conflict.keys.removed.favorites],
          collectedSourceKeys: [...conflict.keys.removed.collectedSourceKeys],
          eventShopUids: [...conflict.keys.removed.eventShopUids],
        },
      };
      if (sections.has("resources")) {
        keys.pyroxene.resources = false;
        keys.removed.resources = false;
        if (pyroxene) pyroxene = { ...pyroxene, data: { ...pyroxene.data, resources: null } };
      }
      if (sections.has("records")) {
        keys.pyroxene.records = [];
        keys.removed.records = [];
        if (pyroxene) pyroxene = { ...pyroxene, data: { ...pyroxene.data, records: [] } };
      }
      if (sections.has("options")) {
        keys.pyroxene.options = false;
        if (pyroxene)
          pyroxene = {
            ...pyroxene,
            data: { ...pyroxene.data, options: defaultPyroxenePlannerOptions, optionsChanged: false },
          };
      }
      if (sections.has("recruitment")) {
        keys.pyroxene.eventTrials = [];
        keys.pyroxene.favorites = [];
        keys.removed.eventTrials = [];
        keys.removed.favorites = [];
        if (pyroxene) pyroxene = { ...pyroxene, data: { ...pyroxene.data, eventTrials: {}, favoriteStudents: [] } };
      }
      if (sections.has("collectedSourceKeys")) {
        keys.pyroxene.collectedSourceKeys = [];
        keys.removed.collectedSourceKeys = [];
        if (pyroxene) pyroxene = { ...pyroxene, data: { ...pyroxene.data, collectedSourceKeys: [] } };
      }
      if (sections.has("eventShops")) {
        keys.eventShopUids = [];
        keys.removed.eventShopUids = [];
        if (eventShops) eventShops = { ...eventShops, data: { plans: {} } };
      }
      const hasRemainingPyroxeneKeys =
        keys.pyroxene.resources ||
        keys.pyroxene.records.length > 0 ||
        keys.pyroxene.options ||
        keys.pyroxene.eventTrials.length > 0 ||
        keys.pyroxene.favorites.length > 0 ||
        keys.pyroxene.collectedSourceKeys.length > 0 ||
        keys.removed.resources ||
        keys.removed.records.length > 0 ||
        keys.removed.eventTrials.length > 0 ||
        keys.removed.favorites.length > 0 ||
        keys.removed.collectedSourceKeys.length > 0;
      const hasRemainingShopKeys = keys.eventShopUids.length > 0 || keys.removed.eventShopUids.length > 0;
      return {
        ...conflict,
        pyroxene: hasRemainingPyroxeneKeys ? pyroxene : null,
        eventShops: hasRemainingShopKeys ? eventShops : null,
        keys,
      };
    })
    .filter((conflict) => conflict.pyroxene !== null || conflict.eventShops !== null);
}

export function legacyGuestPlannerSources(
  pyroxeneRaw: string | null,
  eventShopsRaw: string | null,
): GuestPlannerLegacySources {
  const parsedPyroxene = pyroxeneRaw === null ? null : parseGuestPyroxenePlanner(pyroxeneRaw);
  let eventShops: GuestEventShopPlannerEnvelope | null = null;
  if (eventShopsRaw !== null) {
    try {
      eventShops = normalizeGuestEventShopPlanner(JSON.parse(eventShopsRaw) as unknown);
    } catch {
      eventShops = null;
    }
  }
  const pyroxeneSignature = parsedPyroxene
    ? legacySourceSignature(parsedPyroxene.datasetId, parsedPyroxene.revision, parsedPyroxene.updatedAt)
    : null;
  const eventShopsSignature = eventShops
    ? legacySourceSignature(eventShops.datasetId, eventShops.revision, eventShops.updatedAt)
    : null;
  return {
    pyroxene: parsedPyroxene,
    eventShops,
    pyroxeneSignature,
    eventShopsSignature,
    pyroxeneCorrupt: pyroxeneRaw !== null && parsedPyroxene === null,
    eventShopsCorrupt: eventShopsRaw !== null && eventShops === null,
  };
}

function legacySourceSignature(datasetId: string, revision: number, updatedAt: string): string {
  return `${datasetId}:${revision}:${updatedAt}`;
}

export function clearGuestPlannerSectionsIfUnchanged(
  current: GuestPlannerEnvelope,
  submitted: GuestPlannerEnvelope,
  sections: readonly GuestPlannerSection[],
): GuestPlannerEnvelope {
  const nextDocument = { ...current.document, pyroxene: { ...current.document.pyroxene } };
  const nextFavorites = [...current.favorites];
  const nextEventShopTimelineUids = { ...current.eventShopTimelineUids };
  const nextEventShops = { ...current.document.eventShops };
  let nextPyroxeneOptionsChanged = current.pyroxeneOptionsChanged;
  const clearedSections = new Set<GuestPlannerSection>();
  const clearIfSame = (
    section: GuestPlannerSection,
    currentValue: unknown,
    submittedValue: unknown,
    clear: () => void,
  ) => {
    if (stableJson(currentValue) === stableJson(submittedValue)) {
      clear();
      clearedSections.add(section);
    }
  };
  for (const section of sections) {
    switch (section) {
      case "resources":
        clearIfSame(section, current.document.pyroxene.resources, submitted.document.pyroxene.resources, () => {
          nextDocument.pyroxene.resources = null;
        });
        break;
      case "records":
        clearIfSame(section, current.document.pyroxene.records, submitted.document.pyroxene.records, () => {
          nextDocument.pyroxene.records = [];
        });
        break;
      case "options":
        clearIfSame(section, current.document.pyroxene.options, submitted.document.pyroxene.options, () => {
          nextDocument.pyroxene.options = defaultPyroxenePlannerOptions;
          nextPyroxeneOptionsChanged = false;
        });
        break;
      case "recruitment":
        clearIfSame(
          section,
          { eventData: current.document.pyroxene.eventData, favorites: current.favorites },
          { eventData: submitted.document.pyroxene.eventData, favorites: submitted.favorites },
          () => {
            nextDocument.pyroxene.eventData = {};
            nextFavorites.splice(0);
          },
        );
        break;
      case "collectedSourceKeys":
        clearIfSame(
          section,
          current.document.pyroxene.collectedSourceKeys,
          submitted.document.pyroxene.collectedSourceKeys,
          () => {
            nextDocument.pyroxene.collectedSourceKeys = [];
          },
        );
        break;
      case "eventShops":
        clearIfSame(section, current.document.eventShops, submitted.document.eventShops, () => {
          for (const key of Object.keys(nextEventShops)) delete nextEventShops[key];
          for (const key of Object.keys(nextEventShopTimelineUids)) delete nextEventShopTimelineUids[key];
        });
        break;
    }
  }
  return {
    ...current,
    document: { ...nextDocument, eventShops: nextEventShops },
    pyroxeneOptionsChanged: nextPyroxeneOptionsChanged,
    favorites: nextFavorites,
    eventShopTimelineUids: nextEventShopTimelineUids,
    legacyConflicts: clearLegacyConflictSections(current.legacyConflicts, clearedSections),
  };
}

export function createGuestPlannerFromLegacySources(
  sources: Pick<GuestPlannerLegacySources, "pyroxene" | "eventShops">,
): GuestPlannerEnvelope {
  const envelope = createEmptyGuestPlanner(sources.pyroxene?.datasetId ?? sources.eventShops?.datasetId ?? nanoid(16));
  const document = { ...envelope.document };
  const pyroxeneData = sources.pyroxene?.data;
  if (pyroxeneData) {
    const eventData = Object.fromEntries(
      Object.entries(pyroxeneData.eventTrials).map(([eventUid, expectedTrials]) => [
        eventUid,
        { completed: false, expectedTrials },
      ]),
    );
    document.pyroxene = {
      resources: pyroxeneData.resources,
      records: guestPyroxeneTimelineItems(pyroxeneData),
      options: pyroxeneData.options,
      collectedSourceKeys: [...new Set(pyroxeneData.collectedSourceKeys)].sort(),
      eventData,
    };
    envelope.favorites = pyroxeneData.favoriteStudents;
    envelope.pyroxeneOptionsChanged = pyroxeneData.optionsChanged;
  }
  for (const plan of Object.values(sources.eventShops?.data.plans ?? {})) {
    document.eventShops[plan.shopStateUid] = plan.state;
    envelope.eventShopTimelineUids[plan.shopStateUid] = plan.timelineUid;
  }
  return { ...envelope, document };
}

export function guestPlannerEnvelopeEqual(left: GuestPlannerEnvelope, right: GuestPlannerEnvelope): boolean {
  return stableJson(left) === stableJson(right);
}
