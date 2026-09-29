import { nanoid } from "nanoid/non-secure";
import {
  createPostgresAttendance,
  createPostgresBuyPyroxene,
  createPostgresOtherPyroxeneGain,
  createPostgresPyroxeneApPackage,
  createPostgresPyroxeneMonthlyPackage,
  createPostgresPyroxeneOwnedResource,
  deletePostgresCollectedSource,
  deletePostgresPyroxeneEventData,
  deletePostgresPyroxeneOwnedResourceByUid,
  deletePostgresPyroxeneTimelineItem,
  ensurePostgresCollectedSource,
  type PostgresPyroxeneOptions,
  updatePostgresPyroxeneOneOffTimelineItem,
  updatePostgresPyroxenePlannerOptions,
  upsertPostgresCollectedSource,
  upsertPostgresCollectedSources,
  upsertPostgresPyroxeneEventData,
  upsertPostgresPyroxenePlannerOptions,
} from "~/db/postgres/pyroxene-planner";
import type { PyroxenePlannerOptions, TimelineSourceType } from "~/domain/pyroxene-planner";
import type { PyroxeneMonthlyPackageType } from "~/domain/pyroxene-sources";
import { getPyroxenePlannerState } from "~/models/planner-state";

export type {
  PostgresPyroxeneOptions,
  PostgresPyroxeneUserState,
  PyroxeneEventData,
  PyroxeneOwnedResource,
  PyroxeneTimelineItem,
} from "~/db/postgres/pyroxene-planner";

export type PyroxeneTimelineRepeatType = "fixed_days" | "monthly_first";

export type PyroxenePlannerOptionsModel = {
  userId: number;
  options: string;
};

export async function getLatestPyroxeneOwnedResource(env: Env, userId: number, options: PostgresPyroxeneOptions = {}) {
  const resource = (await getPyroxenePlannerState(env, userId, options)).resources;
  return resource ? { ...resource, userId } : null;
}

export async function createPyroxeneOwnedResource(
  env: Env,
  userId: number,
  resources: { pyroxene: number; oneTimeTicket: number; tenTimeTicket: number },
  options: { uid?: string; inputAt?: string } = {},
): Promise<void> {
  return createPostgresPyroxeneOwnedResource(env, userId, resources, options);
}

export async function deletePyroxeneOwnedResourceByUid(env: Env, userId: number, uid: string): Promise<void> {
  return deletePostgresPyroxeneOwnedResourceByUid(env, userId, uid);
}

