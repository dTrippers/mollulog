import { PYROXENE_PICKUP_CHANCES, type PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import {
  PYROXENE_SOURCE_DEFINITIONS,
  type PyroxeneMonthlyPackageType,
  type PyroxeneSourceType,
} from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import type { PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";

type JsonRecord = Record<string, unknown>;

type SaveOwnedResourcesAction = {
  intent: "save-owned-resources";
  payload: {
    resources: PickupResources;
    eventUid?: string | null;
    collectedSourceKeys?: string[];
  };
};

type SaveBuyAction = {
  intent: "save-buy";
  payload: {
    quantity: number;
    date: string;
    repeatType?: PyroxeneTimelineRepeatType;
    monthlyCount?: number;
  };
};

type SaveMonthlyPackageAction = {
  intent: "save-monthly-package";
  payload: {
    startDate: string;
    packageType: PyroxeneMonthlyPackageType;
    autoRepurchase: boolean;
    options?: PyroxenePlannerOptions;
  };
};

type SaveApPackageAction = {
  intent: "save-ap-package";
  payload: {
    startDate: string;
    autoRepurchase: boolean;
    options?: PyroxenePlannerOptions;
  };
};

type SaveAttendanceAction = { intent: "save-attendance"; payload: { startDate: string } };

type SaveOtherAction = {
  intent: "save-other";
  payload: { resources: PickupResources; description: string; date: string };
};

type UpdateEventDataAction = {
  intent: "update-event-data";
  payload: { eventUid: string; expectedTrials?: number | null };
};

type SaveOptionsAction = { intent: "save-options"; payload: { options: PyroxenePlannerOptions } };
type CollectSourceAction = { intent: "collect-source"; payload: { sourceKey: string } };
type UncollectSourceAction = { intent: "uncollect-source"; payload: { sourceKey: string } };

type DeletePickupCompletionAction = {
  intent: "delete-pickup-completion";
  payload: { eventUid: string; recruitmentGroupUid?: string | null };
};

type DeleteTimelineItemAction = { intent: "delete-timeline-item"; payload: { itemUid: string } };

export type ActionData =
  | SaveOwnedResourcesAction
  | SaveBuyAction
  | SaveMonthlyPackageAction
  | SaveApPackageAction
  | SaveAttendanceAction
  | SaveOtherAction
  | UpdateEventDataAction
  | SaveOptionsAction
  | CollectSourceAction
  | UncollectSourceAction
  | DeletePickupCompletionAction
  | DeleteTimelineItemAction;

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}은 객체여야 해요`);
  }
  return value as JsonRecord;
}

function assertRequiredKeys(record: JsonRecord, required: readonly string[]) {
  const missing = required.find((key) => !(key in record));
  if (missing) {
    throw new Error("요청 payload가 올바르지 않아요");
  }
}

function readString(record: JsonRecord, key: string, options: { allowEmpty?: boolean } = {}): string {
  const value = record[key];
  if (typeof value !== "string" || (!options.allowEmpty && value.trim().length === 0)) {
    throw new Error(`요청 필드 ${key}가 올바르지 않아요`);
  }
  return value;
}

function readOptionalString(record: JsonRecord, key: string, allowNull = false): string | null | undefined {
  const value = record[key];
  if (value === undefined || (allowNull && value === null)) return value;
  return readString(record, key);
}

function readNumber(record: JsonRecord, key: string, minimum?: number): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`요청 필드 ${key}가 올바르지 않아요`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new Error(`요청 필드 ${key}가 올바르지 않아요`);
  }
  return value;
}

function readOptionalNumber(record: JsonRecord, key: string, minimum?: number): number | null | undefined {
  const value = record[key];
  if (value === undefined || value === null) return value;
  return readNumber(record, key, minimum);
}

function readBoolean(record: JsonRecord, key: string): boolean {
  if (typeof record[key] !== "boolean") {
    throw new Error(`요청 필드 ${key}가 올바르지 않아요`);
  }
  return record[key] as boolean;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysInMonth !== undefined && day <= daysInMonth;
}

function isValidIsoDate(value: string): boolean {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return isValidCalendarDate(
      Number.parseInt(dateOnlyMatch[1] ?? "", 10),
      Number.parseInt(dateOnlyMatch[2] ?? "", 10),
      Number.parseInt(dateOnlyMatch[3] ?? "", 10),
    );
  }

  const datetimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!datetimeMatch) return false;

  const year = Number.parseInt(datetimeMatch[1] ?? "", 10);
  const month = Number.parseInt(datetimeMatch[2] ?? "", 10);
  const day = Number.parseInt(datetimeMatch[3] ?? "", 10);
  const hour = Number.parseInt(datetimeMatch[4] ?? "", 10);
  const minute = Number.parseInt(datetimeMatch[5] ?? "", 10);
  const second = Number.parseInt(datetimeMatch[6] ?? "", 10);
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return false;

  const timezone = datetimeMatch[8];
  if (timezone === "Z") return true;
  const timezoneHour = Number.parseInt(timezone?.slice(1, 3) ?? "", 10);
  const timezoneMinute = Number.parseInt(timezone?.slice(4, 6) ?? "", 10);
  return timezoneHour <= 23 && timezoneMinute <= 59;
}

function readDate(record: JsonRecord, key: string): string {
  const value = readString(record, key);
  if (!isValidIsoDate(value)) {
    throw new Error(`요청 필드 ${key}가 올바르지 않아요`);
  }
  return value;
}

function readResources(value: unknown): PickupResources {
  const record = asRecord(value, "resources");
  assertRequiredKeys(record, ["pyroxene", "oneTimeTicket", "tenTimeTicket"]);
  return {
    pyroxene: readNumber(record, "pyroxene", 0),
    oneTimeTicket: readNumber(record, "oneTimeTicket", 0),
    tenTimeTicket: readNumber(record, "tenTimeTicket", 0),
  };
}

function readSourceKeys(record: JsonRecord, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((sourceKey) => typeof sourceKey !== "string" || !sourceKey)) {
    throw new Error(`요청 필드 ${key}가 올바르지 않아요`);
  }
  return value as string[];
}

function readPlannerOptions(value: unknown): PyroxenePlannerOptions {
  const record = asRecord(value, "options");
  assertRequiredKeys(record, ["event", "raid", "tactical", "consumption", "timeline"]);
  const event = asRecord(record.event, "event");
  const raid = asRecord(record.raid, "raid");
  const tactical = asRecord(record.tactical, "tactical");
  const consumption = asRecord(record.consumption, "consumption");
  const timeline = asRecord(record.timeline, "timeline");
  assertRequiredKeys(event, ["pickupChance"]);
  assertRequiredKeys(raid, ["tier"]);
  assertRequiredKeys(tactical, ["level"]);
  assertRequiredKeys(consumption, ["apChargeCount"]);
  assertRequiredKeys(timeline, ["display"]);

  const pickupChance = readString(event, "pickupChance");
  if (!PYROXENE_PICKUP_CHANCES.includes(pickupChance as (typeof PYROXENE_PICKUP_CHANCES)[number])) {
    throw new Error("요청 필드 pickupChance가 올바르지 않아요");
  }
  const tier = readString(raid, "tier");
  if (!["platinum", "gold", "silver", "bronze"].includes(tier)) {
    throw new Error("요청 필드 tier가 올바르지 않아요");
  }
  const level = readString(tactical, "level");
  if (!["in10", "in100", "in200", "over200"].includes(level)) {
    throw new Error("요청 필드 level이 올바르지 않아요");
  }
  const apChargeCount = readNumber(consumption, "apChargeCount", 0);
  if (apChargeCount > 20) {
    throw new Error("요청 필드 apChargeCount가 올바르지 않아요");
  }
  const display = timeline.display;
  const sourceTypes = new Set<PyroxeneSourceType>(PYROXENE_SOURCE_DEFINITIONS.map(({ type }) => type));
  if (
    !Array.isArray(display) ||
    display.some((sourceType) => typeof sourceType !== "string" || !sourceTypes.has(sourceType as PyroxeneSourceType))
  ) {
    throw new Error("요청 필드 display가 올바르지 않아요");
  }

  return {
    event: { pickupChance: pickupChance as PyroxenePlannerOptions["event"]["pickupChance"] },
    raid: { tier: tier as PyroxenePlannerOptions["raid"]["tier"] },
    tactical: { level: level as PyroxenePlannerOptions["tactical"]["level"] },
    consumption: { apChargeCount },
    timeline: { display: display as PyroxenePlannerOptions["timeline"]["display"] },
  };
}

function assertMethod(method: string, expected: "POST" | "DELETE") {
  if (method.toUpperCase() !== expected) {
    throw new Error("요청 method가 올바르지 않아요");
  }
}

export function decodePyroxeneActionPayload(value: unknown, method: string): ActionData {
  const record = asRecord(value, "payload");
  assertRequiredKeys(record, ["intent", "payload"]);
  const intent = readString(record, "intent");
  const payload = asRecord(record.payload, "payload");

  switch (intent) {
    case "save-owned-resources": {
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["resources"]);
      const eventUid = readOptionalString(payload, "eventUid", true);
      return {
        intent,
        payload: {
          resources: readResources(payload.resources),
          eventUid,
          collectedSourceKeys: readSourceKeys(payload, "collectedSourceKeys"),
        },
      };
    }
    case "save-buy": {
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["quantity", "date"]);
      const repeatType = payload.repeatType;
      if (repeatType !== undefined && repeatType !== "fixed_days" && repeatType !== "monthly_first") {
        throw new Error("요청 필드 repeatType이 올바르지 않아요");
      }
      const monthlyCount = readOptionalNumber(payload, "monthlyCount", 1);
      if (monthlyCount === null) {
        throw new Error("요청 필드 monthlyCount가 올바르지 않아요");
      }
      return {
        intent,
        payload: {
          quantity: readNumber(payload, "quantity", 1),
          date: readDate(payload, "date"),
          repeatType,
          monthlyCount,
        },
      };
    }
    case "save-monthly-package": {
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["startDate", "packageType", "autoRepurchase"]);
      const packageType = readString(payload, "packageType");
      if (packageType !== "half" && packageType !== "full") throw new Error("요청 필드 packageType이 올바르지 않아요");
      return {
        intent,
        payload: {
          startDate: readDate(payload, "startDate"),
          packageType,
          autoRepurchase: readBoolean(payload, "autoRepurchase"),
          options: payload.options === undefined ? undefined : readPlannerOptions(payload.options),
        },
      };
    }
    case "save-ap-package": {
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["startDate", "autoRepurchase"]);
      return {
        intent,
        payload: {
          startDate: readDate(payload, "startDate"),
          autoRepurchase: readBoolean(payload, "autoRepurchase"),
          options: payload.options === undefined ? undefined : readPlannerOptions(payload.options),
        },
      };
    }
    case "save-attendance":
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["startDate"]);
      return { intent, payload: { startDate: readDate(payload, "startDate") } };
    case "save-other":
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["resources", "description", "date"]);
      return {
        intent,
        payload: {
          resources: readResources(payload.resources),
          description: readString(payload, "description", { allowEmpty: true }),
          date: readDate(payload, "date"),
        },
      };
    case "update-event-data":
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["eventUid"]);
      return {
        intent,
        payload: {
          eventUid: readString(payload, "eventUid"),
          expectedTrials: readOptionalNumber(payload, "expectedTrials", 0),
        },
      };
    case "save-options":
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["options"]);
      return { intent, payload: { options: readPlannerOptions(payload.options) } };
    case "collect-source":
      assertMethod(method, "POST");
      assertRequiredKeys(payload, ["sourceKey"]);
      return { intent, payload: { sourceKey: readString(payload, "sourceKey") } };
    case "uncollect-source":
      assertMethod(method, "DELETE");
      assertRequiredKeys(payload, ["sourceKey"]);
      return { intent, payload: { sourceKey: readString(payload, "sourceKey") } };
    case "delete-pickup-completion":
      assertMethod(method, "DELETE");
      assertRequiredKeys(payload, ["eventUid"]);
      return {
        intent,
        payload: {
          eventUid: readString(payload, "eventUid"),
          recruitmentGroupUid: readOptionalString(payload, "recruitmentGroupUid", true),
        },
      };
    case "delete-timeline-item":
      assertMethod(method, "DELETE");
      assertRequiredKeys(payload, ["itemUid"]);
      return { intent, payload: { itemUid: readString(payload, "itemUid") } };
    default:
      throw new Error("지원하지 않는 intent예요");
  }
}
