import { MagnifyingGlassIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useFetcher, useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { StudentSearchInput } from "~/components/features/students";
import { EmptyView } from "~/components/primitives";
import { fetchStudentGearData, getStudentGrowthResourceRequirements } from "~/models/growth-resource";
import { getRecruitedStudents, upsertRecruitedStudent } from "~/models/recruited-student";
import {
  getRelationshipLevel,
  getRelationshipLevels,
  removeRelationshipLevel,
  resolveRelationshipLevelInput,
  upsertRelationshipLevel,
} from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import {
  type StudentGrowthInput,
  getStudentGrowths,
  removeStudentGrowth,
  upsertStudentGrowth,
} from "~/models/student-growth";
import GrowthTable from "./utils.growth._components/GrowthTable";

type GrowthActionData = {
  _intent?: "growth";
  studentUid: string;
} & StudentGrowthInput;

type TierActionData = {
  _intent: "tier";
  studentUid: string;
  tier: number;
};

type AddActionData = {
  _intent: "add";
  studentUid: string;
};

type RemoveActionData = {
  _intent: "remove";
  studentUid: string;
};

type EnrollActionData = {
  _intent: "enroll";
  studentUid: string;
};

type RelationshipActionData = {
  _intent: "relationship";
  studentUid: string;
  currentLevel: number | null;
  targetLevel: number | null;
};

const growthFieldKeys = [
  "level",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equipSpecial",
  "targetLevel",
  "targetSkillEx",
  "targetSkillNormal",
  "targetSkillEnhanced",
  "targetSkillSub",
  "targetEquip1",
  "targetEquip2",
  "targetEquip3",
  "targetEquipSpecial",
  "targetTier",
] as const satisfies (keyof StudentGrowthInput)[];

function parseNullableInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (!/^\d+$/.test(trimmed)) {
      throw new Error("숫자 형식이 올바르지 않아요");
    }
    return Number(trimmed);
  }

  throw new Error("숫자 형식이 올바르지 않아요");
}

