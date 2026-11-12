import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RecruitmentHistoryList } from "~/components/v2/features/students/RecruitmentHistoryList";
import { StudentPreparingState } from "~/components/v2/features/students/StudentPreparingState";
import { StudentStatisticsState } from "~/components/v2/features/raids/StudentStatisticsState";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { validateStudentEquipmentLevels } from "~/domain/student-calculator";
import {
  isStaleStudentStateRequestError,
  STUDENT_STATE_STALE_CODE,
  STUDENT_STATE_STALE_MESSAGE,
} from "~/domain/student-state-errors";
import { isActionValidationError } from "~/lib/action-errors";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { toUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { fetchRaidStatisticsByStudent, type RaidStatistics } from "~/lib/ranks/stats";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudents, type RecruitedStudentCurrentStateInput } from "~/models/recruited-student";
import { getRelationshipLevels, getStudentStateWriteMode } from "~/models/relationship-level";
import { getStudentDetailData } from "~/models/student";
import { saveStudentBasicInfo } from "~/models/student-basic-info";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading.server";
import { getTagCountsByStudent } from "~/models/student-grading-tag.server";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import { getStudentDetailContent } from "~/views/student-detail-content.server";
import { getStudentRelevantTimelineContents } from "./students.$id";
import StudentAiSummaryCard from "./students.$id._components/StudentAiSummaryCard";
import StudentBasicInfo from "./students.$id._components/StudentBasicInfo";
import StudentGradingChart from "./students.$id._components/StudentGradingChart";
import { StudentKnowledgePopoverProvider } from "./students.$id._components/StudentKnowledgeAnnotations";
import StudentRaidUsageChart from "./students.$id._components/StudentRaidUsageChart";

const currentStateFieldKeys = [
  "level",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equip1Level",
  "equip2Level",
  "equip3Level",
  "equipSpecial",
  "weaponLevel",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
] as const satisfies (keyof RecruitedStudentCurrentStateInput)[];

type StudentBasicInfoActionData =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?: string;
      retryable?: boolean;
    };

function parseNullableInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  throw new Error("숫자 형식이 올바르지 않아요");
}

export function toStudentBasicInfoCurrentStateInput(
  payload: Record<string, unknown>,
): Partial<RecruitedStudentCurrentStateInput> {
  return currentStateFieldKeys.reduce((result, field) => {
    if (!Object.hasOwn(payload, field)) {
      return result;
    }
    result[field] = parseNullableInteger(payload[field]);
    return result;
  }, {} as RecruitedStudentCurrentStateInput);
}

