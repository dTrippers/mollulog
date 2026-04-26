import type { ActionFunctionArgs } from "react-router";
import { data, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getRecruitedStudents, upsertRecruitedStudent } from "~/models/recruited-student";
import {
  getRelationshipLevel,
  removeRelationshipLevel,
  resolveRelationshipLevelInput,
  upsertRelationshipLevel,
} from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import {
  type StudentGrowthInput,
  removeStudentGrowth,
  upsertStudentGrowth,
} from "~/models/student-growth";
import { loadStudentRow } from "./utils.growth._components/growth-data.server";
import GrowthTable from "./utils.growth._components/GrowthTable";
import type { GrowthActionResult, GrowthLayoutContext } from "./utils.growth._components/types";

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

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data<GrowthActionResult>({ error: "로그인이 필요해요" }, { status: 401 });
  }

  if (request.method !== "POST") {
    return data<GrowthActionResult>({ error: "지원하지 않는 요청 방식이에요" }, { status: 405 });
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
      return data<GrowthActionResult>({ error: "학생 정보가 필요해요" }, { status: 400 });
    }

    const allStudentsMap = await getAllStudentsMap(env, true);
    if (!(payload.studentUid in allStudentsMap)) {
      return data<GrowthActionResult>({ error: "존재하지 않는 학생이에요" }, { status: 400 });
    }

    if (payload._intent === "enroll") {
      const student = allStudentsMap[payload.studentUid];
      if (!student?.released) {
        return data<GrowthActionResult>({ error: "출시되지 않은 학생이에요" }, { status: 400 });
      }
      await upsertRecruitedStudent(env, currentUser.id, payload.studentUid, student.initialTier);
    } else if (payload._intent === "add") {
      await upsertStudentGrowth(env, currentUser.id, payload.studentUid, toGrowthInput({}));
      return data<GrowthActionResult>({ kind: "listChange", requiresRevalidation: true });
    } else if (payload._intent === "remove") {
      await removeStudentGrowth(env, currentUser.id, payload.studentUid);
      return data<GrowthActionResult>({ kind: "listChange", requiresRevalidation: true });
    } else if (payload._intent === "relationship") {
      const relationshipPayload = payload as Partial<RelationshipActionData>;
      const existingRelationshipLevel = await getRelationshipLevel(env, currentUser.id, payload.studentUid);
      const resolvedRelationshipLevel = resolveRelationshipLevelInput(
        existingRelationshipLevel,
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
          existingRelationshipLevel?.items ?? {},
        );
      }
    } else if (payload._intent === "tier") {
      const recruitedStudents = await getRecruitedStudents(env, currentUser.id);
      if (!recruitedStudents.some(({ studentUid }) => studentUid === payload.studentUid)) {
        return data<GrowthActionResult>({ error: "모집하지 않은 학생이에요" }, { status: 400 });
      }
      const tierPayload = payload as Partial<TierActionData>;
      if (tierPayload.tier == null || tierPayload.tier < 1 || tierPayload.tier > 9) {
        return data<GrowthActionResult>({ error: "성급 범위가 올바르지 않아요" }, { status: 400 });
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

    const row = await loadStudentRow(env, currentUser.id, payload.studentUid);
    if (!row) {
      return data<GrowthActionResult>({ error: "학생 정보를 다시 불러오지 못했어요" }, { status: 500 });
    }
    return data<GrowthActionResult>({ kind: "studentUpdate", student: row });
  } catch (error) {
    return data<GrowthActionResult>(
      { error: error instanceof Error ? error.message : "데이터를 저장하지 못했어요" },
      { status: 400 },
    );
  }
};

export default function GrowthStudentsPage() {
  const { managedStudents, availableStudents, updateStudent } = useOutletContext<GrowthLayoutContext>();

  return (
    <GrowthTable students={managedStudents} availableStudents={availableStudents} onStudentUpdate={updateStudent} />
  );
}
