import { DocumentArrowDownIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import {
  type ActionFunctionArgs,
  Link,
  type LoaderFunctionArgs,
  type MetaFunction,
  redirect,
  data as routeData,
  useFetcher,
  useLoaderData,
  useParams,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { PageActionBar, PageHeader, PageMain, useV2Page, V2Page } from "~/components/v2/layout";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Checkbox } from "~/components/v2/primitives/Checkbox";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import {
  createRecruitmentResultStudentsFromPickupHistory,
  getRecruitmentResultTier3CountFromPickupHistory,
  getRecruitmentResultTrialFromPickupHistory,
  isRecordedRecruitmentResult,
  mergeEditableRecruitmentResultStudents,
  resolveRecruitmentResultStudents,
} from "~/domain/recruitment-result";
import { compareInstantAsc, compareInstantDesc, isInstantBefore, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { cn } from "~/lib/utils";
import type { PickupHistory } from "~/models/pickup-history";
import { getPickupHistory } from "~/models/pickup-history.server";
import { getAllHistoricalRecruitmentGroups, getRecruitmentGroupByUid } from "~/models/recruitment";
import {
  getRecruitmentResult,
  getRecruitmentResultComment,
  getRecruitmentResults,
  upsertRecruitmentResult,
} from "~/models/recruitment-result.server";
import { getAllStudents } from "~/models/student";
import {
  getTimelineContentsByRecruitmentGroupUids,
  groupTimelineContentsByRecruitmentGroupUid,
} from "~/models/timeline-content.server";
import PickupEventPicker, { type PickupEventOption } from "./$username.pickups._components/PickupEventPicker";
import PickupHistoryImporter from "./$username.pickups._components/PickupHistoryImporter";
import PickupStudentPicker, { FieldError } from "./$username.pickups._components/PickupStudentPicker";
import { DELETE_FAILED, SAVE_FAILED, textareaClassName } from "./$username.pickups._components/pickup-record";
import {
  getPickupRecordIssues,
  type PickupRecordField,
} from "./$username.pickups._components/pickup-record-validation";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.currentPickupHistory ? "모집 기록 편집" : "모집 기록 추가"} | 몰루로그` },
];

function isPickupRecruitmentStudent<
  T extends {
    pickup: boolean;
    recruitmentType?: string | null;
    student: { uid: string } | null;
  },
>(recruitment: T): recruitment is T & { student: NonNullable<T["student"]> } {
  return recruitment.pickup && recruitment.recruitmentType !== "given" && recruitment.student !== null;
}

function canExchangeRecruitmentStudent<
  T extends {
    pickup: boolean;
    recruitmentType?: string | null;
    student: { uid: string } | null;
  },
>(recruitment: T): recruitment is T & { student: NonNullable<T["student"]> } {
  return isPickupRecruitmentStudent(recruitment);
}

type EditablePickupHistory = Omit<PickupHistory, "result"> & {
  result: {
    trial: number | null;
    tier3Count: number;
    tier3StudentIds: string[];
  }[];
  comment?: string | null;
  exchangedStudentIds?: string[];
};

function getRouteUsername(params: { username?: string }) {
  const usernameParam = params.username;
  if (!usernameParam?.startsWith("@")) {
    throw new Response("Not Found", { status: 404 });
  }

  return usernameParam.replace("@", "");
}

function redirectToCanonicalEditor(params: { id?: string }) {
  return redirect(`/my?path=pickups/edit/${params.id ?? "new"}`);
}

export function getVisibleTier3StudentUids(studentUids: string[], tier3Count?: number) {
  if (tier3Count === undefined) {
    return studentUids;
  }

  return studentUids.slice(0, Math.max(0, tier3Count));
}

export function shouldSkipTier3StudentListInitially(tier3Count?: number, tier3StudentUids: string[] = []) {
  return (tier3Count ?? 0) > 0 && tier3StudentUids.length === 0;
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  if (getRouteUsername(params) !== sensei.username) {
    return redirectToCanonicalEditor(params);
  }

  let currentPickupHistory: EditablePickupHistory | null = null;
  let currentRecruitmentResult: Awaited<ReturnType<typeof getRecruitmentResult>> = null;
  let currentRecruitmentResultComment: string | null = null;
  if (params.id && params.id !== "new") {
    currentRecruitmentResult = await getRecruitmentResult(env, sensei.id, params.id);
    currentRecruitmentResultComment = currentRecruitmentResult
      ? await getRecruitmentResultComment(env, sensei.id, currentRecruitmentResult.commentPostUid)
      : null;
  }

  const now = nowUtcIso();

  const [allGroups, allStudentsList, allRecruitmentResults] = await Promise.all([
    getAllHistoricalRecruitmentGroups(env),
    getAllStudents(env),
    getRecruitmentResults(env, sensei.id),
  ]);
  // Saving a record for a recruitment that already has one overwrites it, so the form warns about those.
  const existingRecordUids: Record<string, string> = {};
  for (const result of allRecruitmentResults) {
    if (isRecordedRecruitmentResult(result) && result.uid !== params.id) {
      existingRecordUids[result.recruitmentGroupUid] = result.uid;
    }
  }
  const pickupGroups = allGroups.filter(
    (g) => g.recruitments.some((r) => r.pickup && r.student) && isInstantBefore(g.startAt, now),
  );
  const timelineContents = await getTimelineContentsByRecruitmentGroupUids(
    publicReadEnv,
    pickupGroups.map((group) => group.uid),
    { ctx },
  );
  const timelineContentsByGroupUid = groupTimelineContentsByRecruitmentGroupUid(timelineContents);
  const allStudentsMap = Object.fromEntries(allStudentsList.map((student) => [student.uid, student] as const));

  const missingTimelineGroupUids = pickupGroups
    .filter((group) => !timelineContentsByGroupUid.has(group.uid))
    .map((group) => group.uid);
  if (missingTimelineGroupUids.length > 0) {
    throw routeError(500, "pickup_history.timeline_content_missing", "모집 기록 정보를 불러오지 못했어요", {
      recruitmentGroupUids: missingTimelineGroupUids,
    });
  }

  const events = pickupGroups.map((group) => {
    // A group can be shared by more than one event (e.g. a rerun and its permanent
    // counterpart); this screen treats the whole group as one option, labeled with every
    // event's name joined by "/".
    const groupTimelineContents = [...(timelineContentsByGroupUid.get(group.uid) ?? [])].sort((a, b) =>
      compareInstantAsc(a.startAt, b.startAt),
    );
    if (groupTimelineContents.length === 0) {
      throw new Error(`timeline content is missing for recruitment group: ${group.uid}`);
    }

    return {
      uid: group.uid,
      logoContentUid: groupTimelineContents[0].contentUid ?? null,
      type: group.recruitmentType ?? "pickup",
      name: groupTimelineContents.map((content) => content.name).join(" / "),
      since: toUtcIso(group.startAt),
      until: group.endAt ? toUtcIso(group.endAt) : null,
      isSpoiler: groupTimelineContents.some((content) => content.isSpoiler),
      recruitments: group.recruitments
        .filter((r) => r.pickup && r.student)
        .map((r) => ({
          student: r.student ? { uid: r.student.uid, name: r.student.name ?? "" } : null,
          pickup: r.pickup,
          recruitmentType: r.recruitmentType,
        })),
    };
  });

  events.sort((a, b) => compareInstantDesc(a.since, b.since));

  if (params.id && params.id !== "new") {
    if (currentRecruitmentResult) {
      const recruitmentGroup = allGroups.find((group) => group.uid === currentRecruitmentResult.recruitmentGroupUid);
      const tier3StudentIds = resolveRecruitmentResultStudents(currentRecruitmentResult.recruitedStudents, {
        allStudentsMap,
        group: recruitmentGroup,
      })
        .filter((student) => student.tier === 3)
        .map((student) => student.uid);
      currentPickupHistory = {
        uid: currentRecruitmentResult.uid,
        userId: currentRecruitmentResult.userId,
        eventId: currentRecruitmentResult.recruitmentGroupUid,
        result: [
          {
            trial: currentRecruitmentResult.trial,
            tier3Count: currentRecruitmentResult.tier3Count ?? tier3StudentIds.length,
            tier3StudentIds,
          },
        ],
        rawResult: currentRecruitmentResult.rawResult,
        comment: currentRecruitmentResultComment,
        exchangedStudentIds: currentRecruitmentResult.exchangedStudents.map((student) => student.studentUid),
      };
    } else {
      currentPickupHistory = await getPickupHistory(env, sensei.id, params.id, true);
    }
  }

  return {
    username: sensei.username,
    events,
    existingRecordUids,
    tier3Students: allStudentsList
      .filter((student) => student.initialTier === 3)
      .sort((a, b) => b.order - a.order)
      .map((student) => ({ uid: student.uid, name: student.name })),
    currentPickupHistory,
  };
};

type ActionData = {
  eventUid: string;
  result: PickupHistory["result"];
  exchangedStudentIds?: string[];
  rawResult?: string;
  comment?: string | null;
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  if (getRouteUsername(params) !== sensei.username) {
    return redirectToCanonicalEditor(params);
  }

  const data = await request.json<ActionData>();
  const recruitmentGroup = await getRecruitmentGroupByUid(env, data.eventUid);
  if (!recruitmentGroup) {
    throw routeError(400, "pickup_history.recruitment_group_missing", "모집 이벤트를 찾을 수 없어요", {
      recruitmentGroupUid: data.eventUid,
    });
  }
  // When the group is shared by multiple events, default to the earliest one as the
  // representative content (e.g. for community post linking). See TODO in project notes:
  // this policy isn't user-facing yet.
  const groupTimelineContents = (
    await getTimelineContentsByRecruitmentGroupUids(publicReadEnv, [data.eventUid], { ctx })
  ).sort((a, b) => compareInstantAsc(a.startAt, b.startAt));
  const timelineContent = groupTimelineContents[0];
  const exchangeableStudentMap = new Map(
    recruitmentGroup.recruitments.flatMap((recruitment) => {
      if (!canExchangeRecruitmentStudent(recruitment)) {
        return [];
      }
      return [[recruitment.student.uid, recruitment.student] as const];
    }),
  );
  const exchangedStudents = (data.exchangedStudentIds ?? []).map((studentUid) => {
    const student = exchangeableStudentMap.get(studentUid);
    if (!student) {
      throw routeError(400, "pickup_history.exchange_student_invalid", "모집 포인트 교환 학생을 확인할 수 없어요", {
        recruitmentGroupUid: data.eventUid,
        studentUid,
      });
    }

    return {
      studentUid,
      tier: student.initialTier,
      pickup: true,
    };
  });
  const trial = getRecruitmentResultTrialFromPickupHistory({ result: data.result });
  const exchangeCountLimit = Math.floor((trial ?? 0) / 200);
  if (exchangedStudents.length > exchangeCountLimit) {
    throw routeError(
      400,
      "pickup_history.exchange_student_count_invalid",
      "모집 포인트 교환 학생 수가 모집 횟수와 맞지 않아요",
      {
        trial,
        exchangedStudentCount: exchangedStudents.length,
        exchangeCountLimit,
      },
    );
  }

  const pickupStudentUids = new Set(
    recruitmentGroup.recruitments.flatMap((recruitment) =>
      isPickupRecruitmentStudent(recruitment) ? [recruitment.student.uid] : [],
    ),
  );
  const groupStudentInitialTiers = Object.fromEntries(
    recruitmentGroup.recruitments.flatMap((recruitment) =>
      recruitment.student ? [[recruitment.student.uid, recruitment.student.initialTier] as const] : [],
    ),
  );
  const existingRecruitmentResult =
    params.id && params.id !== "new" ? await getRecruitmentResult(env, sensei.id, params.id) : null;
  const recruitedStudents = existingRecruitmentResult
    ? mergeEditableRecruitmentResultStudents({
        existingStudents: existingRecruitmentResult.recruitedStudents,
        history: { result: data.result },
        lookup: { group: recruitmentGroup },
        pickupStudentUids,
        studentInitialTiers: groupStudentInitialTiers,
      })
    : createRecruitmentResultStudentsFromPickupHistory(
        { result: data.result },
        pickupStudentUids,
        groupStudentInitialTiers,
      );
  const tier3Count = getRecruitmentResultTier3CountFromPickupHistory({ result: data.result });

  try {
    await upsertRecruitmentResult(env, sensei.id, {
      uid: params.id && params.id !== "new" ? params.id : undefined,
      recruitmentGroupUid: data.eventUid,
      contentUid: timelineContent?.uid ?? null,
      completedAt: nowUtcIso(),
      recruitedStudents,
      exchangedStudents,
      tier3Count,
      trial,
      rawResult: data.rawResult ?? null,
      comment: data.comment ?? null,
    });
  } catch (error) {
    // The save bar names the failure and keeps the typed values, so the action answers with data instead of the 500 page.
    getLogger(env, ctx, { route: "$username.pickups.edit" }).error("Recruitment result save failed", error, {
      recruitmentGroupUid: data.eventUid,
    });
    return routeData({ error: SAVE_FAILED }, { status: 500 });
  }
  return redirect("/my?path=pickups");
};

export function ErrorBoundary() {
  const params = useParams();
  const revalidator = useRevalidator();
  return (
    <V2Page width="reading">
      <PageHeader
        back={{ title: "모집 기록", to: `/${params.username ?? ""}/pickups` }}
        title="모집 기록"
        titleHidden
      />
      <PageMain>
        <div role="alert" className="rounded-lg bg-v2-surface px-v2-block-p py-10 text-center">
          <p className="text-base font-semibold text-v2-fg">이 모집 기록을 불러오지 못했어요</p>
          <p className="mt-1 text-sm text-v2-fg-tertiary">잠시 후 다시 시도해주세요.</p>
          <Button className="mt-3" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>
            다시 시도
          </Button>
        </div>
      </PageMain>
    </V2Page>
  );
}

export default function EditPickup() {
  const { username, currentPickupHistory } = useLoaderData<typeof loader>();
  const isEditing = currentPickupHistory !== null;

  return (
    <V2Page width="reading">
      <PageHeader
        back={{ title: "모집 기록", to: `/@${username}/pickups` }}
        title={isEditing ? "모집 기록 편집" : "모집 기록 추가"}
      />
      <PageMain>
        <EditPickupForm />
      </PageMain>
    </V2Page>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-base leading-[1.4] font-semibold text-v2-fg">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-v2-fg-tertiary">{description}</p> : null}
    </div>
  );
}

function EditPickupForm() {
  const { username, events, tier3Students, currentPickupHistory, existingRecordUids } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const { stacked } = useV2Page();
  const isEditing = currentPickupHistory !== null;

  let initialEventUid: string | null = null;
  if (currentPickupHistory) {
    initialEventUid = currentPickupHistory.eventId;
  } else {
    initialEventUid = searchParams.get("eventId");
  }

  let initialTotalCount: number | undefined;
  let initialTier3Count: number | undefined;
  let initialTier3StudentUids: string[] | undefined;
  if (currentPickupHistory?.result) {
    const recordedTrials = currentPickupHistory.result
      .map((trial) => trial.trial)
      .filter((trial): trial is number => trial !== null);
    initialTotalCount = recordedTrials.length > 0 ? Math.max(...recordedTrials) : undefined;
    for (const trial of currentPickupHistory.result) {
      initialTier3Count = (initialTier3Count ?? 0) + trial.tier3Count;
      initialTier3StudentUids = (initialTier3StudentUids ?? ([] as string[])).concat(trial.tier3StudentIds);
    }
  }

  const initialEvent = initialEventUid ? events.find((event) => event.uid === initialEventUid) : null;
  const [eventUid, setEventUid] = useState<string | null>(isEditing ? initialEventUid : (initialEvent?.uid ?? null));
  const selectedEvent = eventUid ? events.find((event) => event.uid === eventUid) : null;
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [tier3Count, setTier3Count] = useState(initialTier3Count);
  const [tier3StudentUids, setTier3StudentUids] = useState(initialTier3StudentUids ?? []);
  const [skipTier3StudentList, setSkipTier3StudentList] = useState(
    shouldSkipTier3StudentListInitially(initialTier3Count, initialTier3StudentUids),
  );
  const [exchangedStudentUids, setExchangedStudentUids] = useState(currentPickupHistory?.exchangedStudentIds ?? []);
  const [touched, setTouched] = useState<Partial<Record<PickupRecordField, boolean>>>({});
  const [showImporter, setShowImporter] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [comment, setComment] = useState(currentPickupHistory?.comment ?? "");

  const saveFetcher = useFetcher<{ error?: string }>();
  const deleteFetcher = useFetcher<{ error?: string }>();
  const saving = saveFetcher.state !== "idle";
  const deleting = deleteFetcher.state !== "idle";
  const saveFailed = !saving && saveFetcher.data?.error === SAVE_FAILED;
  const deleteFailed = !deleting && deleteFetcher.data?.error === DELETE_FAILED;

  const visibleTier3StudentUids = getVisibleTier3StudentUids(tier3StudentUids, tier3Count);
  const submittedTier3StudentUids = skipTier3StudentList ? [] : visibleTier3StudentUids;
  const issues = getPickupRecordIssues({
    eventUid,
    totalCount,
    tier3Count,
    tier3StudentCount: submittedTier3StudentUids.length,
    skipTier3StudentList,
    exchangedStudentCount: exchangedStudentUids.length,
  });

  // An issue shows under its field once the user has worked on that field, or as soon as it contradicts what was
  // entered. A field that is only still empty is left to the save bar, so an untouched form does not start red.
  const isEmptyRequirement = (issue: { field: PickupRecordField; message: string }) =>
    issue.field === "event" ||
    (issue.field === "totalCount" && totalCount === undefined) ||
    (issue.field === "totalCount" && totalCount !== undefined && totalCount <= 0 && !touched.totalCount) ||
    (issue.field === "tier3Count" && tier3Count === undefined) ||
    (issue.field === "tier3Students" && submittedTier3StudentUids.length === 0);
  const inlineIssues = issues.filter((issue) =>
    isEmptyRequirement(issue) ? touched[issue.field] === true && issue.field !== "event" : true,
  );
  const inlineMessage = (field: PickupRecordField) => inlineIssues.find((issue) => issue.field === field)?.message;

  const existingRecordUid = !isEditing && eventUid ? existingRecordUids[eventUid] : undefined;
  const exchangeCountLimit = Math.floor((totalCount ?? 0) / 200);
  const exchangeableStudents =
    selectedEvent?.recruitments.flatMap((recruitment) =>
      canExchangeRecruitmentStudent(recruitment) && recruitment.student ? [recruitment.student] : [],
    ) ?? [];
  const pickupUids = new Set(
    selectedEvent?.recruitments.flatMap((recruitment) =>
      isPickupRecruitmentStudent(recruitment) ? [recruitment.student.uid] : [],
    ) ?? [],
  );

  const handleTotalCountChange = (value?: number) => {
    setTotalCount(value);
    const limit = Math.floor((value ?? 0) / 200);
    if (exchangedStudentUids.length > limit) {
      setExchangedStudentUids((prev) => prev.slice(0, limit));
    }
  };

  const handleSave = () => {
    if (issues.length > 0 || !eventUid || totalCount === undefined || tier3Count === undefined) {
      return;
    }
    const payload: ActionData = {
      eventUid,
      result: [{ trial: totalCount, tier3Count, tier3StudentIds: submittedTier3StudentUids }],
      exchangedStudentIds: exchangedStudentUids,
      comment: comment.trim() || null,
    };
    saveFetcher.submit(payload, { method: "post", encType: "application/json" });
  };

  const handleDelete = () => {
    if (!currentPickupHistory) return;
    setDeleteOpen(false);
    deleteFetcher.submit(
      { uid: currentPickupHistory.uid },
      { method: "delete", action: `/@${username}/pickups?index` },
    );
  };

  let barMessage: string;
  let barTone: "danger" | "neutral" = "neutral";
  if (saveFailed) {
    barMessage = "모집 결과를 저장하지 못했어요. 입력한 값은 그대로 있어요. 다시 시도해주세요.";
    barTone = "danger";
  } else if (deleteFailed) {
    barMessage = "모집 기록을 삭제하지 못했어요. 다시 시도해주세요.";
    barTone = "danger";
  } else if (saving) {
    barMessage = "저장하는 중이에요…";
  } else if (inlineIssues.length > 0) {
    barMessage = `확인할 입력값이 ${inlineIssues.length}개 있어요.`;
    barTone = "danger";
  } else if (issues.length > 0) {
    barMessage = issues[0].message;
  } else {
    barMessage = "저장하면 ★3 학생과 교환 학생이 모집한 학생에 추가돼요.";
  }

  return (
    <div className={cn("flex flex-col gap-v2-block-gap", stacked && "pb-24")}>
      <div className="flex flex-col divide-y divide-v2-divider rounded-lg bg-v2-surface">
        <section className="flex flex-col gap-3 p-v2-block-p">
          <SectionHeading title="모집 이벤트" description="모집을 진행한 이벤트를 선택해주세요." />
          {isEditing && !initialEvent ? (
            <StatusNotice tone="danger">모집 이벤트 정보를 불러오지 못했어요.</StatusNotice>
          ) : (
            <PickupEventPicker
              events={events as PickupEventOption[]}
              value={eventUid}
              locked={isEditing}
              onSelect={(uid) => {
                setEventUid(uid);
                setExchangedStudentUids([]);
              }}
            />
          )}
          {existingRecordUid ? (
            <StatusNotice
              tone="warning"
              boxed
              action={
                <Link
                  to={`/@${username}/pickups/edit/${existingRecordUid}`}
                  className={v2ButtonClassName({ variant: "secondary", size: "sm" })}
                >
                  기존 기록 불러오기
                </Link>
              }
            >
              <p className="font-semibold">이 모집에는 이미 모집 기록이 있어요.</p>
              <p className="text-v2-fg-secondary">
                저장하면 기존 기록을 덮어써요. 기존 기록을 불러와서 고칠 수도 있어요.
              </p>
            </StatusNotice>
          ) : null}
        </section>

        <section className="flex flex-col gap-v2-group-gap p-v2-block-p">
          <div className="flex items-start justify-between gap-3">
            <SectionHeading
              title="모집 결과"
              description="총 모집 횟수와 획득한 ★3 학생, 모집 포인트 교환 학생을 입력해주세요."
            />
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => setShowImporter((prev) => !prev)}
              aria-expanded={showImporter}
            >
              <DocumentArrowDownIcon className="size-4" aria-hidden="true" />
              외부 데이터 가져오기
            </Button>
          </div>
          {showImporter ? (
            <PickupHistoryImporter
              tier3Students={tier3Students}
              onClose={() => setShowImporter(false)}
              onImport={({ totalCount: importedTotal, tier3Count: importedTier3, tier3StudentIds }) => {
                handleTotalCountChange(importedTotal);
                setTier3Count(importedTier3);
                setTier3StudentUids(tier3StudentIds);
                setSkipTier3StudentList(false);
                setTouched((prev) => ({ ...prev, totalCount: true, tier3Count: true }));
              }}
            />
          ) : null}

          <div className="max-w-sm">
            <div className="grid grid-cols-2">
              <label htmlFor="pickup-total-count" className="text-sm font-semibold text-v2-fg">
                총 모집 횟수
              </label>
              <label htmlFor="pickup-tier3-count" className="pl-3 text-sm font-semibold text-v2-fg">
                모집한 ★3 횟수
              </label>
            </div>
            <div className="mt-1.5 grid grid-cols-2 divide-x divide-v2-control-border overflow-hidden rounded-md border border-v2-control-border bg-v2-surface focus-within:border-v2-control-border-strong">
              <CountField
                id="pickup-total-count"
                value={totalCount}
                invalid={Boolean(inlineMessage("totalCount"))}
                onChange={handleTotalCountChange}
                onBlur={() => setTouched((prev) => ({ ...prev, totalCount: true }))}
              />
              <CountField
                id="pickup-tier3-count"
                value={tier3Count}
                invalid={Boolean(inlineMessage("tier3Count"))}
                onChange={setTier3Count}
                onBlur={() => setTouched((prev) => ({ ...prev, tier3Count: true }))}
              />
            </div>
            {inlineMessage("totalCount") ? <FieldError>{inlineMessage("totalCount")}</FieldError> : null}
            {inlineMessage("tier3Count") ? <FieldError>{inlineMessage("tier3Count")}</FieldError> : null}
          </div>

          <PickupStudentPicker
            label="모집한 ★3 학생"
            options={tier3Students}
            pickupUids={pickupUids}
            selectedUids={visibleTier3StudentUids}
            maxCount={tier3Count}
            onChange={(uids) => {
              setTier3StudentUids(uids);
              setTouched((prev) => ({ ...prev, tier3Students: true }));
            }}
            blockedReason={tier3Count === undefined ? "총 모집 횟수와 ★3 횟수를 먼저 입력해주세요." : undefined}
            hideSelection={skipTier3StudentList}
            error={inlineMessage("tier3Students")}
            footer={
              tier3Count !== undefined && tier3Count > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-v2-fg-tertiary">
                  {skipTier3StudentList ? null : (
                    <span className="tabular-nums">{submittedTier3StudentUids.length}명 선택됨</span>
                  )}
                  <Checkbox
                    id="pickup-skip-tier3"
                    checked={skipTier3StudentList}
                    onCheckedChange={setSkipTier3StudentList}
                  >
                    선택하지 않기
                  </Checkbox>
                </div>
              ) : null
            }
          />

          {exchangeCountLimit > 0 || totalCount === undefined || totalCount <= 0 ? (
            <PickupStudentPicker
              label="모집 포인트 교환 학생"
              description={
                exchangeCountLimit > 0 && selectedEvent && totalCount !== undefined
                  ? `${totalCount.toLocaleString("ko-KR")}회 모집 기준 최대 ${exchangeCountLimit}명까지 선택할 수 있어요.`
                  : undefined
              }
              options={exchangeableStudents}
              selectedUids={exchangedStudentUids}
              maxCount={exchangeCountLimit}
              onChange={setExchangedStudentUids}
              blockedReason={
                totalCount === undefined || totalCount <= 0
                  ? "총 모집 횟수를 입력하면 선택할 수 있어요."
                  : selectedEvent
                    ? undefined
                    : "모집 이벤트를 먼저 선택해주세요."
              }
              error={inlineMessage("exchangedStudents")}
            />
          ) : null}
        </section>

        <section className="flex flex-col gap-2 p-v2-block-p">
          <SectionHeading title="모집 결과 의견" description="입력하지 않아도 저장할 수 있어요." />
          <textarea
            aria-label="모집 결과 의견"
            value={comment}
            rows={4}
            placeholder="남긴 의견은 다른 사람에게 공개돼요."
            onChange={(event) => setComment(event.currentTarget.value)}
            className={textareaClassName}
          />
        </section>
      </div>

      <PageActionBar
        placement={stacked ? "fixed" : "sticky"}
        expandActions={stacked}
        className={stacked ? "px-4 lg:px-v2-block-p" : undefined}
        summary={
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {isEditing ? (
              <Button
                variant="danger-subtle"
                size="sm"
                disabled={deleting || saving}
                onClick={() => setDeleteOpen(true)}
              >
                삭제
              </Button>
            ) : null}
            <span
              role={barTone === "danger" ? "alert" : "status"}
              className={cn(
                "min-w-0 text-xs font-normal",
                barTone === "danger" ? "text-v2-danger" : "text-v2-fg-secondary",
              )}
            >
              {barMessage}
            </span>
          </div>
        }
      >
        <Button
          variant="primary"
          disabled={(issues.length > 0 && !saveFailed) || saving || deleting}
          onClick={handleSave}
        >
          {saving ? "저장 중…" : saveFailed ? "다시 시도" : "모집 결과 저장"}
        </Button>
      </PageActionBar>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="정말로 이 모집 기록을 삭제할까요?"
        size="sm"
      >
        <p className="text-sm text-v2-fg-secondary">
          남긴 의견도 함께 삭제돼요. 모집한 학생에 추가된 학생은 그대로 남아요.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDeleteOpen(false)}>취소</Button>
          <Button variant="danger" onClick={handleDelete}>
            삭제
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function CountField({
  id,
  value,
  invalid,
  onChange,
  onBlur,
}: {
  id: string;
  value: number | undefined;
  invalid: boolean;
  onChange: (value?: number) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center pr-3">
      <NumberInput
        id={id}
        min={0}
        value={value?.toString() ?? ""}
        aria-invalid={invalid || undefined}
        placeholder="0"
        onChange={(event) => {
          const next = Number.parseInt(event.currentTarget.value, 10);
          onChange(Number.isNaN(next) ? undefined : next);
        }}
        onBlur={onBlur}
        className={cn("min-h-9 rounded-none border-0 bg-transparent text-right", invalid && "bg-v2-danger-subtle")}
      />
      <span className="shrink-0 pl-1 text-xs text-v2-fg-tertiary">회</span>
    </div>
  );
}
