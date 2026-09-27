import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/20/solid";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  type MetaFunction,
  redirect,
  useFetcher,
  useLoaderData,
  useLocation,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { GuestPlannerLegacyConflictCallout, useGuestPlanner } from "~/components/features/futures";
import Page from "~/components/features/layout/Page";
import { Button, Callout, Checkbox, ResourceCard, SectionCard } from "~/components/primitives";
import { type EventShopState, eventShopStatesEqual } from "~/domain/event-shop-state";
import { isDefaultEventShopState } from "~/domain/guest-event-shop-planner";
import {
  clearGuestPlannerItemsIfUnchanged,
  clearGuestPlannerLegacyConflictItemsIfUnchanged,
  clearGuestPlannerLegacyConflictSections,
  createGuestPlannerConflictEnvelope,
  type GuestPlannerEnvelope,
  type GuestPlannerItemReference,
  type GuestPlannerLegacyConflict,
  type GuestPlannerSection,
  guestPlannerEventShopPlans,
  guestPlannerHasPrimaryData,
  guestPlannerPyroxeneDataForLegacyMirror,
  normalizeGuestPlanner,
} from "~/domain/guest-planner";
import {
  type GuestPyroxeneFavorite,
  type GuestPyroxeneRecord,
  pyroxeneTimelineItemFingerprint,
} from "~/domain/guest-pyroxene-planner";
import type { PlannerStateDocumentV1, PlannerStateTimelineRecord } from "~/domain/planner-state";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { extractPyroxeneTimelineBaseUid, PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import { ResourceTypeEnum } from "~/graphql/graphql";
import dayjs from "~/lib/dayjs";
import { cn } from "~/lib/utils";
import { favoriteStudent, getUserFavoritedStudents } from "~/models/favorite-students";
import { type GuestPlannerImportPlan, importGuestPlannerState } from "~/models/guest-pyroxene-import";
import { getPyroxeneUserState } from "~/models/pyroxene-planner";
import type { EventShopPlanDisplayCatalog, EventShopStateLookupResponse } from "~/routes/api.planner.event-shop-states";
import { getPyroxenePlannerContents } from "~/views/pyroxene";

type GuestPlannerSelection = {
  resources: boolean;
  options: boolean;
  recordUids: string[];
  sourceKeys: string[];
  eventUids: string[];
  eventShopUids: string[];
  favorites: GuestPyroxeneFavorite[];
};

type GuestImportSource = {
  id: string;
  label: string;
  kind: "current" | "legacyConflict";
  envelope: GuestPlannerEnvelope;
  legacyConflict?: GuestPlannerLegacyConflict;
  conflictSource?: "pyroxene" | "eventShops";
  conflictBaseEnvelope?: GuestPlannerEnvelope;
  conflictResolutionSections?: GuestPlannerSection[];
  conflictDeletionCount?: number;
  conflictDeletionLabels?: string[];
};

type ImportActionResult = {
  success: boolean;
  verified: number;
  failedLabels: string[];
  revisionConflict: boolean;
  cleanupItems?: Record<string, GuestPlannerItemReference[]>;
};

export const MAX_GUEST_PLANNER_IMPORT_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_GUEST_PLANNER_IMPORT_SOURCES = 41;

async function readImportRequestText(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_GUEST_PLANNER_IMPORT_REQUEST_BYTES) {
    throw new Error("Guest planner import request is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_GUEST_PLANNER_IMPORT_REQUEST_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The request is already rejected; cancellation is only a resource optimization.
      }
      throw new Error("Guest planner import request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function describeImportFailure(failedLabels: readonly string[], discardedCount: number): string {
  return `가져오지 못한 항목은 이 브라우저에 남겨뒀어요: ${failedLabels.join(", ")}. 다시 시도할 수 있어요.${discardedCount > 0 ? " 선택하지 않은 계획은 저장할 때 이 브라우저에서 삭제해요." : ""}`;
}

export function getGuestPlannerImportDisplayState({
  sourceCount,
  totalCount,
  isComparing,
  compareError,
  hasStorageError,
  hasLegacyError,
  successfulSave,
}: {
  sourceCount: number;
  totalCount: number;
  isComparing: boolean;
  compareError: string | null;
  hasStorageError: boolean;
  hasLegacyError: boolean;
  successfulSave: boolean;
}) {
  const hasNoImportItems = sourceCount === 0 || (totalCount === 0 && !isComparing && !compareError);
  return {
    showNoDataCallout: hasNoImportItems && !hasStorageError && !hasLegacyError && !successfulSave,
    showFooter: sourceCount > 0 || successfulSave,
  };
}

const emptySelection = (): GuestPlannerSelection => ({
  resources: false,
  options: false,
  recordUids: [],
  sourceKeys: [],
  eventUids: [],
  eventShopUids: [],
  favorites: [],
});

export const meta: MetaFunction = () => [{ title: "데이터 가져오기 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  if (!user) return redirect("/unauthorized");

  const [contents, pyroxeneState, favorites] = await Promise.all([
    getPyroxenePlannerContents(env, false, ctx),
    getPyroxeneUserState(env, user.id, { ctx }),
    getUserFavoritedStudents(env, user.id, undefined, { ctx }),
  ]);
  return {
    contents,
    resources: pyroxeneState.latestResources,
    options: pyroxeneState.options,
    records: pyroxeneState.timelineItems,
    eventData: pyroxeneState.eventData,
    sourceKeys: [...pyroxeneState.collectedSourceKeys],
    favorites: favorites.map(({ contentId, studentId }) => ({ contentUid: contentId, studentUid: studentId })),
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 1_000 &&
    value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 200)
  );
}

function isFavoriteArray(value: unknown): value is GuestPyroxeneFavorite[] {
  return (
    Array.isArray(value) &&
    value.length <= 1_000 &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.contentUid === "string" &&
        item.contentUid.length > 0 &&
        item.contentUid.length <= 200 &&
        typeof item.studentUid === "string" &&
        item.studentUid.length > 0 &&
        item.studentUid.length <= 200,
    )
  );
}

function isSelection(value: unknown): value is GuestPlannerSelection {
  return (
    isRecord(value) &&
    typeof value.resources === "boolean" &&
    typeof value.options === "boolean" &&
    isStringArray(value.recordUids) &&
    isStringArray(value.sourceKeys) &&
    isStringArray(value.eventUids) &&
    isStringArray(value.eventShopUids) &&
    isFavoriteArray(value.favorites)
  );
}

function favoriteKey(favorite: GuestPyroxeneFavorite): string {
  return `${favorite.contentUid}\u0000${favorite.studentUid}`;
}

function groupTimelineRecords(records: readonly PlannerStateTimelineRecord[]) {
  const groups = new Map<string, PlannerStateTimelineRecord[]>();
  for (const record of records) {
    const baseUid = extractPyroxeneTimelineBaseUid(record.uid);
    groups.set(baseUid, [...(groups.get(baseUid) ?? []), record]);
  }
  return groups;
}

function timelineGroupFingerprint(records: readonly PlannerStateTimelineRecord[]): string {
  return records
    .map((record) => pyroxeneTimelineItemFingerprint({ ...record, userId: 0 }))
    .sort()
    .join("|");
}

export function guestPyroxeneRecordsById(envelope: GuestPlannerEnvelope): Map<string, GuestPyroxeneRecord> {
  const data = guestPlannerPyroxeneDataForLegacyMirror(envelope);
  return new Map(data.records.map((record) => [record.recordId, record]));
}

export function guestTimelineRecordGroupsById(
  records: readonly PlannerStateTimelineRecord[],
  guestRecordsById: ReadonlyMap<string, GuestPyroxeneRecord>,
): Map<string, PlannerStateTimelineRecord[]> {
  const groups = groupTimelineRecords(records);
  const ordered = new Map<string, PlannerStateTimelineRecord[]>();
  for (const recordId of guestRecordsById.keys()) {
    const group = groups.get(recordId);
    if (group) ordered.set(recordId, group);
  }
  return ordered;
}

export function describeTimelineGroup(
  records: readonly PlannerStateTimelineRecord[],
  guestRecordsById: ReadonlyMap<string, GuestPyroxeneRecord>,
): string {
  const first = records[0];
  if (!first) throw new Error("미로그인 상태의 수급/소비 계획을 확인하지 못했어요.");
  const guestRecord = guestRecordsById.get(extractPyroxeneTimelineBaseUid(first.uid));
  if (!guestRecord) throw new Error("미로그인 상태의 수급/소비 계획을 확인하지 못했어요.");
  const name = (() => {
    switch (guestRecord.kind) {
      case "buy":
        return "청휘석 구매";
      case "monthlyPackage":
        return guestRecord.packageType === "full" ? "월정액" : "반정액";
      case "apPackage":
        return "AP 패키지";
      case "attendance":
        return "출석 시작일";
      case "other":
        return guestRecord.description || "기타 수급";
    }
  })();
  const date = guestRecord.kind === "buy" || guestRecord.kind === "other" ? guestRecord.date : guestRecord.startDate;
  return `${name} · ${dayjs(date).format("MM/DD")}`;
}

export function buildSources(snapshot: ReturnType<typeof useGuestPlanner>["snapshot"]): GuestImportSource[] {
  if (!snapshot) return [];
  const sources: GuestImportSource[] = [];
  if (snapshot.status === "ready" || snapshot.status === "memory" || snapshot.status === "conflict") {
    if (guestPlannerHasPrimaryData(snapshot.envelope)) {
      sources.push({
        id: "current",
        label: IMPORT_SOURCE_LABELS.guest,
        kind: "current",
        envelope: snapshot.envelope,
      });
    }
    for (const conflict of snapshot.envelope.legacyConflicts) {
      for (const conflictSource of ["pyroxene", "eventShops"] as const) {
        const envelope = createGuestPlannerConflictEnvelope(conflict, conflictSource);
        const hasConflictItems =
          conflictSource === "pyroxene"
            ? conflict.keys.pyroxene.resources ||
              conflict.keys.pyroxene.records.length > 0 ||
              conflict.keys.pyroxene.options ||
              conflict.keys.pyroxene.eventTrials.length > 0 ||
              conflict.keys.pyroxene.favorites.length > 0 ||
              conflict.keys.pyroxene.collectedSourceKeys.length > 0 ||
              conflict.keys.removed.resources ||
              conflict.keys.removed.records.length > 0 ||
              conflict.keys.removed.eventTrials.length > 0 ||
              conflict.keys.removed.favorites.length > 0 ||
              conflict.keys.removed.collectedSourceKeys.length > 0
            : conflict.keys.eventShopUids.length > 0 || conflict.keys.removed.eventShopUids.length > 0;
        if (!envelope || (!guestPlannerHasPrimaryData(envelope) && !hasConflictItems)) continue;
        const removed = conflict.keys.removed;
        const resolutionSections: GuestPlannerSection[] = [];
        const deletionLabels: string[] = [];
        let deletionCount = 0;
        if (conflictSource === "pyroxene") {
          if (removed.resources) {
            resolutionSections.push("resources");
            deletionLabels.push("현재 보유 재화");
            deletionCount += 1;
          }
          if (removed.records.length > 0) {
            resolutionSections.push("records");
            deletionLabels.push(`수급/소비 계획 ${removed.records.length}건`);
            deletionCount += removed.records.length;
          }
          if (removed.eventTrials.length + removed.favorites.length > 0) {
            resolutionSections.push("recruitment");
            deletionLabels.push(`관심 학생과 모집 설정 ${removed.eventTrials.length + removed.favorites.length}건`);
            deletionCount += removed.eventTrials.length + removed.favorites.length;
          }
          if (removed.collectedSourceKeys.length > 0) {
            resolutionSections.push("collectedSourceKeys");
            deletionLabels.push(`수령한 보상 ${removed.collectedSourceKeys.length}건`);
            deletionCount += removed.collectedSourceKeys.length;
          }
        } else if (removed.eventShopUids.length > 0) {
          resolutionSections.push("eventShops");
          deletionLabels.push(`이벤트 상점 계획 ${removed.eventShopUids.length}건`);
          deletionCount += removed.eventShopUids.length;
        }
        sources.push({
          id: `legacy-conflict-${conflict.id}-${conflictSource}`,
          label: "이전 버전 화면에서 저장한 값",
          kind: "legacyConflict",
          envelope,
          legacyConflict: conflict,
          conflictSource,
          conflictBaseEnvelope: snapshot.envelope,
          conflictResolutionSections: [...new Set(resolutionSections)],
          conflictDeletionCount: deletionCount,
          conflictDeletionLabels: deletionLabels,
        });
      }
    }
  }
  return sources;
}

export function initialSelection(
  source: GuestImportSource,
  account: {
    resources: (PickupResources & { inputAt: Date | string }) | null;
    records: Array<{ uid: string; [key: string]: unknown }>;
    sourceKeys: string[];
    eventData: Array<{ eventUid: string }>;
    favorites: GuestPyroxeneFavorite[];
  },
): GuestPlannerSelection {
  const guest = source.envelope;
  const accountRecordGroups = groupTimelineRecords(account.records as unknown as PlannerStateTimelineRecord[]);
  const accountFingerprints = new Set([...accountRecordGroups.values()].map(timelineGroupFingerprint));
  const guestRecordsById = guestPyroxeneRecordsById(guest);
  const guestGroups = guestTimelineRecordGroupsById(guest.document.pyroxene.records, guestRecordsById);
  const accountFavorites = new Set(account.favorites.map(favoriteKey));
  const selectedFavorites = guest.favorites.filter((favorite) => !accountFavorites.has(favoriteKey(favorite)));
  const accountEventUids = new Set(account.eventData.map(({ eventUid }) => eventUid));
  const accountSourceKeys = new Set(account.sourceKeys);
  return {
    resources: Boolean(guest.document.pyroxene.resources && !account.resources),
    options: false,
    recordUids: [...guestGroups.entries()]
      .filter(([uid, records]) => {
        const attendanceConflict =
          guestRecordsById.get(uid)?.kind === "attendance" &&
          account.records.some((record) => (record as { source?: unknown }).source === "attendance");
        return !attendanceConflict && !accountFingerprints.has(timelineGroupFingerprint(records)) && Boolean(uid);
      })
      .map(([uid]) => uid),
    sourceKeys: guest.document.pyroxene.collectedSourceKeys.filter((key) => !accountSourceKeys.has(key)),
    eventUids: Object.keys(guest.document.pyroxene.eventData).filter((uid) => !accountEventUids.has(uid)),
    eventShopUids: Object.keys(guest.document.eventShops),
    favorites: selectedFavorites,
  };
}

function initialSelections(
  sources: readonly GuestImportSource[],
  account: Parameters<typeof initialSelection>[1],
): Record<string, GuestPlannerSelection> {
  const selected = new Map<string, GuestPlannerSelection>();
  const seen = new Set<string>();
  for (const source of sources) {
    const selection = initialSelection(source, account);
    const unique = (type: string, key: string) => {
      const identity = `${type}\u0000${key}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    };
    selection.resources = selection.resources && unique("resources", "current");
    selection.options = selection.options && unique("options", "current");
    selection.recordUids = selection.recordUids.filter((key) => unique("record", key));
    selection.sourceKeys = selection.sourceKeys.filter((key) => unique("source", key));
    selection.eventUids = selection.eventUids.filter((key) => unique("event", key));
    selection.eventShopUids = selection.eventShopUids.filter((key) => unique("eventShop", key));
    selection.favorites = selection.favorites.filter((favorite) => unique("favorite", favoriteKey(favorite)));
    selected.set(source.id, selection);
  }
  return Object.fromEntries(selected);
}

function countSelection(selection: GuestPlannerSelection): number {
  return (
    Number(selection.resources) +
    Number(selection.options) +
    selection.recordUids.length +
    selection.sourceKeys.length +
    selection.eventUids.length +
    selection.eventShopUids.length +
    selection.favorites.length
  );
}

export function countSourceItems(
  envelope: GuestPlannerEnvelope,
  accountSourceKeys: ReadonlySet<string>,
  seen = new Set<string>(),
): number {
  const before = seen.size;
  const add = (key: string) => seen.add(key);
  if (envelope.document.pyroxene.resources) add("resources");
  if (envelope.pyroxeneOptionsChanged) add("options");
  for (const uid of groupTimelineRecords(envelope.document.pyroxene.records).keys()) add(`record:${uid}`);
  const collectedKeys = envelope.document.pyroxene.collectedSourceKeys;
  if (collectedKeys.some((key) => !accountSourceKeys.has(key))) {
    for (const key of collectedKeys) add(`source:${key}`);
  }
  for (const eventUid of Object.keys(envelope.document.pyroxene.eventData)) add(`event:${eventUid}`);
  for (const favorite of envelope.favorites) add(`favorite:${favoriteKey(favorite)}`);
  for (const shopStateUid of Object.keys(envelope.document.eventShops)) add(`eventShop:${shopStateUid}`);
  return seen.size - before;
}

export function getMissingGuestCollectedSourceKeys(
  guestKeys: readonly string[],
  accountSourceKeys: ReadonlySet<string>,
): string[] {
  return guestKeys.filter((key) => !accountSourceKeys.has(key));
}

function importItemsBySection(
  envelope: GuestPlannerEnvelope,
): Record<GuestPlannerSection, GuestPlannerItemReference[]> {
  const recordIds = new Set(
    envelope.document.pyroxene.records.map((record) => extractPyroxeneTimelineBaseUid(record.uid)),
  );
  return {
    resources: envelope.document.pyroxene.resources ? [{ type: "resources", key: "current" }] : [],
    records: [...recordIds].map((key) => ({ type: "record", key })),
    options: envelope.pyroxeneOptionsChanged ? [{ type: "options", key: "current" }] : [],
    recruitment: [
      ...Object.keys(envelope.document.pyroxene.eventData).map((key) => ({ type: "event" as const, key })),
      ...envelope.favorites.map((favorite) => ({ type: "favorite" as const, key: favoriteKey(favorite) })),
    ],
    collectedSourceKeys: envelope.document.pyroxene.collectedSourceKeys.map((key) => ({ type: "source", key })),
    eventShops: Object.keys(envelope.document.eventShops).map((key) => ({ type: "eventShop", key })),
  };
}

function selectedImportItemsBySection(
  selection: GuestPlannerSelection,
): Record<GuestPlannerSection, GuestPlannerItemReference[]> {
  return {
    resources: selection.resources ? [{ type: "resources", key: "current" }] : [],
    records: selection.recordUids.map((key) => ({ type: "record", key })),
    options: selection.options ? [{ type: "options", key: "current" }] : [],
    recruitment: [
      ...selection.eventUids.map((key) => ({ type: "event" as const, key })),
      ...selection.favorites.map((favorite) => ({ type: "favorite" as const, key: favoriteKey(favorite) })),
    ],
    collectedSourceKeys: selection.sourceKeys.map((key) => ({ type: "source", key })),
    eventShops: selection.eventShopUids.map((key) => ({ type: "eventShop", key })),
  };
}

function getSourceCleanupItems(
  source: { id: string; envelope: GuestPlannerEnvelope; selection: GuestPlannerSelection },
  verified: readonly { sourceId: string; type: string; key: string }[],
  failed: readonly { sourceId: string; type: string; key: string }[],
): GuestPlannerItemReference[] {
  const allBySection = importItemsBySection(source.envelope);
  const selectedBySection = selectedImportItemsBySection(source.selection);
  const verifiedKeys = new Set(verified.map(({ sourceId, type, key }) => `${sourceId}\u0000${type}\u0000${key}`));
  const failedKeys = new Set(failed.map(({ sourceId, type, key }) => `${sourceId}\u0000${type}\u0000${key}`));
  const cleanup = new Map<string, GuestPlannerItemReference>();
  for (const section of Object.keys(allBySection) as GuestPlannerSection[]) {
    const selected = selectedBySection[section];
    if (selected.length === 0) continue;
    const successful = selected.every((item) => {
      const itemKey = `${source.id}\u0000${item.type}\u0000${item.key}`;
      return verifiedKeys.has(itemKey) && !failedKeys.has(itemKey);
    });
    if (!successful) continue;
    for (const item of allBySection[section]) cleanup.set(`${item.type}\u0000${item.key}`, item);
  }
  return [...cleanup.values()];
}

function accountPyroxeneItems(contents: Awaited<ReturnType<typeof getPyroxenePlannerContents>>) {
  const names = new Map<string, string>();
  for (const content of contents) {
    if (content.kind !== "event") continue;
    names.set(content.uid, content.name);
    for (const recruitment of content.recruitments) {
      if (recruitment.student) {
        names.set(
          `${recruitment.sourceContentUid ?? content.uid}\u0000${recruitment.student.uid}`,
          `${recruitment.student.name} · ${content.name}`,
        );
      }
    }
  }
  return names;
}

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  if (!user) {
    return data<ImportActionResult>(
      {
        success: false,
        verified: 0,
        failedLabels: ["로그인이 필요해요"],
        revisionConflict: false,
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(await readImportRequestText(request)) as unknown;
  } catch {
    return data<ImportActionResult>(
      {
        success: false,
        verified: 0,
        failedLabels: ["가져올 데이터를 확인하지 못했어요"],
        revisionConflict: false,
      },
      { status: 400 },
    );
  }
  if (!isRecord(body) || !Array.isArray(body.sources) || body.sources.length > MAX_GUEST_PLANNER_IMPORT_SOURCES) {
    return data<ImportActionResult>(
      {
        success: false,
        verified: 0,
        failedLabels: ["가져올 데이터를 확인하지 못했어요"],
        revisionConflict: false,
      },
      { status: 400 },
    );
  }

  const sources: GuestPlannerImportPlan["sources"] = [];
  const favorites: GuestPlannerImportPlan["favorites"] = [];
  const sourceById = new Map<
    string,
    { id: string; envelope: GuestPlannerEnvelope; selection: GuestPlannerSelection }
  >();
  const labels = new Map<string, string>();
  const uniqueSelectionKeys = new Set<string>();
  for (const rawSource of body.sources) {
    if (
      !isRecord(rawSource) ||
      typeof rawSource.id !== "string" ||
      rawSource.id.length === 0 ||
      rawSource.id.length > 200 ||
      !isSelection(rawSource.selection)
    ) {
      return data<ImportActionResult>(
        {
          success: false,
          verified: 0,
          failedLabels: ["가져올 데이터를 확인하지 못했어요"],
          revisionConflict: false,
        },
        { status: 400 },
      );
    }
    const envelope = rawSource.envelope as GuestPlannerEnvelope;
    const validEnvelope = envelope && isRecord(envelope) ? normalizeGuestPlanner(envelope) : null;
    if (!validEnvelope) {
      return data<ImportActionResult>(
        {
          success: false,
          verified: 0,
          failedLabels: ["가져올 데이터를 확인하지 못했어요"],
          revisionConflict: false,
        },
        { status: 400 },
      );
    }
    const selection = rawSource.selection;
    const recordUids = new Set([...groupTimelineRecords(validEnvelope.document.pyroxene.records).keys()]);
    if (
      selection.recordUids.some((key) => !recordUids.has(key)) ||
      selection.sourceKeys.some((key) => !validEnvelope.document.pyroxene.collectedSourceKeys.includes(key)) ||
      selection.eventUids.some((key) => !Object.hasOwn(validEnvelope.document.pyroxene.eventData, key)) ||
      selection.eventShopUids.some((key) => !Object.hasOwn(validEnvelope.document.eventShops, key)) ||
      selection.favorites.some(
        (favorite) => !validEnvelope.favorites.some((candidate) => favoriteKey(candidate) === favoriteKey(favorite)),
      )
    ) {
      return data<ImportActionResult>(
        {
          success: false,
          verified: 0,
          failedLabels: ["선택한 항목이 원본 데이터와 일치하지 않아요"],
          revisionConflict: false,
        },
        { status: 400 },
      );
    }
    const itemKeys = [
      ...(selection.resources ? ["resources\u0000current"] : []),
      ...(selection.options ? ["options\u0000current"] : []),
      ...selection.recordUids.map((key) => `record\u0000${key}`),
      ...selection.sourceKeys.map((key) => `source\u0000${key}`),
      ...selection.eventUids.map((key) => `event\u0000${key}`),
      ...selection.eventShopUids.map((key) => `eventShop\u0000${key}`),
      ...selection.favorites.map((favorite) => `favorite\u0000${favoriteKey(favorite)}`),
    ];
    if (itemKeys.some((key) => uniqueSelectionKeys.has(key))) {
      return data<ImportActionResult>(
        {
          success: false,
          verified: 0,
          failedLabels: ["같은 항목을 둘 이상의 계획에서 선택했어요"],
          revisionConflict: false,
        },
        { status: 400 },
      );
    }
    for (const key of itemKeys) uniqueSelectionKeys.add(key);
    if (sourceById.has(rawSource.id)) {
      return data<ImportActionResult>(
        {
          success: false,
          verified: 0,
          failedLabels: ["가져올 데이터를 확인하지 못했어요"],
          revisionConflict: false,
        },
        { status: 400 },
      );
    }
    const source = { id: rawSource.id, envelope: validEnvelope, selection };
    sources.push({
      sourceId: rawSource.id,
      datasetId: validEnvelope.datasetId,
      document: { ...validEnvelope.document, ap: null } satisfies PlannerStateDocumentV1,
      selection: {
        resources: selection.resources,
        options: selection.options,
        recordUids: selection.recordUids,
        sourceKeys: selection.sourceKeys,
        eventUids: selection.eventUids,
        eventShopUids: selection.eventShopUids,
      },
    });
    sourceById.set(rawSource.id, source);
    const recordGroups = groupTimelineRecords(validEnvelope.document.pyroxene.records);
    const guestRecordsById = guestPyroxeneRecordsById(validEnvelope);
    const addLabel = (type: string, key: string, label: string) =>
      labels.set(`${rawSource.id}\u0000${type}\u0000${key}`, label);
    if (selection.resources) addLabel("resources", "current", "현재 보유 재화");
    if (selection.options) addLabel("options", "current", "플래너 설정");
    for (const key of selection.recordUids) {
      addLabel("record", key, describeTimelineGroup(recordGroups.get(key) ?? [], guestRecordsById));
    }
    for (const key of selection.sourceKeys) addLabel("source", key, "수령한 보상");
    for (const key of selection.eventUids) addLabel("event", key, "관심 학생과 모집 설정");
    for (const key of selection.eventShopUids) addLabel("eventShop", key, "이벤트 상점 계획");
    for (const favorite of selection.favorites) {
      const key = favoriteKey(favorite);
      favorites.push({
        sourceId: rawSource.id,
        datasetId: validEnvelope.datasetId,
        itemKey: key,
        run: () => favoriteStudent(env, user.id, favorite.studentUid, favorite.contentUid, { ctx }),
      });
      addLabel("favorite", key, "관심 학생");
    }
  }

  let result: Awaited<ReturnType<typeof importGuestPlannerState>>;
  try {
    result = await importGuestPlannerState(env, user.id, { sources, favorites }, { ctx });
  } catch {
    return {
      success: false,
      verified: 0,
      failedLabels: ["선택한 항목을 가져오지 못했어요"],
      revisionConflict: false,
      cleanupItems: {},
    } satisfies ImportActionResult;
  }

  const cleanupItems: Record<string, GuestPlannerItemReference[]> = {};
  for (const source of sourceById.values()) {
    cleanupItems[source.id] = getSourceCleanupItems(source, result.verified, result.failed);
  }
  const failedLabels = result.failed.map(
    (item) => labels.get(`${item.sourceId}\u0000${item.type}\u0000${item.key}`) ?? "플래너 항목",
  );
  return {
    success: failedLabels.length === 0,
    verified: result.verified.length,
    failedLabels,
    revisionConflict: result.revisionConflict,
    cleanupItems,
  } satisfies ImportActionResult;
};

export default function UnifiedGuestPlannerImportPage() {
  const account = useLoaderData<typeof loader>();
  const guestPlanner = useGuestPlanner();
  const fetcher = useFetcher<ImportActionResult>();
  const location = useLocation();
  const [selectionBySource, setSelectionBySource] = useState<Record<string, GuestPlannerSelection>>({});
  const [resourceConflictChoice, setResourceConflictChoice] = useState<{
    sourceId: string;
    value: "current" | "legacy" | "account";
  } | null>(null);
  const [comparisonResponse, setComparisonResponse] = useState<EventShopStateLookupResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const initializedSignature = useRef<string | null>(null);
  const processedResult = useRef<ImportActionResult | null>(null);
  const submittedSources = useRef<GuestImportSource[]>([]);

  const sources = useMemo(() => buildSources(guestPlanner.snapshot), [guestPlanner.snapshot]);
  const sourcesSignature = JSON.stringify(
    sources.map(({ id, envelope }) => [id, envelope.datasetId, envelope.revision]),
  );
  const accountNames = useMemo(() => accountPyroxeneItems(account.contents), [account.contents]);
  const accountFavorites = useMemo(() => new Set(account.favorites.map(favoriteKey)), [account.favorites]);
  const accountSourceKeys = useMemo(() => new Set(account.sourceKeys), [account.sourceKeys]);
  const accountRecordsByBaseUid = useMemo(
    () => groupTimelineRecords(account.records as unknown as PlannerStateTimelineRecord[]),
    [account.records],
  );
  const accountRecordFingerprints = useMemo(
    () => new Set([...accountRecordsByBaseUid.values()].map(timelineGroupFingerprint)),
    [accountRecordsByBaseUid],
  );

  useEffect(() => {
    if (sources.length === 0 || initializedSignature.current === sourcesSignature) return;
    initializedSignature.current = sourcesSignature;
    const accountState = {
      resources: account.resources,
      records: account.records as Array<{ uid: string; [key: string]: unknown }>,
      sourceKeys: account.sourceKeys,
      eventData: account.eventData,
      favorites: account.favorites,
    };
    setSelectionBySource(initialSelections(sources, accountState));
  }, [
    account.eventData,
    account.favorites,
    account.records,
    account.resources,
    account.sourceKeys,
    sources,
    sourcesSignature,
  ]);

  const eventShopPlans = useMemo(
    () => sources.flatMap((source) => guestPlannerEventShopPlans(source.envelope).map((plan) => ({ source, plan }))),
    [sources],
  );
  const defaultShopPlanKeys = useMemo(() => {
    if (!comparisonResponse?.success) return new Set<string>();
    return new Set(
      eventShopPlans.flatMap(({ source, plan }) => {
        const row = comparisonResponse.states.find((item) => item.shopStateUid === plan.shopStateUid);
        return row?.status === "available" && row.defaultState && isDefaultEventShopState(plan.state, row.defaultState)
          ? [`${source.id}\u0000${plan.shopStateUid}`]
          : [];
      }),
    );
  }, [comparisonResponse, eventShopPlans]);

  useEffect(() => {
    if (eventShopPlans.length === 0) {
      setComparisonResponse(null);
      setCompareError(null);
      setIsComparing(false);
      return;
    }
    const controller = new AbortController();
    const requestId = `guest-import-${Date.now()}`;
    setComparisonResponse(null);
    setCompareError(null);
    setIsComparing(true);
    const compare = async () => {
      try {
        const states: EventShopStateLookupResponse["states"] = [];
        const uniquePlans = [...new Map(eventShopPlans.map(({ plan }) => [plan.shopStateUid, plan])).values()];
        for (let start = 0; start < uniquePlans.length; start += 500) {
          const response = await fetch("/api/planner/event-shop-states", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId,
              events: uniquePlans
                .slice(start, start + 500)
                .map(({ timelineUid, shopStateUid }) => ({ timelineUid, shopStateUid })),
            }),
            signal: controller.signal,
          });
          const result = (await response.json()) as EventShopStateLookupResponse;
          if (!response.ok || !result.success || result.requestId !== requestId) {
            throw new Error("계정 계획을 확인하지 못했어요. 다시 시도해주세요.");
          }
          states.push(...result.states);
        }
        if (!controller.signal.aborted) setComparisonResponse({ success: true, requestId, states });
      } catch (error) {
        if (!controller.signal.aborted)
          setCompareError(error instanceof Error ? error.message : "계정 계획을 확인하지 못했어요. 다시 시도해주세요.");
      } finally {
        if (!controller.signal.aborted) setIsComparing(false);
      }
    };
    void compare();
    return () => controller.abort();
  }, [eventShopPlans]);

  useEffect(() => {
    if (!comparisonResponse?.success || defaultShopPlanKeys.size === 0) return;
    setSelectionBySource((current) =>
      Object.fromEntries(
        Object.entries(current).map(([sourceId, selection]) => [
          sourceId,
          {
            ...selection,
            eventShopUids: selection.eventShopUids.filter((uid) => !defaultShopPlanKeys.has(`${sourceId}\u0000${uid}`)),
          },
        ]),
      ),
    );
  }, [comparisonResponse, defaultShopPlanKeys]);

  useEffect(() => {
    const result = fetcher.data;
    if (!result || result === processedResult.current) return;
    processedResult.current = result;
    const submitted = submittedSources.current;
    void guestPlanner.update((current) => {
      let next = current;
      for (const source of submitted) {
        const items = result.cleanupItems?.[source.id] ?? [];
        if (source.kind === "current") {
          next = clearGuestPlannerItemsIfUnchanged(next, source.envelope, items);
        } else if (source.legacyConflict && source.conflictSource) {
          next = clearGuestPlannerLegacyConflictItemsIfUnchanged(
            next,
            source.legacyConflict.id,
            source.conflictSource,
            source.envelope,
            items,
          );
          if (result.success && source.conflictResolutionSections?.length) {
            next = clearGuestPlannerLegacyConflictSections(
              next,
              source.legacyConflict.id,
              source.conflictSource,
              source.conflictResolutionSections,
            );
          }
        }
      }
      return next;
    });
  }, [fetcher.data, guestPlanner.update]);

  const toggleUnique = useCallback(
    (
      sourceId: string,
      field: "resources" | "options" | "recordUids" | "sourceKeys" | "eventUids" | "eventShopUids" | "favorites",
      key: string | null,
      checked: boolean,
      favorite?: GuestPyroxeneFavorite,
    ) => {
      setSelectionBySource((current) => {
        const next: Record<string, GuestPlannerSelection> = Object.fromEntries(
          Object.entries(current).map(([id, selection]) => [id, { ...selection, favorites: [...selection.favorites] }]),
        );
        const target = next[sourceId] ?? emptySelection();
        if (field === "resources" || field === "options") {
          for (const selection of Object.values(next)) selection[field] = false;
          target[field] = checked;
        } else if (field === "favorites") {
          for (const selection of Object.values(next)) {
            selection.favorites = selection.favorites.filter((item) => favoriteKey(item) !== key);
          }
          if (checked && favorite) target.favorites = [...target.favorites, favorite];
        } else {
          for (const selection of Object.values(next)) {
            selection[field] = selection[field].filter((value) => value !== key);
          }
          if (checked && key !== null) target[field] = [...target[field], key];
        }
        next[sourceId] = target;
        return next;
      });
    },
    [],
  );

  const from = new URLSearchParams(location.search).get("from");
  const back =
    from === "pyroxene" ? { title: "청휘석 플래너", to: "/utils/pyroxene" } : { title: "통합 플래너", to: "/planner" };
  const countedImportItems = new Set<string>();
  const defaultShopPlanCount = new Set(
    [...defaultShopPlanKeys].map((key) => key.split("\u0000")[1]).filter((key): key is string => Boolean(key)),
  ).size;
  const totalCount = Math.max(
    0,
    sources.reduce(
      (count, source) => count + countSourceItems(source.envelope, accountSourceKeys, countedImportItems),
      0,
    ) -
      defaultShopPlanCount +
      sources.reduce((count, source) => count + (source.conflictDeletionCount ?? 0), 0),
  );
  const selectedCount = sources.reduce(
    (count, source) => count + countSelection(selectionBySource[source.id] ?? emptySelection()),
    0,
  );
  const discardedCount = Math.max(0, totalCount - selectedCount);
  const isSubmitting = fetcher.state !== "idle";
  const failedLabels = fetcher.data?.failedLabels ?? [];
  const currentResourceSource = sources.find(
    (source) => source.kind === "current" && source.envelope.document.pyroxene.resources !== null,
  );
  const legacyResourceSource = sources.find(
    (source) =>
      source.kind === "legacyConflict" &&
      source.conflictSource === "pyroxene" &&
      (source.legacyConflict?.keys.pyroxene.resources || source.legacyConflict?.keys.removed.resources),
  );
  const currentResourceConflictValue = legacyResourceSource?.conflictBaseEnvelope?.document.pyroxene.resources ?? null;
  const hasResourceConflict = Boolean(legacyResourceSource?.conflictBaseEnvelope);
  const selectedResourceConflictChoice = hasResourceConflict
    ? resourceConflictChoice?.sourceId === legacyResourceSource?.id
      ? (resourceConflictChoice?.value ?? "account")
      : currentResourceSource && selectionBySource[currentResourceSource.id]?.resources
        ? "current"
        : selectionBySource[legacyResourceSource?.id ?? ""]?.resources
          ? "legacy"
          : "account"
    : null;

  const chooseResourceConflictSource = (value: "current" | "legacy" | "account") => {
    if (!legacyResourceSource) return;
    setResourceConflictChoice({ sourceId: legacyResourceSource.id, value });
    setSelectionBySource((current) => {
      const next = { ...current };
      for (const source of [currentResourceSource, legacyResourceSource]) {
        if (!source) continue;
        next[source.id] = { ...(next[source.id] ?? emptySelection()), resources: false };
      }
      const selectedSource = value === "current" ? currentResourceSource : legacyResourceSource;
      if (value !== "account" && selectedSource?.envelope.document.pyroxene.resources) {
        next[selectedSource.id] = { ...(next[selectedSource.id] ?? emptySelection()), resources: true };
      }
      return next;
    });
  };

  const submit = () => {
    submittedSources.current = sources;
    const bodySources = sources.map((source) => ({
      id: source.id,
      envelope: source.envelope,
      selection: selectionBySource[source.id] ?? emptySelection(),
    }));
    fetcher.submit({ sources: bodySources }, { method: "POST", encType: "application/json" });
  };

  const snapshotStatus = guestPlanner.snapshot?.status;
  const hasStorageError = snapshotStatus === "corrupt" || snapshotStatus === "unavailable";
  const hasLegacyError = Boolean(
    guestPlanner.snapshot &&
      "legacySources" in guestPlanner.snapshot &&
      (guestPlanner.snapshot.legacySources.pyroxeneCorrupt || guestPlanner.snapshot.legacySources.eventShopsCorrupt),
  );
  const legacyConflicts =
    guestPlanner.snapshot && "envelope" in guestPlanner.snapshot ? guestPlanner.snapshot.envelope.legacyConflicts : [];
  const displayState = getGuestPlannerImportDisplayState({
    sourceCount: sources.length,
    totalCount,
    isComparing,
    compareError,
    hasStorageError,
    hasLegacyError,
    successfulSave: fetcher.data?.success === true,
  });
  const importFooter = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {selectedCount}개 항목 선택{discardedCount > 0 && ` · 삭제할 항목 ${discardedCount}개`}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button text={`${back.title}로 돌아가기`} to={back.to} variant="secondary" />
        <Button
          variant="primary"
          disabled={isSubmitting || isComparing || (selectedCount === 0 && discardedCount === 0)}
          onClick={submit}
        >
          {isSubmitting && <ArrowPathIcon className="size-4 animate-spin" />}
          {isSubmitting ? "저장하는 중..." : "선택 내용 저장"}
        </Button>
      </div>
    </div>
  );

  return (
    <Page
      title="데이터 가져오기"
      description="비로그인 시 등록한 데이터와 계정에 저장된 데이터를 비교해 저장할 내용을 선택해주세요."
      backward={back}
      contentWidth="full"
    >
      <div className="space-y-5 lg:max-w-4xl">
        {snapshotStatus === "memory" && (
          <Callout
            tone="warning"
            Icon={ExclamationCircleIcon}
            title="브라우저에 저장되지 않은 임시 계획이 있어요"
            description="현재 탭에는 남아 있지만 새로고침 후 사라질 수 있어요. 계획을 가져오거나 유지하기 전에 브라우저 저장 상태를 확인해주세요."
          />
        )}
        {snapshotStatus === "conflict" && (
          <Callout
            tone="warning"
            Icon={ExclamationCircleIcon}
            title="다른 탭에서 플래너가 바뀌었어요"
            description="동시에 변경된 계획은 덮어쓰지 않았어요. 최신 계획을 다시 읽은 뒤 비교해주세요."
          />
        )}
        {legacyConflicts.length > 0 && <GuestPlannerLegacyConflictCallout />}
        {snapshotStatus === "corrupt" && (
          <Callout
            tone="destructive"
            Icon={ExclamationCircleIcon}
            title="미로그인 상태의 플래너 계획을 읽을 수 없어요"
            description="저장된 데이터가 손상되어 계획을 읽지 못했어요. 원본 데이터는 브라우저에 그대로 남아 있어요."
          />
        )}
        {snapshotStatus === "unavailable" && (
          <Callout
            tone="destructive"
            Icon={ExclamationCircleIcon}
            title="브라우저 플래너 저장소를 사용할 수 없어요"
            description="저장 공간에 접근할 수 없어 미로그인 상태의 계획을 확인하지 못했어요."
          />
        )}
        {hasLegacyError && guestPlanner.snapshot && "legacySources" in guestPlanner.snapshot && (
          <>
            {guestPlanner.snapshot.legacySources.pyroxeneCorrupt && (
              <Callout
                tone="destructive"
                Icon={ExclamationCircleIcon}
                title="미로그인 상태의 청휘석 계획을 읽을 수 없어요"
                description="저장된 데이터가 손상되어 계획을 읽지 못했어요. 원본 데이터는 브라우저에 그대로 남아 있어요."
              />
            )}
            {guestPlanner.snapshot.legacySources.eventShopsCorrupt && (
              <Callout
                tone="destructive"
                Icon={ExclamationCircleIcon}
                title="미로그인 상태의 상점 계획을 읽을 수 없어요"
                description="저장된 데이터가 손상되어 계획을 읽지 못했어요. 원본 데이터는 브라우저에 그대로 남아 있어요."
              />
            )}
          </>
        )}
        {compareError && (
          <Callout
            tone="warning"
            Icon={ExclamationCircleIcon}
            title="계정 상점 계획을 확인하지 못했어요"
            description={compareError}
          />
        )}
        {fetcher.data && (
          <Callout
            tone={fetcher.data.revisionConflict ? "destructive" : failedLabels.length > 0 ? "warning" : "success"}
            Icon={fetcher.data.revisionConflict ? undefined : CheckCircleIcon}
            title={
              fetcher.data.revisionConflict
                ? "다른 탭이나 기기에서 플래너가 바뀌었어요"
                : failedLabels.length > 0
                  ? "일부 항목을 가져오지 못했어요"
                  : "선택한 내용을 저장했어요"
            }
            description={
              failedLabels.length > 0
                ? describeImportFailure(failedLabels, discardedCount)
                : discardedCount > 0
                  ? `선택한 항목은 계정에 가져오고, 선택하지 않은 계획 ${discardedCount}개는 이 브라우저에서 삭제했어요.`
                  : "가져온 항목을 이 브라우저에서 정리했어요."
            }
          />
        )}

        {guestPlanner.snapshot === null ? (
          <div aria-busy="true" className="text-sm text-muted-foreground" role="status">
            미로그인 상태의 계획을 불러오고 있어요…
          </div>
        ) : displayState.showNoDataCallout ? (
          <Callout
            title="가져올 데이터를 찾지 못했어요"
            description="이 브라우저에서 비로그인 시 플래너에 등록한 데이터가 없어요."
          />
        ) : (
          <>
            {hasResourceConflict && legacyResourceSource && (
              <SectionCard title="현재 보유 재화" description="앞으로 사용할 값을 선택해주세요.">
                <ResourceConflictComparison
                  selected={selectedResourceConflictChoice ?? "account"}
                  guestResources={currentResourceConflictValue}
                  legacyResources={legacyResourceSource.envelope.document.pyroxene.resources}
                  accountResources={account.resources}
                  onChange={chooseResourceConflictSource}
                />
              </SectionCard>
            )}
            {sources.map((source) => {
              const selection = selectionBySource[source.id] ?? emptySelection();
              const guest = source.envelope;
              const guestRecordsById = guestPyroxeneRecordsById(guest);
              const recordGroups = guestTimelineRecordGroupsById(guest.document.pyroxene.records, guestRecordsById);
              const guestShopPlans = guestPlannerEventShopPlans(guest).filter(
                (plan) =>
                  (comparisonResponse?.success || Boolean(compareError)) &&
                  !defaultShopPlanKeys.has(`${source.id}\u0000${plan.shopStateUid}`),
              );
              const missingSourceKeys = getMissingGuestCollectedSourceKeys(
                guest.document.pyroxene.collectedSourceKeys,
                accountSourceKeys,
              );
              const existingSourceKeys = guest.document.pyroxene.collectedSourceKeys.filter((key) =>
                accountSourceKeys.has(key),
              );
              const sourceMarker =
                source.kind === "current" ? null : (
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{source.label}</p>
                );
              return (
                <div className="space-y-4" key={source.id}>
                  {source.conflictDeletionLabels && source.conflictDeletionLabels.length > 0 && (
                    <SectionCard
                      title="이전 버전에서 삭제한 항목"
                      description="저장을 확인하면 이 충돌 항목을 브라우저 계획에서 정리해요. 계정에 저장된 내용은 바뀌지 않아요."
                    >
                      {sourceMarker}
                      <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {source.conflictDeletionLabels.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </SectionCard>
                  )}
                  {guest.document.pyroxene.resources &&
                    !(
                      hasResourceConflict &&
                      (source.id === currentResourceSource?.id || source.id === legacyResourceSource?.id)
                    ) && (
                      <SectionCard
                        title="현재 보유 재화"
                        description={
                          account.resources ? "앞으로 사용할 값을 선택해주세요." : "계정에 저장된 보유 재화가 없어요."
                        }
                      >
                        {sourceMarker}
                        <ImportSourceComparison
                          name={`resources-${source.id}`}
                          selected={selection.resources ? "guest" : "account"}
                          onChange={(selected) => toggleUnique(source.id, "resources", null, selected === "guest")}
                          guestLabel={source.label}
                          guest={
                            <ResourceSourceSummary
                              resources={guest.document.pyroxene.resources}
                              inputAt={guest.document.pyroxene.resources.inputAt}
                            />
                          }
                          account={
                            account.resources ? (
                              <ResourceSourceSummary
                                resources={account.resources}
                                inputAt={account.resources.inputAt}
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground">저장된 보유 재화가 없어요.</p>
                            )
                          }
                        />
                      </SectionCard>
                    )}

                  {recordGroups.size > 0 && (
                    <SectionCard
                      title="수급/소비 계획"
                      description="계정에 추가할 계획을 선택해주세요. 선택하지 않은 계획은 저장할 때 이 브라우저에서 삭제해요."
                    >
                      {sourceMarker}
                      <div className="space-y-3">
                        {[...recordGroups.entries()].map(([uid, records]) => {
                          const fingerprint = timelineGroupFingerprint(records);
                          const exact = accountRecordFingerprints.has(fingerprint);
                          const attendanceConflict =
                            guestRecordsById.get(uid)?.kind === "attendance" &&
                            account.records.some((record) => (record as { source?: unknown }).source === "attendance");
                          return (
                            <ImportCheckbox
                              key={uid}
                              checked={selection.recordUids.includes(uid)}
                              onChange={(checked) => toggleUnique(source.id, "recordUids", uid, checked)}
                              title={describeTimelineGroup(records, guestRecordsById)}
                              description={
                                exact
                                  ? "같은 내용이 계정에 저장되어 있어요. 한 번 더 추가하려면 선택해주세요."
                                  : attendanceConflict
                                    ? "선택하면 계정에 저장된 출석 계획이 이 날짜로 바뀌어요."
                                    : "계정에 추가"
                              }
                            />
                          );
                        })}
                      </div>
                    </SectionCard>
                  )}

                  {guest.pyroxeneOptionsChanged && (
                    <SectionCard title="플래너 설정" description="앞으로 사용할 설정을 선택해주세요.">
                      {sourceMarker}
                      <ImportSourceComparison
                        name={`options-${source.id}`}
                        selected={selection.options ? "guest" : "account"}
                        onChange={(selected) => toggleUnique(source.id, "options", null, selected === "guest")}
                        guestLabel={source.label}
                        guest={<PlannerOptionsSummary options={guest.document.pyroxene.options} />}
                        account={<PlannerOptionsSummary options={account.options} />}
                      />
                    </SectionCard>
                  )}

                  {(guest.favorites.length > 0 || Object.keys(guest.document.pyroxene.eventData).length > 0) && (
                    <SectionCard title="관심 학생과 모집 설정" description="계정에 없는 항목은 기본으로 선택했어요.">
                      {sourceMarker}
                      <div className="space-y-3">
                        {guest.favorites.map((favorite) => {
                          const key = favoriteKey(favorite);
                          return (
                            <ImportCheckbox
                              key={key}
                              checked={selection.favorites.some((item) => favoriteKey(item) === key)}
                              onChange={(checked) => toggleUnique(source.id, "favorites", key, checked, favorite)}
                              title={accountNames.get(key) ?? "관심 학생"}
                              description={
                                accountFavorites.has(key)
                                  ? "이미 계정의 관심 학생으로 저장되어 있어요."
                                  : "계정의 관심 학생에 추가"
                              }
                            />
                          );
                        })}
                        {Object.entries(guest.document.pyroxene.eventData)
                          .filter(([, state]) => state.completed || state.expectedTrials !== null)
                          .map(([eventUid, state]) => (
                            <ImportCheckbox
                              key={eventUid}
                              checked={selection.eventUids.includes(eventUid)}
                              onChange={(checked) => toggleUnique(source.id, "eventUids", eventUid, checked)}
                              title={`${accountNames.get(eventUid) ?? "모집"} · ${state.completed ? "모집 완료" : `${state.expectedTrials}회`}`}
                              description={
                                account.eventData.some((item) => item.eventUid === eventUid)
                                  ? "계정에 모집 목표가 저장되어 있어요. 선택하면 비로그인 시 등록한 값으로 바뀌어요."
                                  : "계정에 추가"
                              }
                            />
                          ))}
                      </div>
                    </SectionCard>
                  )}

                  {missingSourceKeys.length > 0 && (
                    <SectionCard title="수령한 보상" description="계정에 없는 기록은 기본으로 선택했어요.">
                      {sourceMarker}
                      <div className="space-y-3">
                        {missingSourceKeys.length > 0 && (
                          <ImportCheckbox
                            checked={missingSourceKeys.every((key) => selection.sourceKeys.includes(key))}
                            onChange={(checked) => {
                              for (const key of missingSourceKeys) toggleUnique(source.id, "sourceKeys", key, checked);
                            }}
                            title={`새로 가져올 수령 기록 ${missingSourceKeys.length}건`}
                            description="계정의 수령 기록에 추가"
                          />
                        )}
                        {existingSourceKeys.length > 0 && (
                          <ImportCheckbox
                            checked={existingSourceKeys.every((key) => selection.sourceKeys.includes(key))}
                            onChange={(checked) => {
                              for (const key of existingSourceKeys) toggleUnique(source.id, "sourceKeys", key, checked);
                            }}
                            title={`계정에 이미 저장된 수령 기록 ${existingSourceKeys.length}건`}
                            description="이미 계정에 저장되어 있어요."
                          />
                        )}
                      </div>
                    </SectionCard>
                  )}

                  {(guestShopPlans.length > 0 ||
                    (isComparing && Object.keys(guest.document.eventShops).length > 0)) && (
                    <SectionCard
                      title="이벤트 상점 계획"
                      description="이벤트별 미로그인 상태의 계획과 계정 계획을 비교해 가져올 내용을 선택해주세요."
                    >
                      {sourceMarker}
                      {isComparing && (
                        <div
                          aria-busy="true"
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                          role="status"
                        >
                          <ArrowPathIcon className="size-4 animate-spin" /> 계정 계획을 확인하고 있어요…
                        </div>
                      )}
                      <div className="space-y-3">
                        {guestShopPlans.map((plan) => {
                          const row = comparisonResponse?.states.find(
                            (item) => item.shopStateUid === plan.shopStateUid,
                          );
                          const accountState = row?.status === "available" ? row.state : null;
                          const eventName = row?.eventName?.trim() || "이벤트 정보를 확인할 수 없어요";
                          const comparisonStatus =
                            row?.status !== "available"
                              ? "계정 계획을 확인할 수 없어요"
                              : !row.state
                                ? "계정에 계획이 없어요"
                                : eventShopStatesEqual(row.state, plan.state)
                                  ? "계정 계획과 같아요"
                                  : "계정 계획과 내용이 달라요";
                          return (
                            <article key={plan.shopStateUid} className="space-y-3 rounded-lg border border-border p-4">
                              <h3 className="sr-only">{eventName}</h3>
                              <ImportCheckbox
                                checked={selection.eventShopUids.includes(plan.shopStateUid)}
                                onChange={(checked) =>
                                  toggleUnique(source.id, "eventShopUids", plan.shopStateUid, checked)
                                }
                                title={`${eventName} · ${comparisonStatus}`}
                                description={
                                  comparisonStatus === "계정 계획과 같아요"
                                    ? "같은 계획이 계정에 저장되어 있어요."
                                    : "선택하면 이 브라우저 계획을 계정에 저장해요."
                                }
                              />
                              <div className="grid gap-2 md:grid-cols-2">
                                {accountState && (
                                  <EventShopPlanSummary
                                    title="계정 계획"
                                    state={accountState}
                                    catalog={row?.status === "available" ? row.displayCatalog : null}
                                  />
                                )}
                                <EventShopPlanSummary
                                  title="이 브라우저 계획"
                                  state={plan.state}
                                  catalog={row?.status === "available" ? row.displayCatalog : null}
                                />
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </SectionCard>
                  )}
                </div>
              );
            })}

            {displayState.showFooter && importFooter}
          </>
        )}
      </div>
    </Page>
  );
}

const IMPORT_SOURCE_LABELS = { guest: "비로그인 시 등록한 값", account: "계정에 저장된 값" } as const;

function ImportSourceComparison({
  name,
  selected,
  onChange,
  guest,
  account,
  guestLabel = IMPORT_SOURCE_LABELS.guest,
}: {
  name: string;
  selected: "guest" | "account";
  onChange: (source: "guest" | "account") => void;
  guest: ReactNode;
  account: ReactNode;
  guestLabel?: string;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{name.startsWith("resources") ? "현재 보유 재화" : "플래너 설정"} 선택</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {(["guest", "account"] as const).map((source) => (
          <label
            key={source}
            className={cn(
              "flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors",
              selected === source
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border bg-card hover:bg-muted/50",
            )}
          >
            <span className="flex items-center gap-2 font-medium text-foreground">
              <input
                type="radio"
                name={`planner-import-${name}`}
                checked={selected === source}
                onChange={() => onChange(source)}
                className="size-4 border-input text-primary focus:ring-2 focus:ring-ring/30"
              />
              {source === "guest" ? guestLabel : IMPORT_SOURCE_LABELS.account}
            </span>
            {source === "guest" ? guest : account}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ResourceConflictComparison({
  selected,
  guestResources,
  legacyResources,
  accountResources,
  onChange,
}: {
  selected: "current" | "legacy" | "account";
  guestResources: (PickupResources & { inputAt: string }) | null;
  legacyResources: (PickupResources & { inputAt: string }) | null;
  accountResources: (PickupResources & { inputAt: Date | string }) | null;
  onChange: (source: "current" | "legacy" | "account") => void;
}) {
  const resourceNote = (candidate: (PickupResources & { inputAt: string }) | null) => {
    if (!candidate || !accountResources) return undefined;
    const sameAmounts =
      candidate.pyroxene === accountResources.pyroxene &&
      candidate.oneTimeTicket === accountResources.oneTimeTicket &&
      candidate.tenTimeTicket === accountResources.tenTimeTicket;
    const candidateTime = new Date(candidate.inputAt).getTime();
    const accountTime = new Date(accountResources.inputAt).getTime();
    return !sameAmounts && candidateTime < accountTime ? "가져온 시각 기준 보유량으로 저장돼요" : undefined;
  };
  const choices = [
    {
      id: "current" as const,
      label: "비로그인 시 등록한 값",
      note: resourceNote(guestResources),
      content: guestResources ? (
        <ResourceSourceSummary resources={guestResources} inputAt={guestResources.inputAt} />
      ) : (
        <p className="text-sm text-muted-foreground">새 미로그인 상태의 계획에는 보유 재화가 없어요.</p>
      ),
    },
    {
      id: "legacy" as const,
      label: "이전 버전 화면에서 저장한 값",
      note: resourceNote(legacyResources),
      content: legacyResources ? (
        <ResourceSourceSummary resources={legacyResources} inputAt={legacyResources.inputAt} />
      ) : (
        <p className="text-sm text-muted-foreground">이전 버전 화면에는 보유 재화가 저장되어 있지 않아요.</p>
      ),
    },
    {
      id: "account" as const,
      label: "계정에 저장된 값",
      content: accountResources ? (
        <ResourceSourceSummary resources={accountResources} inputAt={accountResources.inputAt} />
      ) : (
        <p className="text-sm text-muted-foreground">계정에 저장된 보유 재화가 없어요.</p>
      ),
    },
  ];
  return (
    <fieldset>
      <legend className="sr-only">현재 보유 재화로 사용할 값</legend>
      <div className="grid gap-3 md:grid-cols-3">
        {choices.map((choice) => (
          <label
            key={choice.id}
            className={cn(
              "flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors",
              selected === choice.id
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border bg-card hover:bg-muted/50",
            )}
          >
            <span className="flex min-h-10 items-start gap-2 text-sm font-medium leading-5 text-foreground">
              <input
                type="radio"
                name="planner-import-resource-conflict"
                checked={selected === choice.id}
                onChange={() => onChange(choice.id)}
                className="mt-0.5 size-4 shrink-0 border-input text-primary focus:ring-2 focus:ring-ring/30"
              />
              <span>
                {choice.label}
                {choice.note && (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">{choice.note}</span>
                )}
              </span>
            </span>
            {choice.content}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ResourceSourceSummary({ resources, inputAt }: { resources: PickupResources; inputAt: Date | string }) {
  const items = [
    {
      resourceType: ResourceTypeEnum.Currency,
      itemUid: PYROXENE_RESOURCE_UIDS.pyroxene,
      label: "청휘석",
      value: resources.pyroxene,
      unit: "개",
    },
    {
      resourceType: ResourceTypeEnum.Item,
      itemUid: PYROXENE_RESOURCE_UIDS.tenTimeTicket,
      label: "10회 모집 티켓",
      value: resources.tenTimeTicket,
      unit: "장",
    },
    {
      resourceType: ResourceTypeEnum.Item,
      itemUid: PYROXENE_RESOURCE_UIDS.oneTimeTicket,
      label: "1회 모집 티켓",
      value: resources.oneTimeTicket,
      unit: "장",
    },
  ];
  return (
    <span className="space-y-3">
      <span className="space-y-2">
        {items.map((item) => (
          <span key={item.itemUid} className="flex items-center gap-2.5">
            <ResourceCard resourceType={item.resourceType} itemUid={item.itemUid} name={item.label} size="sm" />
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">{item.label}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {item.value.toLocaleString()}
              {item.unit}
            </span>
          </span>
        ))}
      </span>
      <span className="mt-2 block text-sm text-muted-foreground">{dayjs(inputAt).format("MM/DD HH:mm")} 입력</span>
    </span>
  );
}

function PlannerOptionsSummary({ options }: { options: PyroxenePlannerOptions }) {
  const pickupChance = { average: "평균 (천장 미반영)", average_pity: "평균 (천장 반영)", ceil: "천장" }[
    options.event.pickupChance
  ];
  const raidTier = { platinum: "플래티넘", gold: "골드", silver: "실버", bronze: "브론즈" }[options.raid.tier];
  const tacticalLevel = { in10: "10위 내", in100: "100위 내", in200: "200위 내", over200: "200위 밖" }[
    options.tactical.level
  ];
  return (
    <span className="space-y-1 text-sm">
      <span className="block font-medium text-foreground">모집 목표 · {pickupChance}</span>
      <span className="block text-muted-foreground">
        총력전 {raidTier} · 전술대회 {tacticalLevel}
      </span>
      <span className="block text-muted-foreground">
        AP 충전 {options.consumption.apChargeCount}회 · 타임라인 {options.timeline.display.length}개 표시
      </span>
    </span>
  );
}

function ImportCheckbox({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onChange={onChange}
      className={cn(
        "w-full items-start rounded-lg border px-4 py-3 transition-colors",
        checked ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/50",
      )}
      aria-label={title}
      label={
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
        </span>
      }
    />
  );
}

type PlanReviewSection = { title: string; lines: string[] };

function visibleName(names: Record<string, string> | undefined, uid: string, fallback: string): string {
  return names?.[uid]?.trim() || fallback;
}

export function formatStudents(uids: readonly string[], catalog: EventShopPlanDisplayCatalog | null): string {
  if (uids.length === 0) return "선택한 학생 없음";
  if (!catalog) return "이벤트 상점 학생 정보를 확인할 수 없어요.";

  const names: string[] = [];
  let nonBonusStudentCount = 0;
  for (const uid of new Set(uids)) {
    const name = catalog.studentNamesByUid[uid]?.trim();
    if (name) names.push(name);
    else nonBonusStudentCount += 1;
  }
  if (names.length === 0) return `이벤트 보너스 학생 없음 · 대상 외 선택 ${nonBonusStudentCount}명`;
  return [
    names.join(" · "),
    ...(nonBonusStudentCount > 0 ? [`이벤트 보너스 대상이 아닌 선택 ${nonBonusStudentCount}명`] : []),
  ].join(" · ");
}

function getPlanReviewSections(
  state: EventShopState,
  catalog: EventShopPlanDisplayCatalog | null,
): PlanReviewSection[] {
  const itemUids = new Set([...Object.keys(state.itemQuantities), ...Object.keys(state.itemPurchaseDays)]);
  const purchases = [...itemUids]
    .filter((uid) => (state.itemQuantities[uid] ?? 0) > 0 || (state.itemPurchaseDays[uid] ?? 0) > 0)
    .map((uid) => {
      const name = visibleName(catalog?.shopItemNamesByUid, uid, "상점 아이템 이름을 확인할 수 없어요");
      const quantity = state.itemQuantities[uid] ?? 0;
      const days = state.itemPurchaseDays[uid] ?? 0;
      return `${name}: ${days > 0 ? `하루 ${quantity.toLocaleString()}회 · ${days.toLocaleString()}일` : `${quantity.toLocaleString()}회`}`;
    });
  const owned = Object.entries(state.existingPaymentItemQuantities)
    .filter(([, quantity]) => quantity > 0)
    .map(
      ([uid, quantity]) =>
        `${visibleName(catalog?.resourceNamesByUid, uid, "재화 이름을 확인할 수 없어요")}: ${quantity.toLocaleString()}개`,
    );
  const overrides = Object.entries(state.overriddenRequiredQuantities).map(
    ([uid, quantity]) =>
      `${visibleName(catalog?.resourceNamesByUid, uid, "목표 재화 이름을 확인할 수 없어요")}: ${quantity.toLocaleString()}개`,
  );
  const bonusItems = [
    ...new Set([
      ...Object.keys(catalog?.bonusResourceNamesByUid ?? {}),
      ...Object.keys(state.selectedBonusStudentUidsByItem),
    ]),
  ];
  const bonuses =
    state.bonusStudentSelectionMode === "shared" || bonusItems.length === 0
      ? [formatStudents(state.selectedBonusStudentUids, catalog)]
      : bonusItems.map(
          (uid) =>
            `${visibleName(catalog?.bonusResourceNamesByUid, uid, "보너스 재화 이름을 확인할 수 없어요")}: ${formatStudents(state.selectedBonusStudentUidsByItem[uid] ?? state.selectedBonusStudentUids, catalog)}`,
        );
  const stages = (catalog?.sweepStageUids ?? []).map(
    (uid) =>
      `${visibleName(catalog?.stageLabelsByUid, uid, "스테이지 정보를 확인할 수 없어요")}: ${state.enabledStages[uid] ? "선택" : "해제"}`,
  );
  const unknownStageCount = Object.keys(state.enabledStages).filter((uid) => !catalog?.stageLabelsByUid[uid]).length;
  if (unknownStageCount > 0) stages.push(`${unknownStageCount}개 스테이지의 선택 상태를 확인할 수 없어요`);
  const extraRuns = Object.entries(state.extraStageRuns)
    .filter(([, runs]) => runs > 0)
    .map(
      ([uid, runs]) =>
        `${visibleName(catalog?.stageLabelsByUid, uid, "스테이지 정보를 확인할 수 없어요")}: 추가 ${runs.toLocaleString()}회`,
    );
  const paymentMode = { expected: "기대 비용", min: "최소 비용", max: "최대 비용" }[state.minigamePaymentQuantityMode];
  const minigame =
    catalog && !catalog.hasMinigame
      ? state.minigamePlayCount > 0
        ? `미니게임 정보를 확인할 수 없어요 · ${state.minigamePlayCount.toLocaleString()}회`
        : "미니게임 계획 없음"
      : `${state.minigamePlayCount.toLocaleString()}회 · ${state.minigameStartRound.toLocaleString()}라운드부터 · ${paymentMode}`;
  return [
    { title: "상점 구매 목표", lines: purchases.length ? purchases : ["구매 목표 없음"] },
    { title: "현재 보유 재화", lines: owned.length ? owned : ["보유 재화 입력 없음"] },
    { title: "직접 입력한 목표 수량", lines: overrides.length ? overrides : ["직접 입력한 목표 없음"] },
    {
      title: "보너스 학생",
      lines: [
        `선택 방식: ${state.bonusStudentSelectionMode === "shared" ? "공통 선택" : "재화별 선택"}`,
        `보유 학생 반영: ${state.includeRecruitedStudents ? "포함" : "미포함"}`,
        ...bonuses,
      ],
    },
    {
      title: "스테이지 계획",
      lines: [
        `스토리 / 초회 보상: ${state.includeFirstClear ? "포함" : "미포함"}`,
        ...(stages.length ? stages : ["퀘스트 스테이지 정보가 없어요"]),
        ...(extraRuns.length ? extraRuns : ["추가 소탕 입력 없음"]),
      ],
    },
    { title: "미니게임", lines: [minigame] },
  ];
}

function EventShopPlanSummary({
  title,
  state,
  catalog,
}: {
  title: string;
  state: EventShopState;
  catalog: EventShopPlanDisplayCatalog | null;
}) {
  const sections = getPlanReviewSections(state, catalog);
  const itemCount = Object.values(state.itemQuantities).filter((quantity) => quantity > 0).length;
  const stageCount = Object.values(state.enabledStages).filter(Boolean).length;
  const currencyCount = Object.values(state.existingPaymentItemQuantities).filter((quantity) => quantity > 0).length;
  return (
    <details open className="rounded-md bg-muted/40 p-3">
      <summary className="cursor-pointer list-inside list-disc">
        <span className="font-medium text-foreground">{title}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {itemCount}개 구매 목표 · {stageCount}개 선택 스테이지 · {currencyCount}개 보유 재화 입력
        </span>
      </summary>
      {!catalog && (
        <p className="mt-2 text-xs text-muted-foreground">
          이벤트 상점 이름 정보를 확인할 수 없어 일부 항목을 이름 확인 불가로 표시했어요.
        </p>
      )}
      <div className="mt-3 space-y-3 text-sm">
        {sections.map((section) => (
          <SummaryList key={section.title} title={section.title} lines={section.lines} empty="입력 없음" />
        ))}
      </div>
    </details>
  );
}

function SummaryList({ title, lines, empty }: { title: string; lines: string[]; empty: string }) {
  const occurrences = new Map<string, number>();
  const keyedLines = (lines.length ? lines : [empty]).map((line) => {
    const occurrence = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrence + 1);
    return { line, occurrence };
  });
  return (
    <section>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      <ul className="mt-1 space-y-1 text-sm text-foreground">
        {keyedLines.map(({ line, occurrence }) => (
          <li key={`${title}:${line}:${occurrence}`} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
