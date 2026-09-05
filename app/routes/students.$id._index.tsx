import { ChartBarIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RecruitmentHistories } from "~/components/features/students";
import { Button, Callout, EmptyView, LoadingSkeleton, SubTitle } from "~/components/primitives";
import { validateStudentEquipmentLevels } from "~/domain/student-calculator";
import { isActionValidationError } from "~/lib/action-errors";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { toUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { fetchRaidStatisticsByStudent, type RaidStatistics } from "~/lib/ranks/stats";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudents, type RecruitedStudentCurrentStateInput } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getStudentDetailData } from "~/models/student";
import { saveStudentBasicInfo } from "~/models/student-basic-info";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading.server";
import { getTagCountsByStudent } from "~/models/student-grading-tag.server";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import { getStudentRelevantTimelineContents } from "./students.$id";
import StudentBasicInfo from "./students.$id._components/StudentBasicInfo";
import StudentGradingChart from "./students.$id._components/StudentGradingChart";
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

const equipmentLevelFieldKeys = ["equip1Level", "equip2Level", "equip3Level"] as const;
type EquipmentLevelField = (typeof equipmentLevelFieldKeys)[number];

function isEquipmentLevelField(field: (typeof currentStateFieldKeys)[number]): field is EquipmentLevelField {
  return equipmentLevelFieldKeys.includes(field as EquipmentLevelField);
}

type StudentBasicInfoActionData =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

function parseNullableInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  throw new Error("숫자 형식이 올바르지 않아요");
}

export function toStudentBasicInfoCurrentStateInput(
  payload: Record<string, unknown>,
): RecruitedStudentCurrentStateInput {
  return currentStateFieldKeys.reduce((result, field) => {
    if (isEquipmentLevelField(field) && !Object.hasOwn(payload, field)) {
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

  const currentUser = await currentUserPromise;
  const recruitmentGroupUids = student.recruitments.map(({ recruitmentGroup }) => recruitmentGroup.uid);
  const variantPrimaryStudentUids = student.character.studentVariants.map((variant) => variant.primaryStudent.uid);
  const recruitedStudentsPromise = currentUser ? getRecruitedStudents(env, currentUser.id) : Promise.resolve([]);
  const relationshipLevelsPromise = currentUser
    ? getRelationshipLevels(env, currentUser.id, variantPrimaryStudentUids)
    : Promise.resolve(null);

  const [timelineContents, tagCounts, allGradings, allRaids, recruitedStudents, relationshipLevels] = await Promise.all(
    [
      getTimelineContentsByRecruitmentGroupUids(publicReadEnv, recruitmentGroupUids, { ctx }),
      getTagCountsByStudent(env, uid),
      getStudentGradingsByStudentWithUsers(env, uid, true, currentUser?.id),
      allRaidsPromise,
      recruitedStudentsPromise,
      relationshipLevelsPromise,
    ],
  );

  const stateStudentUid = student.studentVariant.primaryStudent.uid;
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
    recruitments: getStudentRelevantTimelineContents(timelineContents, recruitmentGroupUids, student.uid).map(
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
    currentUser,
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

  let tier: number;
  let currentState: RecruitedStudentCurrentStateInput;
  let relationshipBonds: Record<string, number>;
  try {
    tier = parseNullableInteger(payload.tier) ?? student.initialTier;
    if (tier < student.initialTier) {
      throw new Error(`성급은 최초 성급인 ${student.initialTier}성보다 낮게 설정할 수 없어요`);
    }
    currentState = toStudentBasicInfoCurrentStateInput(payload);
    validateStudentEquipmentLevels(student, studentDetailData?.studentCatalog, currentState);
    const bond = parseNullableInteger(payload.bond);
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
    if (bond != null) relationshipBonds[stateStudentUid] = bond;
  } catch (error) {
    return data<StudentBasicInfoActionData>(
      { ok: false, error: error instanceof Error ? error.message : "입력값을 확인해주세요" },
      { status: 400 },
    );
  }

  const stateStudentUid = student.studentVariant.primaryStudent.uid;
  try {
    await saveStudentBasicInfo(env, currentUser.id, stateStudentUid, { tier, currentState, relationshipBonds });
    return data<StudentBasicInfoActionData>({ ok: true });
  } catch (error) {
    if (isActionValidationError(error)) {
      return data<StudentBasicInfoActionData>({ ok: false, error: error.message }, { status: 400 });
    }
    logger.error("Student basic info save failed", error, {
      studentUid: stateStudentUid,
      userId: currentUser.id,
      operation: "save",
    });
    return data<StudentBasicInfoActionData>(
      { ok: false, error: "육성 상태를 저장하지 못했어요. 잠시 후 다시 시도해주세요" },
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
  } = useLoaderData<typeof loader>();
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [rawStatistics, setRawStatistics] = useState<RaidStatistics[]>([]);
  useEffect(() => {
    let cancelled = false;
    const loadStatistics = async () => {
      try {
        const rawStatistics = await fetchRaidStatisticsByStudent(student.uid);
        if (cancelled) {
          return;
        }
        setRawStatistics(rawStatistics);
      } catch {
        // Keep the existing graceful empty-state behavior without alerting.
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
  }, [student.uid]);

  const recentReview = allGradings[0];
  const currentUserReview = allGradings.find(
    (grading) => currentUser && grading.user.username === currentUser.username,
  );

  return (
    <>
      <div className="mt-6 md:mt-8">
        {studentCatalog && student.catalog ? (
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
          <Callout tone="warning" title="학생 기본 정보를 준비하고 있어요" />
        )}
      </div>

      <div className="mt-8 md:mt-10">
        <SubTitle text="역대 편성 통계" />
        <div className="mt-3 md:mt-4">
          {statisticsLoading ? (
            <LoadingSkeleton />
          ) : rawStatistics.length === 0 ? (
            <EmptyView text="편성된 총력전/대결전 정보가 없어요" />
          ) : (
            <>
              <StudentRaidUsageChart
                releaseAt={student.releaseAt}
                raids={allRaids}
                statistics={rawStatistics}
                title={null}
              />
              <div className="mt-3 flex justify-end">
                <Button
                  text="상세 통계 보기"
                  icon={ChartBarIcon}
                  variant="primary"
                  size="sm"
                  to={`/students/${student.uid}/statistics`}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {recruitments.length > 0 && (
        <div className="mt-8 md:mt-10">
          <SubTitle text="모집 일정" />
          <RecruitmentHistories recruitments={recruitments} />
        </div>
      )}
    </>
  );
}
