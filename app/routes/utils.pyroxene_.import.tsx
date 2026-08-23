import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import dayjs from "dayjs";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  type MetaFunction,
  redirect,
  useFetcher,
  useLoaderData,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { useGuestPyroxenePlanner } from "~/components/features/futures";
import Page from "~/components/features/layout/Page";
import { Button, Callout, Checkbox, ResourceCard, SectionCard } from "~/components/primitives";
import {
  clearVerifiedGuestPyroxeneImport,
  type GuestPyroxeneFavorite,
  type GuestPyroxenePlannerEnvelope,
  type GuestPyroxeneRecord,
  guestPyroxeneRecordFingerprint,
  parseGuestPyroxenePlanner,
  pyroxeneTimelineItemFingerprint,
  type VerifiedGuestPyroxeneImport,
} from "~/domain/guest-pyroxene-planner";
import {
  isD1MaintenanceResult,
  type D1MaintenanceResult,
  d1MaintenanceMessage,
} from "~/domain/pyroxene-cutover";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { extractPyroxeneTimelineBaseUid, PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { withD1Session } from "~/lib/d1-session";
import { d1MaintenanceActionResult } from "~/lib/pyroxene-cutover.server";
import { cn } from "~/lib/utils";
import { favoriteStudent, getUserFavoritedStudents } from "~/models/favorite-students";
import { type GuestPyroxeneImportPlan, importGuestPyroxeneSelection } from "~/models/guest-pyroxene-import";
import { getPyroxeneUserState } from "~/models/pyroxene-planner";
import { getPyroxenePlannerContents } from "~/views/pyroxene";

type ImportSelection = {
  resources: boolean;
  options: boolean;
  recordIds: string[];
  sourceKeys: string[];
  eventUids: string[];
  favorites: GuestPyroxeneFavorite[];
};

type VerifiedItems = VerifiedGuestPyroxeneImport;

type ImportActionResult = {
  success: boolean;
  verified: VerifiedItems;
  failedLabels: string[];
};

const emptyVerified = (): VerifiedItems => ({
  resources: false,
  options: false,
  recordIds: [],
  sourceKeys: [],
  eventUids: [],
  favorites: [],
});

function verifiedItemCount(items: VerifiedItems): number {
  return (
    Number(items.resources) +
    Number(items.options) +
    items.recordIds.length +
    items.sourceKeys.length +
    items.eventUids.length +
    items.favorites.length
  );
}

function getDiscardedItems(guest: GuestPyroxenePlannerEnvelope["data"], selection: ImportSelection): VerifiedItems {
  const selectedRecordIds = new Set(selection.recordIds);
  const selectedSourceKeys = new Set(selection.sourceKeys);
  const selectedEventUids = new Set(selection.eventUids);
  const selectedFavoriteKeys = new Set(selection.favorites.map(favoriteKey));

  return {
    resources: Boolean(guest.resources && !selection.resources),
    options: guest.optionsChanged && !selection.options,
    recordIds: guest.records
      .filter((record) => !selectedRecordIds.has(record.recordId))
      .map((record) => record.recordId),
    sourceKeys: guest.collectedSourceKeys.filter((key) => !selectedSourceKeys.has(key)),
    eventUids: Object.keys(guest.eventTrials).filter((uid) => !selectedEventUids.has(uid)),
    favorites: guest.favoriteStudents.filter((favorite) => !selectedFavoriteKeys.has(favoriteKey(favorite))),
  };
}

export const meta: MetaFunction = () => [{ title: "데이터 가져오기 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  if (!user) return redirect("/unauthorized");

  const publicReadEnv = withD1Session(env, "first-unconstrained");
  const [contents, pyroxeneState, favorites] = await Promise.all([
    getPyroxenePlannerContents(publicReadEnv, false, ctx),
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

function favoriteKey(favorite: GuestPyroxeneFavorite): string {
  return `${favorite.contentUid}\u0000${favorite.studentUid}`;
}

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  if (!user)
    return data<ImportActionResult>(
      { success: false, verified: emptyVerified(), failedLabels: ["로그인이 필요해요"] },
      { status: 401 },
    );

const maintenance = await d1MaintenanceActionResult(env, {
    ctx,
    operation: "utils.pyroxene.import.action",
  });
  if (maintenance) return maintenance;

  const body = await request.json<{ envelope?: unknown; selection?: ImportSelection }>();
  const envelope = body.envelope ? parseGuestPyroxenePlanner(JSON.stringify(body.envelope)) : null;
  const selection = body.selection;
  if (
    !envelope ||
    !selection ||
    typeof selection.resources !== "boolean" ||
    typeof selection.options !== "boolean" ||
    !Array.isArray(selection.recordIds) ||
    !selection.recordIds.every((value) => typeof value === "string") ||
    !Array.isArray(selection.sourceKeys) ||
    !selection.sourceKeys.every((value) => typeof value === "string") ||
    !Array.isArray(selection.eventUids) ||
    !selection.eventUids.every((value) => typeof value === "string") ||
    !Array.isArray(selection.favorites) ||
    !selection.favorites.every(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof value.contentUid === "string" &&
        typeof value.studentUid === "string",
    )
  ) {
    return data<ImportActionResult>(
      { success: false, verified: emptyVerified(), failedLabels: ["가져올 데이터를 확인하지 못했어요"] },
      { status: 400 },
    );
  }

  const { datasetId } = envelope;
  const guest = envelope.data;
  const selectedRecordIds = new Set(selection.recordIds);
  const selectedSourceKeys = new Set(selection.sourceKeys);
  const selectedEventUids = new Set(selection.eventUids);
  const selectedFavoriteKeys = new Set(selection.favorites.map(favoriteKey));
  if (
    [...selectedRecordIds].some((id) => !guest.records.some((record) => record.recordId === id)) ||
    [...selectedSourceKeys].some((key) => !guest.collectedSourceKeys.includes(key)) ||
    [...selectedEventUids].some((uid) => !(uid in guest.eventTrials)) ||
    [...selectedFavoriteKeys].some((key) => !guest.favoriteStudents.some((favorite) => favoriteKey(favorite) === key))
  ) {
    return data<ImportActionResult>(
      { success: false, verified: emptyVerified(), failedLabels: ["선택한 항목이 원본 데이터와 일치하지 않아요"] },
      { status: 400 },
    );
  }

  const selectedRecords = guest.records.filter((item) => selectedRecordIds.has(item.recordId));
  const selectedSourceKeysInOrder = guest.collectedSourceKeys.filter((key) => selectedSourceKeys.has(key));
  const selectedEventTrials = Object.entries(guest.eventTrials)
    .filter(([uid]) => selectedEventUids.has(uid))
    .map(([eventUid, expectedTrials]) => ({ eventUid, expectedTrials }));
  const selectedFavorites = guest.favoriteStudents.filter((item) => selectedFavoriteKeys.has(favoriteKey(item)));
  const plan: GuestPyroxeneImportPlan = {
    resources: selection.resources && guest.resources ? guest.resources : undefined,
    options: selection.options && guest.optionsChanged ? guest.options : undefined,
    records: selectedRecords,
    sourceKeys: selectedSourceKeysInOrder,
    eventTrials: selectedEventTrials,
    favorites: selectedFavorites.map((favorite) => ({
      itemKey: favoriteKey(favorite),
      run: () => favoriteStudent(env, user.id, favorite.studentUid, favorite.contentUid, { ctx }),
    })),
  };
  const selectedItems = [
    ...(plan.resources ? [{ type: "resources" as const, key: "current", label: "보유 재화" }] : []),
    ...(plan.options ? [{ type: "options" as const, key: "current", label: "플래너 설정" }] : []),
    ...selectedRecords.map((record) => ({
      type: "record" as const,
      key: record.recordId,
      label: describeRecord(record),
    })),
    ...selectedSourceKeysInOrder.map((key) => ({ type: "source" as const, key, label: "수령한 보상" })),
    ...selectedEventTrials.map(({ eventUid }) => ({ type: "event" as const, key: eventUid, label: "모집 목표" })),
    ...selectedFavorites.map((favorite) => ({
      type: "favorite" as const,
      key: favoriteKey(favorite),
      label: "관심 학생",
    })),
  ];

  let importResult: Awaited<ReturnType<typeof importGuestPyroxeneSelection>>;
  try {
    importResult = await importGuestPyroxeneSelection(env, user.id, datasetId, plan, { ctx });
  } catch {
    return {
      success: false,
      verified: emptyVerified(),
      failedLabels: selectedItems.map(({ label }) => label),
    } satisfies ImportActionResult;
  }

  const verified = emptyVerified();
  for (const item of importResult.verified) {
    switch (item.type) {
      case "resources":
        verified.resources = true;
        break;
      case "options":
        verified.options = true;
        break;
      case "record":
        verified.recordIds.push(item.key);
        break;
      case "source":
        verified.sourceKeys.push(item.key);
        break;
      case "event":
        verified.eventUids.push(item.key);
        break;
      case "favorite": {
        const favorite = selectedFavorites.find((candidate) => favoriteKey(candidate) === item.key);
        if (favorite) verified.favorites.push(favorite);
        break;
      }
    }
  }
  const labels = new Map(selectedItems.map((item) => [`${item.type}\u0000${item.key}`, item.label]));
  const failedLabels = importResult.failed.flatMap((item) => {
    const label = labels.get(`${item.type}\u0000${item.key}`);
    return label ? [label] : [];
  });

  return { success: failedLabels.length === 0, verified, failedLabels } satisfies ImportActionResult;
};

function describeRecord(record: GuestPyroxeneRecord): string {
  return `${recordName(record)} · ${recordDate(record)}`;
}

function recordName(record: GuestPyroxeneRecord): string {
  switch (record.kind) {
    case "buy":
      return "청휘석 구매";
    case "monthlyPackage":
      return record.packageType === "full" ? "월정액" : "반정액";
    case "apPackage":
      return "AP 패키지";
    case "attendance":
      return "출석 시작일";
    case "other":
      return record.description || "기타 수급";
  }
}

function recordDate(record: GuestPyroxeneRecord): string {
  switch (record.kind) {
    case "buy":
    case "other":
      return dayjs(record.date).format("MM/DD");
    case "monthlyPackage":
    case "apPackage":
    case "attendance":
      return dayjs(record.startDate).format("MM/DD");
  }
}

export default function GuestPyroxeneImportPage() {
  const account = useLoaderData<typeof loader>();
  const guestPlanner = useGuestPyroxenePlanner();
  const fetcher = useFetcher<ImportActionResult | D1MaintenanceResult>();
  const [selection, setSelection] = useState<ImportSelection | null>(null);
  const initializedDatasetId = useRef<string | null>(null);
  const processedResult = useRef<ImportActionResult | null>(null);
  const submittedEnvelope = useRef<GuestPyroxenePlannerEnvelope | null>(null);
  const submittedDiscardedItems = useRef<VerifiedItems>(emptyVerified());

  const envelope =
    guestPlanner.snapshot?.status === "ready" || guestPlanner.snapshot?.status === "memory"
      ? guestPlanner.snapshot.envelope
      : null;

  const accountRecordFingerprints = useMemo(() => {
    const grouped = new Map<string, typeof account.records>();
    for (const item of account.records) {
      const baseUid = extractPyroxeneTimelineBaseUid(item.uid);
      grouped.set(baseUid, [...(grouped.get(baseUid) ?? []), item]);
    }
    return new Set([...grouped.values()].map((items) => items.map(pyroxeneTimelineItemFingerprint).sort().join("|")));
  }, [account.records]);
  const accountSourceKeys = useMemo(() => new Set(account.sourceKeys), [account.sourceKeys]);
  const accountFavoriteKeys = useMemo(() => new Set(account.favorites.map(favoriteKey)), [account.favorites]);

  const sourceGroups = useMemo(() => {
    const sourceKeys = envelope?.data.collectedSourceKeys ?? [];
    return {
      missing: sourceKeys.filter((key) => !accountSourceKeys.has(key)),
      existing: sourceKeys.filter((key) => accountSourceKeys.has(key)),
    };
  }, [accountSourceKeys, envelope]);

  const contentLabels = useMemo(() => {
    const eventNames = new Map<string, string>();
    const favoriteNames = new Map<string, string>();
    for (const content of account.contents) {
      if (content.kind !== "event") continue;
      eventNames.set(content.uid, content.name);
      for (const recruitment of content.recruitments) {
        if (!recruitment.student) continue;
        const contentUid = recruitment.sourceContentUid ?? content.uid;
        favoriteNames.set(
          favoriteKey({ contentUid, studentUid: recruitment.student.uid }),
          `${recruitment.student.name} · ${content.name}`,
        );
      }
    }
    return { eventNames, favoriteNames };
  }, [account.contents]);

  useEffect(() => {
    if (!envelope || initializedDatasetId.current === envelope.datasetId) return;
    initializedDatasetId.current = envelope.datasetId;
    const accountEventUids = new Set(account.eventData.map((item) => item.eventUid));
    setSelection({
      resources: Boolean(envelope.data.resources && !account.resources),
      options: false,
      recordIds: envelope.data.records
        .filter(
          (record) => record.kind !== "attendance" || !account.records.some((item) => item.source === "attendance"),
        )
        .filter((record) => !accountRecordFingerprints.has(guestPyroxeneRecordFingerprint(record)))
        .map((record) => record.recordId),
      sourceKeys: envelope.data.collectedSourceKeys.filter((key) => !accountSourceKeys.has(key)),
      eventUids: Object.keys(envelope.data.eventTrials).filter((uid) => !accountEventUids.has(uid)),
      favorites: envelope.data.favoriteStudents.filter((favorite) => !accountFavoriteKeys.has(favoriteKey(favorite))),
    });
  }, [
    account.eventData,
    account.records,
    account.resources,
    accountFavoriteKeys,
    accountRecordFingerprints,
    accountSourceKeys,
    envelope,
  ]);

  useEffect(() => {
    const result = fetcher.data;
    if (!result || isD1MaintenanceResult(result) || result === processedResult.current) return;
    processedResult.current = result;
    const submitted = submittedEnvelope.current;
    if (!submitted) return;
    const verifiedFavoriteKeys = new Set(result.verified.favorites.map(favoriteKey));
    setSelection((current) =>
      current
        ? {
            resources: result.verified.resources ? false : current.resources,
            options: result.verified.options ? false : current.options,
            recordIds: current.recordIds.filter((id) => !result.verified.recordIds.includes(id)),
            sourceKeys: current.sourceKeys.filter((key) => !result.verified.sourceKeys.includes(key)),
            eventUids: current.eventUids.filter((uid) => !result.verified.eventUids.includes(uid)),
            favorites: current.favorites.filter((favorite) => !verifiedFavoriteKeys.has(favoriteKey(favorite))),
          }
        : current,
    );
    void guestPlanner.update((current) => {
      const imported = clearVerifiedGuestPyroxeneImport(current, submitted.data, result.verified);
      return clearVerifiedGuestPyroxeneImport(imported, submitted.data, submittedDiscardedItems.current);
    });
  }, [fetcher.data, guestPlanner.update]);

  const toggleList = <T extends string>(values: T[], value: T, checked: boolean) =>
    checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
  const toggleGroup = (values: string[], group: string[], checked: boolean) =>
    checked ? [...new Set([...values, ...group])] : values.filter((item) => !group.includes(item));
  const isSubmitting = fetcher.state !== "idle";
  const selectedCount = selection
    ? Number(selection.resources) +
      Number(selection.options) +
      selection.recordIds.length +
      selection.sourceKeys.length +
      selection.eventUids.length +
      selection.favorites.length
    : 0;
  const discardedItems = envelope && selection ? getDiscardedItems(envelope.data, selection) : emptyVerified();
  const discardedCount = verifiedItemCount(discardedItems);
  const submittedDiscardedCount = verifiedItemCount(submittedDiscardedItems.current);
  const maintenanceMessage = d1MaintenanceMessage(fetcher.data);
  const importResult = fetcher.data && !isD1MaintenanceResult(fetcher.data) ? fetcher.data : null;
  const importedCount = importResult ? verifiedItemCount(importResult.verified) : 0;

  return (
    <Page
      title="데이터 가져오기"
      description="비로그인 시 등록한 데이터와 계정에 저장된 데이터를 비교해 저장할 내용을 선택해주세요."
      backward={{ title: "청휘석 플래너", to: "/utils/pyroxene" }}
      contentWidth="full"
    >
      <div className="space-y-5 lg:max-w-4xl">
        {!envelope || !selection ? (
          <Callout
            title="가져올 데이터를 찾지 못했어요"
            description="이 브라우저에서 비로그인 시 플래너에 등록한 데이터가 없어요."
          />
        ) : (
          <>
            {envelope.data.resources && (
              <SectionCard
                title="현재 보유 재화"
                description={
                  account.resources ? "앞으로 사용할 값을 선택해주세요." : "계정에 저장된 보유 재화가 없어요."
                }
              >
                <ImportSourceComparison
                  name="resources"
                  selected={selection.resources ? "guest" : "account"}
                  onChange={(source) => setSelection({ ...selection, resources: source === "guest" })}
                  guest={
                    <ResourceSourceSummary
                      resources={envelope.data.resources}
                      inputAt={envelope.data.resources.inputAt}
                    />
                  }
                  account={
                    account.resources ? (
                      <ResourceSourceSummary resources={account.resources} inputAt={account.resources.inputAt} />
                    ) : (
                      <p className="text-sm text-muted-foreground">저장된 보유 재화가 없어요.</p>
                    )
                  }
                />
              </SectionCard>
            )}

            {envelope.data.records.length > 0 && (
              <SectionCard
                title="수급/소비 계획"
                description="계정에 추가할 계획을 선택해주세요. 선택하지 않은 계획은 저장할 때 이 브라우저에서 삭제해요."
              >
                <div className="space-y-3">
                  {envelope.data.records.map((record) => {
                    const exact = accountRecordFingerprints.has(guestPyroxeneRecordFingerprint(record));
                    const attendanceConflict =
                      record.kind === "attendance" && account.records.some((item) => item.source === "attendance");
                    return (
                      <ImportCheckbox
                        key={record.recordId}
                        checked={selection.recordIds.includes(record.recordId)}
                        onChange={(checked) =>
                          setSelection({
                            ...selection,
                            recordIds: toggleList(selection.recordIds, record.recordId, checked),
                          })
                        }
                        title={describeRecord(record)}
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

            {envelope.data.optionsChanged && (
              <SectionCard title="플래너 설정" description="앞으로 사용할 설정을 선택해주세요.">
                <ImportSourceComparison
                  name="options"
                  selected={selection.options ? "guest" : "account"}
                  onChange={(source) => setSelection({ ...selection, options: source === "guest" })}
                  guest={<PlannerOptionsSummary options={envelope.data.options} />}
                  account={<PlannerOptionsSummary options={account.options} />}
                />
              </SectionCard>
            )}

            {(envelope.data.favoriteStudents.length > 0 || Object.keys(envelope.data.eventTrials).length > 0) && (
              <SectionCard title="관심 학생과 모집 설정" description="계정에 없는 항목은 기본으로 선택했어요.">
                <div className="space-y-3">
                  {envelope.data.favoriteStudents.map((favorite) => {
                    const key = favoriteKey(favorite);
                    const checked = selection.favorites.some((item) => favoriteKey(item) === key);
                    const existsInAccount = accountFavoriteKeys.has(key);
                    return (
                      <ImportCheckbox
                        key={key}
                        checked={checked}
                        onChange={(next) =>
                          setSelection({
                            ...selection,
                            favorites: next
                              ? [...selection.favorites, favorite]
                              : selection.favorites.filter((item) => favoriteKey(item) !== key),
                          })
                        }
                        title={contentLabels.favoriteNames.get(key) ?? "관심 학생"}
                        description={
                          existsInAccount ? "이미 계정의 관심 학생으로 저장되어 있어요." : "계정의 관심 학생에 추가"
                        }
                      />
                    );
                  })}
                  {Object.keys(envelope.data.eventTrials).map((eventUid) => (
                    <ImportCheckbox
                      key={eventUid}
                      checked={selection.eventUids.includes(eventUid)}
                      onChange={(checked) =>
                        setSelection({ ...selection, eventUids: toggleList(selection.eventUids, eventUid, checked) })
                      }
                      title={`${contentLabels.eventNames.get(eventUid) ?? "모집"} · ${envelope.data.eventTrials[eventUid]}회`}
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

            {envelope.data.collectedSourceKeys.length > 0 && (
              <SectionCard title="수령한 보상" description="계정에 없는 기록은 기본으로 선택했어요.">
                <div className="space-y-3">
                  {sourceGroups.missing.length > 0 && (
                    <ImportCheckbox
                      checked={sourceGroups.missing.every((key) => selection.sourceKeys.includes(key))}
                      onChange={(checked) =>
                        setSelection({
                          ...selection,
                          sourceKeys: toggleGroup(selection.sourceKeys, sourceGroups.missing, checked),
                        })
                      }
                      title={`새로 가져올 수령 기록 ${sourceGroups.missing.length}건`}
                      description="계정의 수령 기록에 추가"
                    />
                  )}
                  {sourceGroups.existing.length > 0 && (
                    <ImportCheckbox
                      checked={sourceGroups.existing.every((key) => selection.sourceKeys.includes(key))}
                      onChange={(checked) =>
                        setSelection({
                          ...selection,
                          sourceKeys: toggleGroup(selection.sourceKeys, sourceGroups.existing, checked),
                        })
                      }
                      title={`계정에 이미 저장된 수령 기록 ${sourceGroups.existing.length}건`}
                      description="이미 계정에 저장되어 있어요."
                    />
                  )}
                </div>
              </SectionCard>
            )}

            {maintenanceMessage ? (
              <Callout tone="warning" title={maintenanceMessage} />
            ) : importResult ? (
              <Callout
                tone={importResult.failedLabels.length ? "warning" : "success"}
                Icon={CheckCircleIcon}
                title={
                  importResult.failedLabels.length
                    ? "일부 항목을 가져오지 못했어요"
                    : submittedDiscardedCount > 0
                      ? "선택한 내용을 저장했어요"
                      : "선택한 항목을 가져왔어요"
                }
                description={
                  importResult.failedLabels.length
                    ? `${importResult.failedLabels.join(", ")}은 이 브라우저에 남겨뒀어요. 다시 시도할 수 있어요.${submittedDiscardedCount > 0 ? ` 선택하지 않은 항목 ${submittedDiscardedCount}개는 삭제했어요.` : ""}`
                    : submittedDiscardedCount > 0
                      ? importedCount > 0
                        ? `선택한 항목은 계정에 가져오고, 선택하지 않은 항목 ${submittedDiscardedCount}개는 이 브라우저에서 삭제했어요.`
                        : `선택하지 않은 항목 ${submittedDiscardedCount}개를 이 브라우저에서 삭제했어요.`
                      : "가져온 항목만 이 브라우저에서 정리했어요."
                }
              />
            ) : null}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedCount}개 항목 선택
                {discardedCount > 0 && ` · 삭제할 항목 ${discardedCount}개`}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button text="플래너로 돌아가기" to="/utils/pyroxene" variant="secondary" />
                <Button
                  variant="primary"
                  disabled={(selectedCount === 0 && discardedCount === 0) || isSubmitting}
                  onClick={() => {
                    submittedEnvelope.current = envelope;
                    submittedDiscardedItems.current = discardedItems;
                    fetcher.submit({ envelope, selection }, { method: "POST", encType: "application/json" });
                  }}
                >
                  {isSubmitting && <ArrowPathIcon className="size-4 animate-spin" />}
                  {isSubmitting ? "저장하는 중..." : "선택 내용 저장"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

const IMPORT_SOURCE_LABELS = {
  guest: "비로그인 시 등록한 값",
  account: "계정에 저장된 값",
} as const;

function ImportSourceComparison({
  name,
  selected,
  onChange,
  guest,
  account,
}: {
  name: string;
  selected: "guest" | "account";
  onChange: (source: "guest" | "account") => void;
  guest: ReactNode;
  account: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{name === "resources" ? "현재 보유 재화" : "플래너 설정"} 선택</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <ImportSourceOption
          name={name}
          source="guest"
          selected={selected === "guest"}
          onSelect={() => onChange("guest")}
        >
          {guest}
        </ImportSourceOption>
        <ImportSourceOption
          name={name}
          source="account"
          selected={selected === "account"}
          onSelect={() => onChange("account")}
        >
          {account}
        </ImportSourceOption>
      </div>
    </fieldset>
  );
}

function ImportSourceOption({
  name,
  source,
  selected,
  onSelect,
  children,
}: {
  name: string;
  source: keyof typeof IMPORT_SOURCE_LABELS;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const label = IMPORT_SOURCE_LABELS[source];
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <span className="flex items-center gap-2 font-medium text-foreground">
        <input
          type="radio"
          name={`pyroxene-import-${name}`}
          value={source}
          checked={selected}
          onChange={onSelect}
          className="size-4 border-input text-primary focus:ring-2 focus:ring-ring/30"
        />
        {label}
      </span>
      {children}
    </label>
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
  const pickupChanceLabels: Record<PyroxenePlannerOptions["event"]["pickupChance"], string> = {
    average: "평균 (천장 미반영)",
    average_pity: "평균 (천장 반영)",
    ceil: "천장",
  };
  const raidTierLabels: Record<PyroxenePlannerOptions["raid"]["tier"], string> = {
    platinum: "플래티넘",
    gold: "골드",
    silver: "실버",
    bronze: "브론즈",
  };
  const tacticalLevelLabels: Record<PyroxenePlannerOptions["tactical"]["level"], string> = {
    in10: "10위 내",
    in100: "100위 내",
    in200: "200위 내",
    over200: "200위 밖",
  };

  return (
    <span className="space-y-1 text-sm">
      <span className="block font-medium text-foreground">
        모집 목표 · {pickupChanceLabels[options.event.pickupChance]}
      </span>
      <span className="block text-muted-foreground">
        총력전 {raidTierLabels[options.raid.tier]} · 전술대회 {tacticalLevelLabels[options.tactical.level]}
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