function parseRelatedBonds(value: unknown): Record<string, number> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("다른 의상 인연 정보가 올바르지 않아요");
  }
  const entries = Object.entries(value);
  if (entries.length > 20) {
    throw new Error("다른 의상 인연 정보가 너무 많아요");
  }
  return Object.fromEntries(
    entries.map(([studentUid, rawBond]) => {
      const bond = parseNullableInteger(rawBond);
      if (!studentUid || bond == null || bond < 1 || bond > 100) {
        throw new Error("다른 의상 인연 랭크는 1부터 100 사이만 입력할 수 있어요");
      }
      return [studentUid, bond];
    }),
  );
}

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }

  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const logger = getLogger(env, ctx, {
    route: "students.$id._index.loader",
    studentUid: uid,
  });
  const currentUserPromise = getActiveSensei(env, request);
  const allRaidsPromise = getAllRaidSchedules(env);
  currentUserPromise.catch(() => {});
  allRaidsPromise.catch(() => {});

  let studentDetailData: Awaited<ReturnType<typeof getStudentDetailData>>;
  try {
    studentDetailData = await getStudentDetailData(env, uid);
  } catch (error) {
    logger.error("Failed to load student detail", error);
    if (isStudentNotFoundError(error)) {
      throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
    }
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (studentDetailData === undefined) {
    logger.error("Failed to load student detail without response data");
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }
  const student = studentDetailData.student;
  if (!student) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }

  const studentDetailContentPromise = getStudentDetailContent(publicReadEnv, uid, { ctx });

  const currentUser = await currentUserPromise;
  const writeModePromise = currentUser ? getStudentStateWriteMode(env) : Promise.resolve("legacy" as const);
  const primaryStudent = student.studentVariant.primaryStudent;
  const recruitmentGroupUids = primaryStudent.recruitments.map(({ recruitmentGroup }) => recruitmentGroup.uid);
  const variantPrimaryStudentUids = student.character.studentVariants.map((variant) => variant.primaryStudent.uid);
  const recruitedStudentsPromise = currentUser ? getRecruitedStudents(env, currentUser.id) : Promise.resolve([]);
  const relationshipLevelsPromise = currentUser
    ? getRelationshipLevels(env, currentUser.id, variantPrimaryStudentUids)
    : Promise.resolve(null);

  const [
    timelineContents,
    tagCounts,
    allGradings,
    allRaids,
    recruitedStudents,
    relationshipLevels,
    studentDetailContent,
    writeMode,
  ] = await Promise.all([
    getTimelineContentsByRecruitmentGroupUids(publicReadEnv, recruitmentGroupUids, { ctx }),
    getTagCountsByStudent(env, primaryStudent.uid),
    getStudentGradingsByStudentWithUsers(env, primaryStudent.uid, true, currentUser?.id),
    allRaidsPromise,
    recruitedStudentsPromise,
    relationshipLevelsPromise,
    studentDetailContentPromise,
    writeModePromise,
  ]);

  if (studentDetailContent.publishedSummaryError) {
    logger.error("Failed to load published student summary", studentDetailContent.publishedSummaryError, {
      studentUid: uid,
    });
  }
  if (studentDetailContent.knowledgeLookupStatus === "failed") {
    logger.error("Failed to load published knowledge terms", studentDetailContent.knowledgeLookupError, {
      studentUid: uid,
    });
  }

  const stateStudentUid = primaryStudent.uid;
  const myStudentState =
    recruitedStudents.find((recruitedStudent) => recruitedStudent.studentUid === stateStudentUid) ?? null;
  const sortedGradings = [...allGradings].sort((a, b) => {
    const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    student: {
      ...student,
      releaseAt: student.releaseAt ? toUtcIso(student.releaseAt) : null,
    },
    studentCatalog: studentDetailData.studentCatalog,
    myStudentState,
    myRelationshipLevels: Object.fromEntries(
      (relationshipLevels ?? []).map((relationshipLevel) => [
        relationshipLevel.studentId,
        relationshipLevel.currentLevel,
      ]),
    ),
    recruitments: getStudentRelevantTimelineContents(timelineContents, recruitmentGroupUids, primaryStudent.uid).map(
      (content) => ({
        uid: content.uid,
        name: content.name,
        since: content.startAt,
        until: content.endAt,
        imageUrl: content.imageUrl ?? null,
      }),
    ),
    tagCounts,
    allGradings: sortedGradings.map((grading) => ({
      ...grading,
      student: { uid: student.uid, name: student.name },
    })),
    publishedSummary: studentDetailContent.publishedSummary,
    knowledgeEntries: studentDetailContent.knowledgeEntries,
    knowledgeLookupStatus: studentDetailContent.knowledgeLookupStatus,
    currentUser,
    initialWriteMode: writeMode,
    allRaids,
  };
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data<StudentBasicInfoActionData>({ ok: false, error: "지원하지 않는 요청 방식이에요" }, { status: 405 });
  }

  const studentUid = params.id;
  if (!studentUid) {
    return data<StudentBasicInfoActionData>({ ok: false, error: "학생 정보가 필요해요" }, { status: 400 });
  }

  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "students.$id._index.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data<StudentBasicInfoActionData>({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json<Record<string, unknown>>();
  } catch {
    return data<StudentBasicInfoActionData>({ ok: false, error: "요청 형식이 올바르지 않아요" }, { status: 400 });
  }

  let studentDetailData: Awaited<ReturnType<typeof getStudentDetailData>>;
  try {
    studentDetailData = await getStudentDetailData(env, studentUid);
  } catch (error) {
    if (isStudentNotFoundError(error)) {
      return data<StudentBasicInfoActionData>({ ok: false, error: "존재하지 않는 학생이에요" }, { status: 400 });
    }
    logger.error("Failed to load student detail for save", error, { studentUid, userId: currentUser.id });
    return data<StudentBasicInfoActionData>(
      { ok: false, error: "학생 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요" },
      { status: 500 },
    );
  }
  const student = studentDetailData?.student;
  if (!student) {
    return data<StudentBasicInfoActionData>({ ok: false, error: "존재하지 않는 학생이에요" }, { status: 400 });
  }
  if (!student.released) {
    return data<StudentBasicInfoActionData>({ ok: false, error: "출시되지 않은 학생이에요" }, { status: 400 });
  }

  let tier: number | undefined;
  let requestMode: "legacy" | "nullable" = "legacy";
  let currentState: Partial<RecruitedStudentCurrentStateInput>;
  let relationshipBonds: Record<string, number | null>;
  try {
    if (payload.stateFormat != null && payload.stateFormat !== "legacy" && payload.stateFormat !== "nullable") {
      throw new Error("저장 형식이 올바르지 않아요");
    }
    requestMode = payload.stateFormat === "nullable" ? "nullable" : "legacy";
    const parsedTier = Object.hasOwn(payload, "tier") ? parseNullableInteger(payload.tier) : null;
    tier = requestMode === "nullable" ? (parsedTier ?? undefined) : (parsedTier ?? student.initialTier);
    if (tier != null && tier < student.initialTier) {
      throw new Error(`성급은 최초 성급인 ${student.initialTier}성보다 낮게 설정할 수 없어요`);
    }
    currentState = toStudentBasicInfoCurrentStateInput(payload);
    if (requestMode === "legacy") {
      validateStudentEquipmentLevels(student, studentDetailData?.studentCatalog, {
        equip1: currentState.equip1 ?? 1,
        equip2: currentState.equip2 ?? 1,
        equip3: currentState.equip3 ?? 1,
        ...currentState,
      });
    }
    const bond = Object.hasOwn(payload, "bond") ? parseNullableInteger(payload.bond) : undefined;
    if (bond != null && (bond < 1 || bond > 100)) {
      throw new Error("인연 랭크는 1부터 100 사이만 입력할 수 있어요");
    }
    const relatedBonds = parseRelatedBonds(payload.relatedBonds);
    const allowedRelationshipStudentUids = new Set(
      student.character.studentVariants.map((variant) => variant.primaryStudent.uid),
    );
    if (Object.keys(relatedBonds).some((uid) => !allowedRelationshipStudentUids.has(uid))) {
      throw new Error("같은 학생의 다른 의상만 함께 저장할 수 있어요");
    }

    const stateStudentUid = student.studentVariant.primaryStudent.uid;
    relationshipBonds = { ...relatedBonds };
    if (bond !== undefined && (requestMode === "nullable" || bond != null)) {
      relationshipBonds[stateStudentUid] = bond;
    }
  } catch (error) {
    return data<StudentBasicInfoActionData>(
      { ok: false, error: error instanceof Error ? error.message : "입력값을 확인해주세요" },
      { status: 400 },
    );
  }

  const stateStudentUid = student.studentVariant.primaryStudent.uid;
  try {
    await saveStudentBasicInfo(
      env,
      currentUser.id,
      stateStudentUid,
      { tier, currentState, relationshipBonds },
      {
        requestMode,
        ...(requestMode === "nullable"
          ? { equipmentValidation: { student, catalog: studentDetailData?.studentCatalog } }
          : {}),
      },
    );
    return data<StudentBasicInfoActionData>({ ok: true });
  } catch (error) {
    if (isStaleStudentStateRequestError(error)) {
      return data<StudentBasicInfoActionData>(
        { ok: false, error: STUDENT_STATE_STALE_MESSAGE, code: STUDENT_STATE_STALE_CODE },
        { status: 409 },
      );
    }
    if (isActionValidationError(error)) {
      return data<StudentBasicInfoActionData>({ ok: false, error: error.message }, { status: 400 });
    }
    logger.error("Student basic info save failed", error, {
      studentUid: stateStudentUid,
      userId: currentUser.id,
      operation: "save",
    });
    return data<StudentBasicInfoActionData>(
      { ok: false, error: "육성 상태를 저장하지 못했어요. 잠시 후 다시 시도해주세요", retryable: true },
      { status: 500 },
    );
  }
};

