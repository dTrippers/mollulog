import { type EventShopState, normalizeEventShopState } from "~/domain/event-shop-state";
import type { GuestPyroxeneResources } from "~/domain/guest-pyroxene-planner";
import {
  normalizePyroxenePlannerOptions,
  type PyroxenePlannerOptions,
  type StoredPyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import { PYROXENE_SOURCE_DEFINITIONS, type PyroxeneSourceType } from "~/domain/pyroxene-sources";
import { normalizeInstant } from "~/lib/date-time";
import type { PyroxeneEventData, PyroxeneTimelineItem } from "~/models/pyroxene-planner";

export type PlannerStateResource = GuestPyroxeneResources;
export type PlannerStateTimelineRecord = Omit<PyroxeneTimelineItem, "userId">;
export type PlannerStateEventData = Pick<PyroxeneEventData, "completed" | "expectedTrials">;

export type PlannerStateDocumentV1 = {
  schemaVersion: 1;
  pyroxene: {
    resources: PlannerStateResource | null;
    records: PlannerStateTimelineRecord[];
    options: PyroxenePlannerOptions;
    collectedSourceKeys: string[];
    eventData: Record<string, PlannerStateEventData>;
  };
  eventShops: Record<string, EventShopState>;
  ap: null;
};

/** Sort planner records by event time while keeping same-time insertion order stable. */
export function sortPlannerStateTimelineRecords<T extends { eventAt: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => left.eventAt.localeCompare(right.eventAt));
}

export type PlannerStateProjectionRows = {
  resources: readonly unknown[];
  timelineItems: readonly unknown[];
  plannerOptions: readonly unknown[];
  collectedSources: readonly unknown[];
  eventData: readonly unknown[];
  eventShops: readonly unknown[];
};

export class PlannerStateProjectionError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`Unable to project planner state field: ${field}`);
    this.name = "PlannerStateProjectionError";
    this.field = field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(field: string): never {
  throw new PlannerStateProjectionError(field);
}

function record(value: unknown, field: string): Record<string, unknown> {
  return isRecord(value) ? value : invalid(field);
}

function nonEmptyString(value: unknown, field: string): string {
  return typeof value === "string" && value.length > 0 ? value : invalid(field);
}

function integer(value: unknown, field: string): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : invalid(field);
}

function optionalInteger(value: unknown, field: string): number | null {
  return value == null ? null : integer(value, field);
}

function boolean(value: unknown, field: string): boolean {
  return typeof value === "boolean" ? value : invalid(field);
}

function instant(value: unknown, field: string): string {
  if (!(value instanceof Date) && typeof value !== "string") return invalid(field);
  try {
    return normalizeInstant(value instanceof Date ? value.toISOString() : value);
  } catch {
    return invalid(field);
  }
}

function jsonValue(value: unknown, field: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return invalid(field);
  }
}

function sourceType(value: unknown): PyroxeneSourceType {
  if (typeof value === "string" && PYROXENE_SOURCE_DEFINITIONS.some((definition) => definition.type === value)) {
    return value as PyroxeneSourceType;
  }
  return invalid("pyroxene_timeline_items.source");
}

function timelineRepeatType(value: unknown): PyroxeneTimelineItem["repeatType"] {
  if (value == null || value === "fixed_days") return "fixed_days";
  if (value === "monthly_first") return "monthly_first";
  return invalid("pyroxene_timeline_items.repeat_type");
}

function parseTimelineItem(value: unknown): PlannerStateTimelineRecord {
  const row = record(value, "pyroxene_timeline_items.row");
  const autoRepurchase =
    row.autoRepurchase === undefined ? false : boolean(row.autoRepurchase, "pyroxene_timeline_items.auto_repurchase");
  return {
    uid: nonEmptyString(row.uid, "pyroxene_timeline_items.uid"),
    eventAt: instant(row.eventAt, "pyroxene_timeline_items.event_at"),
    source: sourceType(row.source),
    repeatType: timelineRepeatType(row.repeatType),
    repeatIntervalDays: optionalInteger(row.repeatIntervalDays, "pyroxene_timeline_items.repeat_interval_days"),
    repeatCount: optionalInteger(row.repeatCount, "pyroxene_timeline_items.repeat_count"),
    autoRepurchase,
    description: typeof row.description === "string" ? row.description : invalid("pyroxene_timeline_items.description"),
    pyroxeneDelta: integer(row.pyroxeneDelta, "pyroxene_timeline_items.pyroxene_delta"),
    oneTimeTicketDelta: integer(row.oneTimeTicketDelta, "pyroxene_timeline_items.one_time_ticket_delta"),
    tenTimeTicketDelta: integer(row.tenTimeTicketDelta, "pyroxene_timeline_items.ten_time_ticket_delta"),
  };
}

function parseResource(value: unknown): PlannerStateResource {
  const row = record(value, "pyroxene_owned_resources.row");
  return {
    inputAt: instant(row.inputAt, "pyroxene_owned_resources.input_at"),
    pyroxene: integer(row.pyroxene, "pyroxene_owned_resources.pyroxene"),
    oneTimeTicket: integer(row.oneTimeTicket, "pyroxene_owned_resources.one_time_ticket"),
    tenTimeTicket: integer(row.tenTimeTicket, "pyroxene_owned_resources.ten_time_ticket"),
  };
}