export async function getCollectedSourceKeys(
  env: Env,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<Set<string>> {
  return new Set((await getPyroxenePlannerState(env, userId, options)).collectedSourceKeys);
}

export async function upsertCollectedSource(env: Env, userId: number, sourceKey: string): Promise<void> {
  return upsertPostgresCollectedSource(env, userId, sourceKey);
}

export async function ensureCollectedSource(env: Env, userId: number, sourceKey: string): Promise<void> {
  return ensurePostgresCollectedSource(env, userId, sourceKey);
}

export async function upsertCollectedSources(env: Env, userId: number, sourceKeys: string[]): Promise<void> {
  return upsertPostgresCollectedSources(env, userId, sourceKeys);
}

export async function deleteCollectedSource(env: Env, userId: number, sourceKey: string): Promise<void> {
  return deletePostgresCollectedSource(env, userId, sourceKey);
}

export type { TimelineSourceType };

export async function getPyroxeneTimelineItems(env: Env, userId: number, options: PostgresPyroxeneOptions = {}) {
  return (await getPyroxenePlannerState(env, userId, options)).records.map((item) => ({ ...item, userId }));
}

type CreateBuyPyroxeneOptions = {
  repeatType?: PyroxeneTimelineRepeatType;
  monthlyCount?: number;
  uid?: string;
};

export async function createBuyPyroxene(
  env: Env,
  userId: number,
  date: Date | string,
  quantity: number,
  options: CreateBuyPyroxeneOptions = {},
): Promise<void> {
  return createPostgresBuyPyroxene(env, userId, date, quantity, options);
}

export async function deletePyroxeneTimelineItem(env: Env, userId: number, uid: string): Promise<void> {
  return deletePostgresPyroxeneTimelineItem(env, userId, uid);
}

export async function updatePyroxeneOneOffTimelineItem(
  env: Env,
  userId: number,
  uid: string,
  input: {
    source: "buy" | "other";
    date: Date | string;
    description: string;
    pyroxeneDelta: number;
    oneTimeTicketDelta: number;
    tenTimeTicketDelta: number;
  },
  options: PostgresPyroxeneOptions = {},
): Promise<boolean> {
  return updatePostgresPyroxeneOneOffTimelineItem(env, userId, uid, input, options);
}

export async function createPyroxeneMonthlyPackage(
  env: Env,
  userId: number,
  startDate: Date | string,
  packageType: PyroxeneMonthlyPackageType,
  autoRepurchase = false,
  uid = nanoid(8),
): Promise<void> {
  return createPostgresPyroxeneMonthlyPackage(env, userId, startDate, packageType, autoRepurchase, uid);
}

export async function createPyroxeneApPackage(
  env: Env,
  userId: number,
  startDate: Date | string,
  autoRepurchase = false,
  uid = nanoid(8),
): Promise<void> {
  return createPostgresPyroxeneApPackage(env, userId, startDate, autoRepurchase, uid);
}

export async function createAttendance(
  env: Env,
  userId: number,
  startDate: Date | string,
  uid = nanoid(8),
): Promise<void> {
  return createPostgresAttendance(env, userId, startDate, uid);
}

export async function createOtherPyroxeneGain(
  env: Env,
  userId: number,
  date: Date | string,
  pyroxene: number,
  oneTimeTicket: number,
  tenTimeTicket: number,
  description: string,
  uid = nanoid(8),
): Promise<void> {
  return createPostgresOtherPyroxeneGain(env, userId, date, pyroxene, oneTimeTicket, tenTimeTicket, description, uid);
}

export async function getPyroxenePlannerOptions(
  env: Env,
  userId: number,
  options: PostgresPyroxeneOptions = {},
): Promise<PyroxenePlannerOptions> {
  return (await getPyroxenePlannerState(env, userId, options)).options;
}

export async function upsertPyroxenePlannerOptions(
  env: Env,
  userId: number,
  options: PyroxenePlannerOptions,
): Promise<void> {
  return upsertPostgresPyroxenePlannerOptions(env, userId, options);
}

export async function updatePyroxenePlannerOptions<T>(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  update: (current: PyroxenePlannerOptions) => { options: PyroxenePlannerOptions; result: T },
  options: PostgresPyroxeneOptions = {},
): Promise<T> {
  return updatePostgresPyroxenePlannerOptions(env, userId, update, options);
}

export async function getPyroxeneEventData(
  env: Env,
  userId: number,
  eventUid: string,
  options: PostgresPyroxeneOptions = {},
) {
  const eventData = (await getPyroxenePlannerState(env, userId, options)).eventData[eventUid];
  return eventData ? { ...eventData, eventUid, userId } : null;
}

export async function getAllPyroxeneEventData(env: Env, userId: number, options: PostgresPyroxeneOptions = {}) {
  const eventData = (await getPyroxenePlannerState(env, userId, options)).eventData;
  return Object.entries(eventData).map(([eventUid, data]) => ({ ...data, eventUid, userId }));
}

export async function upsertPyroxeneEventData(
  env: Env,
  userId: number,
  eventUid: string,
  data: { completed?: boolean; expectedTrials?: number | null },
): Promise<void> {
  return upsertPostgresPyroxeneEventData(env, userId, eventUid, data);
}

export async function deletePyroxeneEventData(env: Env, userId: number, eventUid: string): Promise<void> {
  return deletePostgresPyroxeneEventData(env, userId, eventUid);
}

export async function getPyroxeneUserState(env: Env, userId: number, options: PostgresPyroxeneOptions = {}) {
  const state = await getPyroxenePlannerState(env, userId, options);
  return {
    latestResources: state.resources ? { ...state.resources, userId } : null,
    options: state.options,
    eventData: Object.entries(state.eventData).map(([eventUid, data]) => ({ ...data, eventUid, userId })),
    timelineItems: state.records.map((item) => ({ ...item, userId })),
    collectedSourceKeys: new Set(state.collectedSourceKeys),
  };
}