export default function StudentDetail() {
  const {
    student,
    recruitments,
    tagCounts,
    allGradings,
    currentUser,
    allRaids,
    studentCatalog,
    myStudentState,
    myRelationshipLevels,
    initialWriteMode,
    publishedSummary,
    knowledgeEntries,
    knowledgeLookupStatus,
  } = useLoaderData<typeof loader>();
  const [writeMode] = useState(initialWriteMode);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [rawStatistics, setRawStatistics] = useState<RaidStatistics[]>([]);
  const [statisticsFailed, setStatisticsFailed] = useState(false);
  const [statisticsAttempt, setStatisticsAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the attempt counter is the explicit retry trigger for this request.
  useEffect(() => {
    let cancelled = false;
    const loadStatistics = async () => {
      setStatisticsLoading(true);
      setStatisticsFailed(false);
      try {
        const rawStatistics = await fetchRaidStatisticsByStudent(student.uid);
        if (cancelled) {
          return;
        }
        setRawStatistics(rawStatistics);
      } catch {
        if (!cancelled) setStatisticsFailed(true);
      } finally {
        if (!cancelled) {
          setStatisticsLoading(false);
        }
      }
    };
    loadStatistics();
    return () => {
      cancelled = true;
    };
  }, [student.uid, statisticsAttempt]);

  const recentReview = allGradings[0];
  const currentUserReview = allGradings.find(
    (grading) => currentUser && grading.user.username === currentUser.username,
  );
  const studentInfoReady = Boolean(studentCatalog && student.catalog);

  return (
    <>
      <div className={studentInfoReady ? undefined : "space-y-6"}>
        <StudentKnowledgePopoverProvider>
          {studentInfoReady && studentCatalog && student.catalog ? (
            <StudentBasicInfo
              key={student.uid}
              student={student}
              schaleDbId={student.schaleDbId}
              catalog={studentCatalog}
              signedIn={currentUser !== null}
              currentUserId={currentUser?.id ?? null}
              released={student.released}
              recruited={myStudentState !== null}
              relatedRelationshipLevels={myRelationshipLevels}
              nullableSemantics={writeMode === "nullable"}
              knowledgeEntries={knowledgeEntries}
              knowledgeLookupStatus={knowledgeLookupStatus}
              aiSummary={
                publishedSummary ? (
                  <StudentAiSummaryCard summary={publishedSummary.summary} entries={knowledgeEntries} />
                ) : null
              }
              gradingSummary={
                <StudentGradingChart
                  student={student}
                  tagCounts={tagCounts}
                  noGrading={allGradings.length === 0}
                  signedIn={currentUser !== null}
                  recentReview={recentReview}
                  currentUserReview={currentUserReview}
                  variant="embedded"
                />
              }
              savedState={{
                level: myStudentState?.level ?? null,
                tier: myStudentState?.tier ?? null,
                bond: myRelationshipLevels[student.studentVariant.primaryStudent.uid] ?? null,
                skillEx: myStudentState?.skillEx ?? null,
                skillNormal: myStudentState?.skillNormal ?? null,
                skillEnhanced: myStudentState?.skillEnhanced ?? null,
                skillSub: myStudentState?.skillSub ?? null,
                equip1: myStudentState?.equip1 ?? null,
                equip2: myStudentState?.equip2 ?? null,
                equip3: myStudentState?.equip3 ?? null,
                equip1Level: myStudentState?.equip1Level ?? null,
                equip2Level: myStudentState?.equip2Level ?? null,
                equip3Level: myStudentState?.equip3Level ?? null,
                equipSpecial: myStudentState?.equipSpecial ?? null,
                weaponLevel: myStudentState?.weaponLevel ?? null,
                abilityHp: myStudentState?.abilityHp ?? null,
                abilityAtk: myStudentState?.abilityAtk ?? null,
                abilityHeal: myStudentState?.abilityHeal ?? null,
              }}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <StudentPreparingState />
              <section>
                <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
                  <h2 className="text-base leading-[1.4] font-semibold text-v2-fg">학생 평가 요약</h2>
                  <Link to={`/students/${student.uid}/gradings`} className="inline-flex min-h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg">
                    전체 평가 보기
                  </Link>
                </div>
                <StudentGradingChart
                  student={student}
                  tagCounts={tagCounts}
                  noGrading={allGradings.length === 0}
                  signedIn={currentUser !== null}
                  recentReview={recentReview}
                  currentUserReview={currentUserReview}
                  variant="embedded"
                />
              </section>
            </div>
          )}
        </StudentKnowledgePopoverProvider>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base leading-[1.4] font-semibold text-v2-fg">역대 편성 통계</h2>
          <Link
            to={`/students/${student.uid}/statistics`}
            {...getV2LinkTransitionProps("crossfade")}
            className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg"
          >
            상세 통계 보기<ArrowRightIcon className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <div>
          {statisticsLoading ? (
            <StudentStatisticsState state="loading" onRetry={() => setStatisticsAttempt((value) => value + 1)} />
          ) : statisticsFailed ? (
            <StudentStatisticsState state="failed" onRetry={() => setStatisticsAttempt((value) => value + 1)} />
          ) : rawStatistics.length === 0 ? (
            <StudentStatisticsState state="empty" onRetry={() => setStatisticsAttempt((value) => value + 1)} />
          ) : (
            <StudentRaidUsageChart
              releaseAt={student.releaseAt}
              raids={allRaids}
              statistics={rawStatistics}
              title={null}
            />
          )}
        </div>
      </div>

      {recruitments.length > 0 && (
        <RecruitmentHistoryList recruitments={recruitments} />
      )}
    </>
  );
}
