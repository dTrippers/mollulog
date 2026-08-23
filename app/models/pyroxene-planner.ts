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
  getPostgresAllPyroxeneEventData,
  getPostgresCollectedSourceKeys,
  getPostgresLatestPyroxeneOwnedResource,
  getPostgresPyroxeneEventData,
  getPostgresPyroxenePlannerOptions,
  getPostgresPyroxeneTimelineItems,
  getPostgresPyroxeneUserState,
  type PostgresPyroxeneOptions,
  upsertPostgresCollectedSource,
  upsertPostgresCollectedSources,
  upsertPostgresPyroxeneEventData,
  upsertPostgresPyroxenePlannerOptions,
} from "~/db/postgres/pyroxene-planner";
import type { PyroxenePlannerOptions, TimelineSourceType } from "~/domain/pyroxene-planner";
import type { PyroxeneMonthlyPackageType } from "~/domain/pyroxene-sources";

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
  return getPostgresLatestPyroxeneOwnedResource(env, userId, options);
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
  return getPostgresCollectedSourceKeys(env, userId, options);
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
  return getPostgresPyroxeneTimelineItems(env, userId, options);
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
  return getPostgresPyroxenePlannerOptions(env, userId, options);
}

export async function upsertPyroxenePlannerOptions(
  env: Env,
  userId: number,
  options: PyroxenePlannerOptions,
): Promise<void> {
  return upsertPostgresPyroxenePlannerOptions(env, userId, options);
}

export async function getPyroxeneEventData(
  env: Env,
  userId: number,
  eventUid: string,
  options: PostgresPyroxeneOptions = {},
) {
  return getPostgresPyroxeneEventData(env, userId, eventUid, options);
}

export async function getAllPyroxeneEventData(env: Env, userId: number, options: PostgresPyroxeneOptions = {}) {
  return getPostgresAllPyroxeneEventData(env, userId, options);
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
  return getPostgresPyroxeneUserState(env, userId, options);
}
