import type { ActionFunctionArgs } from "react-router";
import { data, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getRelationshipLevelValidationError } from "~/domain/relationship-level";
import {
  isStaleStudentStateRequestError,
  STUDENT_STATE_STALE_CODE,
  STUDENT_STATE_STALE_MESSAGE,
} from "~/domain/student-state-errors";
import { ActionValidationError } from "~/lib/action-errors";
import { getLogger } from "~/lib/observability.server";
import {
  type RecruitedStudentCurrentStateInput,
  RecruitedStudentValidationError,
  updateRecruitedStudentTier,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { updateRelationshipLevel } from "~/models/relationship-level";
import { getAllStudentsMap } from "~/models/student";
import {
  removeStudentGrowth,
  type StudentGrowthInput,
  StudentGrowthValidationError,
  saveStudentGrowthAndCurrentState,
  upsertStudentGrowth,
} from "~/models/student-growth";
import GrowthTable from "./utils.growth._components/GrowthTable";
import { loadStudentRow } from "./utils.growth._components/growth-data.server";
import type { GrowthActionResult, GrowthLayoutContext } from "./utils.growth._components/types";

const currentStateFieldKeys = [
  "level",
  "weaponLevel",
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
  "equip1",
  "equip2",
  "equip3",
  "equipSpecial",
  "abilityHp",
  "abilityAtk",
  "abilityHeal",
] as const satisfies (keyof RecruitedStudentCurrentStateInput)[];

const targetGrowthFieldKeys = [
  "targetLevel",
  "targetWeaponLevel",
  "targetSkillEx",
  "targetSkillNormal",
  "targetSkillEnhanced",
  "targetSkillSub",
  "targetEquip1",
  "targetEquip2",
  "targetEquip3",
  "targetEquipSpecial",
  "targetTier",
  "targetAbilityHp",
  "targetAbilityAtk",
  "targetAbilityHeal",
] as const satisfies (keyof StudentGrowthInput)[];

type GrowthActionData = {
  _intent?: "growth";
  studentUid: string;
  _submissionId?: string;
} & RecruitedStudentCurrentStateInput &
  StudentGrowthInput;

type TierActionData = {
  _intent: "tier";
  studentUid: string;
  tier: number;
  _submissionId?: string;
};

type AddActionData = {
  _intent: "add";
  studentUid: string;
  _submissionId?: string;
};

type RemoveActionData = {
  _intent: "remove";
  studentUid: string;
  _submissionId?: string;
};

type EnrollActionData = {
  _intent: "enroll";
  studentUid: string;
  _submissionId?: string;
};

type RelationshipActionData = {
  _intent: "relationship";
  studentUid: string;
  currentLevel: number | null;
  targetLevel: number | null;
  _submissionId?: string;
};

type ResourceRequirementsActionData = {
  _intent: "resourceRequirements";
  studentUid: string;
  _submissionId?: string;
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
      throw new ActionValidationError("숫자 형식이 올바르지 않아요");
    }
    return Number(trimmed);
  }

  throw new ActionValidationError("숫자 형식이 올바르지 않아요");
}

function toGrowthInput(payload: Partial<GrowthActionData>): StudentGrowthInput {
  return targetGrowthFieldKeys.reduce((acc, field) => {
    acc[field] = parseNullableInteger(payload[field]);
    return acc;
  }, {} as StudentGrowthInput);
}

function toCurrentStateInput(payload: Partial<GrowthActionData>): RecruitedStudentCurrentStateInput {
  return currentStateFieldKeys.reduce((acc, field) => {
    acc[field] = parseNullableInteger(payload[field]);
    return acc;
  }, {} as RecruitedStudentCurrentStateInput);
}

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "utils.growth.students.action" });
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
          | ResourceRequirementsActionData
        >
      >();
    if (!payload.studentUid) {
      return data<GrowthActionResult>({ error: "학생 정보가 필요해요" }, { status: 400 });
    }

    const allStudentsMap = await getAllStudentsMap(env, true);
    if (!(payload.studentUid in allStudentsMap)) {
      return data<GrowthActionResult>({ error: "존재하지 않는 학생이에요" }, { status: 400 });
    }

    if (payload._intent === "resourceRequirements") {
      // The primary save response updates the inputs first. Resource requirements are refreshed by a separate request.
    } else if (payload._intent === "enroll") {
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
      const relationshipInput = {
        currentLevel: parseNullableInteger(relationshipPayload.currentLevel),
        targetLevel: parseNullableInteger(relationshipPayload.targetLevel),
      };
      const relationshipError = getRelationshipLevelValidationError(relationshipInput);
      if (relationshipError) throw new ActionValidationError(relationshipError);
      await updateRelationshipLevel(env, currentUser.id, payload.studentUid, relationshipInput);
    } else if (payload._intent === "tier") {
      const tierPayload = payload as Partial<TierActionData>;
      if (tierPayload.tier == null || tierPayload.tier < 1 || tierPayload.tier > 9) {
        throw new ActionValidationError("성급 범위가 올바르지 않아요");
      }
      await updateRecruitedStudentTier(env, currentUser.id, payload.studentUid, tierPayload.tier);
    } else {
      const growthPayload = payload as Partial<GrowthActionData>;
      const currentInput = toCurrentStateInput(growthPayload);
      const growthInput = toGrowthInput(growthPayload);
      await saveStudentGrowthAndCurrentState(
        env,
        currentUser.id,
        payload.studentUid,
        currentInput,
        growthInput,
        allStudentsMap[payload.studentUid]?.initialTier ?? null,
      );
    }

    const row = await loadStudentRow(env, currentUser.id, payload.studentUid, {
      logger,
      includeResourceRequirements: payload._intent === "resourceRequirements",
    });
    if (!row) {
      return data<GrowthActionResult>({ error: "학생 정보를 다시 불러오지 못했어요" }, { status: 500 });
    }
    return data<GrowthActionResult>({ kind: "studentUpdate", student: row, submissionId: payload._submissionId });
  } catch (error) {
    if (isStaleStudentStateRequestError(error)) {
      return data<GrowthActionResult>(
        {
          error: STUDENT_STATE_STALE_MESSAGE,
          code: STUDENT_STATE_STALE_CODE,
        },
        { status: 409 },
      );
    }
    if (
      error instanceof ActionValidationError ||
      error instanceof RecruitedStudentValidationError ||
      error instanceof StudentGrowthValidationError
    ) {
      return data<GrowthActionResult>({ error: error.message, retryable: false }, { status: 400 });
    }
    logger.error("Student growth save failed", error, { userId: currentUser.id });
    return data<GrowthActionResult>({ error: "저장하지 못했어요", retryable: true }, { status: 500 });
  }
};

export default function GrowthStudentsPage() {
  const { managedStudents, availableStudents, updateStudent } = useOutletContext<GrowthLayoutContext>();

  return (
    <GrowthTable students={managedStudents} availableStudents={availableStudents} onStudentUpdate={updateStudent} />
  );
}