function parseOptions(rows: readonly unknown[]): PyroxenePlannerOptions {
  if (rows.length > 1) return invalid("pyroxene_planner_options.user_id");
  if (rows.length === 0) return normalizePyroxenePlannerOptions(null);
  const row = record(rows[0], "pyroxene_planner_options.row");
  const value = jsonValue(row.options, "pyroxene_planner_options.options");
  if (!isRecord(value)) return invalid("pyroxene_planner_options.options");
  return normalizePyroxenePlannerOptions(value as StoredPyroxenePlannerOptions);
}

function parseEventShop(value: unknown): { eventUid: string; state: EventShopState } {
  const row = record(value, "event_shop_states.row");
  const eventUid = nonEmptyString(row.eventUid, "event_shop_states.event_uid");
  const rawState = {
    itemQuantities: jsonValue(row.itemQuantities, "event_shop_states.item_quantities"),
    itemPurchaseDays: jsonValue(row.itemPurchaseDays, "event_shop_states.item_purchase_days"),
    selectedBonusStudentUids: jsonValue(row.selectedBonusStudentUids, "event_shop_states.selected_bonus_student_uids"),
    bonusStudentSelectionMode: row.bonusStudentSelectionMode,
    selectedBonusStudentUidsByItem: jsonValue(
      row.selectedBonusStudentUidsByItem,
      "event_shop_states.selected_bonus_student_uids_by_item",
    ),
    enabledStages: jsonValue(row.enabledStages, "event_shop_states.enabled_stages"),
    includeRecruitedStudents: row.includeRecruitedStudents,
    existingPaymentItemQuantities: jsonValue(
      row.existingPaymentItemQuantities,
      "event_shop_states.existing_payment_item_quantities",
    ),
    includeFirstClear: row.includeFirstClear,
    extraStageRuns: jsonValue(row.extraStageRuns, "event_shop_states.extra_stage_runs"),
    minigameStartRound: row.minigameStartRound,
    minigamePlayCount: row.minigamePlayCount,
    minigamePaymentQuantityMode: row.minigamePaymentQuantityMode,
    overriddenRequiredQuantities: jsonValue(
      row.overriddenRequiredQuantities,
      "event_shop_states.overridden_required_quantities",
    ),
  };
  if (!normalizeEventShopState(rawState)) return invalid("event_shop_states.payload");
  return { eventUid, state: rawState as EventShopState };
}

export function projectPlannerStateDocument(rows: PlannerStateProjectionRows): PlannerStateDocumentV1 {
  const resources = rows.resources.map(parseResource);
  resources.sort((left, right) => right.inputAt.localeCompare(left.inputAt));
  const latestResource = resources[0];
  const resource: PlannerStateResource | null = latestResource
    ? {
        inputAt: latestResource.inputAt,
        pyroxene: latestResource.pyroxene,
        oneTimeTicket: latestResource.oneTimeTicket,
        tenTimeTicket: latestResource.tenTimeTicket,
      }
    : null;

  // Records sort by eventAt; equal dates keep legacy row id order.
  const records = rows.timelineItems
    .map(parseTimelineItem)
    .sort((left, right) => left.eventAt.localeCompare(right.eventAt));
  if (new Set(records.map((item) => item.uid)).size !== records.length) {
    return invalid("pyroxene_timeline_items.uid");
  }

  const collectedSourceKeys = rows.collectedSources
    .map((value) =>
      nonEmptyString(
        record(value, "pyroxene_collected_sources.row").sourceKey,
        "pyroxene_collected_sources.source_key",
      ),
    )
    .sort();

  const eventData: Record<string, PlannerStateEventData> = {};
  for (const value of rows.eventData) {
    const row = record(value, "pyroxene_event_data.row");
    const eventUid = nonEmptyString(row.eventUid, "pyroxene_event_data.event_uid");
    if (Object.hasOwn(eventData, eventUid)) return invalid("pyroxene_event_data.event_uid");
    eventData[eventUid] = {
      completed: boolean(row.completed, "pyroxene_event_data.completed"),
      expectedTrials: optionalInteger(row.expectedTrials, "pyroxene_event_data.expected_trials"),
    };
  }

  const eventShops: Record<string, EventShopState> = {};
  for (const value of rows.eventShops) {
    const { eventUid, state } = parseEventShop(value);
    if (Object.hasOwn(eventShops, eventUid)) return invalid("event_shop_states.event_uid");
    eventShops[eventUid] = state;
  }

  return {
    schemaVersion: 1,
    pyroxene: {
      resources: resource,
      records,
      options: parseOptions(rows.plannerOptions),
      collectedSourceKeys: [...new Set(collectedSourceKeys)],
      eventData: Object.fromEntries(Object.entries(eventData).sort(([left], [right]) => left.localeCompare(right))),
    },
    eventShops: Object.fromEntries(Object.entries(eventShops).sort(([left], [right]) => left.localeCompare(right))),
    ap: null,
  };
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

export function plannerStateDocumentDifferences(expected: PlannerStateDocumentV1, actual: unknown): string[] {
  if (!isRecord(actual)) return ["document"];
  const differences: string[] = [];
  const actualPyroxene = actual.pyroxene;
  if (!isRecord(actualPyroxene)) return ["pyroxene"];
  if (actual.schemaVersion !== expected.schemaVersion) differences.push("schemaVersion");
  for (const field of ["resources", "records", "options", "collectedSourceKeys", "eventData"] as const) {
    if (stableJson(actualPyroxene[field]) !== stableJson(expected.pyroxene[field])) {
      differences.push(`pyroxene.${field}`);
    }
  }
  if (stableJson(actual.eventShops) !== stableJson(expected.eventShops)) differences.push("eventShops");
  if (stableJson(actual.ap) !== stableJson(expected.ap)) differences.push("ap");
  return differences;
}