function toGrowthInput(payload: Partial<GrowthActionData>): StudentGrowthInput {
  return growthFieldKeys.reduce((acc, field) => {
    acc[field] = parseNullableInteger(payload[field]);
    return acc;
  }, {} as StudentGrowthInput);
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const [recruitedStudents, growths, relationshipLevels, allStudentsMap] = await Promise.all([
    getRecruitedStudents(env, currentUser.id),
    getStudentGrowths(env, currentUser.id),
    getRelationshipLevels(env, currentUser.id),
    getAllStudentsMap(env, true),
  ]);

  const growthMap = growths.reduce(
    (acc, growth) => {
      acc[growth.studentUid] = growth;
      return acc;
    },
    {} as Record<string, (typeof growths)[number]>,
  );
  const relationshipMap = relationshipLevels.reduce(
    (acc, relationshipLevel) => {
      acc[relationshipLevel.studentId] = relationshipLevel;
      return acc;
    },
    {} as Record<string, (typeof relationshipLevels)[number]>,
  );

  const managedUids = new Set(growths.map((g) => g.studentUid));
  const recruitedUids = new Set(recruitedStudents.map((r) => r.studentUid));
  const recruitedTierMap = recruitedStudents.reduce(
    (acc, r) => {
      acc[r.studentUid] = r.tier;
      return acc;
    },
    {} as Record<string, number>,
  );

  const managedStudentsBase = [...managedUids]
    .map((studentUid) => ({
      studentUid,
      student: allStudentsMap[studentUid],
      growth: growthMap[studentUid],
      isRecruited: recruitedUids.has(studentUid),
    }))
    .sort((a, b) => (b.student?.order ?? -1) - (a.student?.order ?? -1));

  const studentGearDataMap = await fetchStudentGearData(managedStudentsBase.map(({ studentUid }) => studentUid));

  const managedStudentsData = managedStudentsBase.map((entry) => {
    const { studentUid, student, growth, isRecruited } = entry;
    const gearData = studentGearDataMap.get(studentUid) ?? null;

    return {
      uid: studentUid,
      name: student?.name ?? studentUid,
      order: student?.order ?? -1,
      isRecruited,
      released: student?.released ?? false,
      hasGear: gearData != null,
      tier: isRecruited ? (recruitedTierMap[studentUid] ?? null) : null,
      initialTier: student?.initialTier ?? 1,
      relationshipCurrentLevel: relationshipMap[studentUid]?.currentLevel ?? null,
      relationshipTargetLevel: relationshipMap[studentUid]?.targetLevel ?? null,
      level: growth?.level ?? null,
      skillEx: growth?.skillEx ?? null,
      skillNormal: growth?.skillNormal ?? null,
      skillEnhanced: growth?.skillEnhanced ?? null,
      skillSub: growth?.skillSub ?? null,
      equip1: growth?.equip1 ?? null,
      equip2: growth?.equip2 ?? null,
      equip3: growth?.equip3 ?? null,
      equipSpecial: gearData ? (growth?.equipSpecial ?? null) : null,
      targetLevel: growth?.targetLevel ?? null,
      targetSkillEx: growth?.targetSkillEx ?? null,
      targetSkillNormal: growth?.targetSkillNormal ?? null,
      targetSkillEnhanced: growth?.targetSkillEnhanced ?? null,
      targetSkillSub: growth?.targetSkillSub ?? null,
      targetEquip1: growth?.targetEquip1 ?? null,
      targetEquip2: growth?.targetEquip2 ?? null,
      targetEquip3: growth?.targetEquip3 ?? null,
      targetEquipSpecial: gearData ? (growth?.targetEquipSpecial ?? null) : null,
      targetTier: growth?.targetTier ?? null,
    };
  });

  const growthResourceRequirements = await getStudentGrowthResourceRequirements(
    managedStudentsData,
    allStudentsMap,
    studentGearDataMap,
  );
  const managedStudents = managedStudentsData.map((student) => ({
    ...student,
    resourceRequirements: growthResourceRequirements[student.uid] ?? { items: [], skillUnavailable: false },
  }));

  const availableStudents = Object.values(allStudentsMap)
    .filter((student) => !managedUids.has(student.uid))
    .map((student) => ({ uid: student.uid, name: student.name }))
    .sort((a, b) => (allStudentsMap[b.uid]?.order ?? -1) - (allStudentsMap[a.uid]?.order ?? -1));

  return { managedStudents, availableStudents };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return data({ error: "로그인이 필요해요" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return data({ error: "지원하지 않는 요청 방식이에요" }, { status: 405 });
  }

  try {
    const payload =
      await request.json<
        Partial<
          | GrowthActionData
          | TierActionData
          | AddActionData
          | RemoveActionData
          | EnrollActionData
          | RelationshipActionData
        >
      >();
    if (!payload.studentUid) {
      return data({ error: "학생 정보가 필요해요" }, { status: 400 });
    }

    const allStudentsMap = await getAllStudentsMap(env, true);
    if (!(payload.studentUid in allStudentsMap)) {
      return data({ error: "존재하지 않는 학생이에요" }, { status: 400 });
    }

    if (payload._intent === "enroll") {
      const student = allStudentsMap[payload.studentUid];
      if (!student?.released) {
        return data({ error: "출시되지 않은 학생이에요" }, { status: 400 });
      }
      await upsertRecruitedStudent(env, currentUser.id, payload.studentUid, student.initialTier);
    } else if (payload._intent === "add") {
      await upsertStudentGrowth(env, currentUser.id, payload.studentUid, toGrowthInput({}));
    } else if (payload._intent === "remove") {
      await removeStudentGrowth(env, currentUser.id, payload.studentUid);
    } else if (payload._intent === "relationship") {
      const relationshipPayload = payload as Partial<RelationshipActionData>;
      const resolvedRelationshipLevel = resolveRelationshipLevelInput(
        await getRelationshipLevel(env, currentUser.id, payload.studentUid),
        {
          currentLevel: parseNullableInteger(relationshipPayload.currentLevel),
          targetLevel: parseNullableInteger(relationshipPayload.targetLevel),
        },
      );

      if (resolvedRelationshipLevel == null) {
        await removeRelationshipLevel(env, currentUser.id, payload.studentUid);
      } else {
        await upsertRelationshipLevel(
          env,
          currentUser.id,
          payload.studentUid,
          resolvedRelationshipLevel.currentLevel,
          resolvedRelationshipLevel.currentExp,
          resolvedRelationshipLevel.targetLevel,
          {},
        );
      }
    } else if (payload._intent === "tier") {
      const recruitedStudents = await getRecruitedStudents(env, currentUser.id);
      if (!recruitedStudents.some(({ studentUid }) => studentUid === payload.studentUid)) {
        return data({ error: "모집하지 않은 학생이에요" }, { status: 400 });
      }
      const tierPayload = payload as Partial<TierActionData>;
      if (tierPayload.tier == null || tierPayload.tier < 1 || tierPayload.tier > 9) {
        return data({ error: "성급 범위가 올바르지 않아요" }, { status: 400 });
      }
      await upsertRecruitedStudent(env, currentUser.id, payload.studentUid, tierPayload.tier);
    } else {
      await upsertStudentGrowth(
        env,
        currentUser.id,
        payload.studentUid,
        toGrowthInput(payload as Partial<GrowthActionData>),
      );
    }

    return data({ success: true });
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "데이터를 저장하지 못했어요" }, { status: 400 });
  }
};

function StudentAddSearch({ availableStudents }: { availableStudents: { uid: string; name: string }[] }) {
  const fetcher = useFetcher();

  return (
    <StudentSearchInput
      placeholder="학생 이름으로 검색해서 추가..."
      students={availableStudents}
      grid={6}
      onSelect={(studentUid) => {
        fetcher.submit({ _intent: "add", studentUid }, { method: "post", encType: "application/json" });
      }}
    />
  );
}

export default function GrowthStudentsPage() {
  const { managedStudents, availableStudents } = useLoaderData<typeof loader>();

  return (
    <Page
      title="성장/재화 플래너 (β)"
      description="학생들의 현재 성장 상태와 목표를 입력하고 필요한 재화량을 계산해보세요."
      contentArea="full"
      panels={[
        {
          title: "학생 추가",
          description: "성장을 관리할 학생을 검색해서 추가해보세요",
          Icon: MagnifyingGlassIcon,
          children: <StudentAddSearch availableStudents={availableStudents} />,
        },
      ]}
    >
      {managedStudents.length === 0 ? (
        <EmptyView Icon={UserPlusIcon} text="사이드바에서 학생을 검색해서 추가해보세요" />
      ) : (
        <GrowthTable students={managedStudents} />
      )}
    </Page>
  );
}
