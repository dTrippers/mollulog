import {
  EyeIcon,
  FunnelIcon,
  IdentificationIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useBlocker, useFetcher, useLoaderData, useOutletContext, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import type { PagePanelProps } from "~/components/features/layout";
import {
  getFilteredStudentUids,
  StudentCards,
  StudentFilter,
  TierSelector,
  usePersistentStudentFilterState,
} from "~/components/features/students";
import { readStudentFilterStateFromCookie } from "~/components/features/students/student-filter-cookie";
import { Button, Callout, FilterButtons, SubTitle, Toggle } from "~/components/primitives";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import { captureServerError, getLogger } from "~/lib/observability.server";
import {
  addRecruitedStudents,
  getRecruitedStudents,
  MAX_RECRUITED_STUDENT_BATCH_SIZE,
  patchRecruitedStudentCurrentState,
  type RecruitedStudentBatchInput,
  type RecruitedStudentCurrentStatePatch,
  type RecruitedStudentCurrentStatePatchOptions,
  RecruitedStudentValidationError,
  removeRecruitedStudent,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { updateSensei } from "~/models/sensei";
import { getAllStudentsMap, getStudentDetailData } from "~/models/student";
import { getUserStudentsView, type UserStudentsViewMode } from "~/views/user-students.server";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import GrowthVisibilityControl from "./$username.students._components/GrowthVisibilityControl";
import ShareStudentGrowthButton from "./$username.students._components/ShareStudentGrowthButton";
import StudentGrowthCard, { CURRENT_STATE_INTENT } from "./$username.students._components/StudentGrowthCard";

export const USER_STUDENT_FILTER_COOKIE_NAME = "mollulog_user_students_filter";
export const USER_STUDENT_FILTER_COOKIE_PATH = "/";
export const USER_STUDENT_FILTER_SORTS = ["recent", "old", "name", "tier"] as const;

const userStudentFilterCookieOptions = {
  cookieName: USER_STUDENT_FILTER_COOKIE_NAME,
  cookiePath: USER_STUDENT_FILTER_COOKIE_PATH,
  defaultSort: "recent",
  allowedSorts: USER_STUDENT_FILTER_SORTS,
} as const;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);

  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const requestedView: UserStudentsViewMode =
    new URL(request.url).searchParams.get("view") === "growth" ? "growth" : "summary";
  const userStudents = await getUserStudentsView(env, sensei, currentUser?.id, requestedView);
  return {
    me: currentUser?.id === sensei.id,
    noRecruited: userStudents.noRecruited,
    view: userStudents.view,
    growthVisibility: userStudents.growthVisibility,
    canViewGrowth: userStudents.canViewGrowth,
    filterState: readStudentFilterStateFromCookie(request.headers.get("Cookie"), userStudentFilterCookieOptions),
    profileVisibility: sensei.profileVisibility,
    username: sensei.username,
    students: userStudents.students,
  };
};

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 학생부 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 학생부 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
  ];
};

const BATCH_ADD_INTENT = "batch-add";
const BATCH_INVALID_ERROR = "학생 일괄 등록 요청이 올바르지 않아요";
const EMPTY_BATCH_ERROR = "등록할 학생을 선택해 주세요";
const LOGIN_REQUIRED_ERROR = "로그인이 필요해요";
const FORBIDDEN_ERROR = "본인 학생부만 수정할 수 있어요";
const STUDENT_REQUIRED_ERROR = "학생 정보가 필요해요";
const STUDENT_NOT_FOUND_ERROR = "존재하지 않는 학생이에요";
const STUDENT_CATALOG_ERROR = "학생 목록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요";
const STUDENT_WRITE_ERROR = "학생 등록에 실패했어요. 잠시 후 다시 시도해 주세요";
const SINGLE_TIER_INVALID_ERROR = "성급 범위가 올바르지 않아요";
const METHOD_NOT_ALLOWED_ERROR = "지원하지 않는 요청 방식이에요";
const GROWTH_VISIBILITY_INTENT = "growth-visibility";
const GROWTH_VISIBILITY_INVALID_ERROR = "성장 공개 설정이 올바르지 않아요";
const GROWTH_VISIBILITY_WRITE_ERROR = "성장 공개 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const CURRENT_STATE_INVALID_ERROR = "학생 성장 상태 입력이 올바르지 않아요";
const CURRENT_STATE_CATALOG_ERROR = "학생 성장 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요";
const CURRENT_STATE_WRITE_ERROR = "학생 성장 상태를 저장하지 못했어요. 잠시 후 다시 시도해 주세요";

const currentStateFieldKeys = [
  "level",
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
] as const satisfies (keyof RecruitedStudentCurrentStatePatch)[];

type CurrentStateActionData =
  | { intent: typeof CURRENT_STATE_INTENT; success: true }
  | { intent: typeof CURRENT_STATE_INTENT; error: string }
  | { intent: typeof GROWTH_VISIBILITY_INTENT; success: true; growthVisibility: boolean }
  | { intent: typeof GROWTH_VISIBILITY_INTENT; error: string }
  | { success: true }
  | { error: string };
type GrowthVisibilityActionData =
  | { intent: typeof GROWTH_VISIBILITY_INTENT; success: true; growthVisibility: boolean }
  | { intent: typeof GROWTH_VISIBILITY_INTENT; error: string };

type GrowthVisibilityFetcherState = "idle" | "submitting" | "loading";

export function resolveGrowthVisibility(
  loaderGrowthVisibility: boolean,
  fetcherState: GrowthVisibilityFetcherState,
  activeRequestValue?: boolean,
): boolean {
  return fetcherState !== "idle" && activeRequestValue !== undefined ? activeRequestValue : loaderGrowthVisibility;
}

type BatchActionResult = { success: true } | { error: string };

function parseBatchAddPayload(formData: FormData): { items: RecruitedStudentBatchInput[] } | { error: string } {
  const studentUids = formData.getAll("studentUids");
  const tiers = formData.getAll("tiers");
  if (studentUids.length !== tiers.length) {
    return { error: BATCH_INVALID_ERROR };
  }

  const items: RecruitedStudentBatchInput[] = [];
  const uniqueStudentUids = new Set<string>();
  for (let index = 0; index < studentUids.length; index += 1) {
    const studentUid = studentUids[index];
    const tierValue = tiers[index];
    if (typeof studentUid !== "string" || typeof tierValue !== "string") {
      return { error: BATCH_INVALID_ERROR };
    }

    const normalizedStudentUid = studentUid.trim();
    const tier = Number(tierValue);
    if (
      normalizedStudentUid === "" ||
      !/^[1-9]$/.test(tierValue.trim()) ||
      !Number.isInteger(tier) ||
      tier < 1 ||
      tier > 9
    ) {
      return { error: BATCH_INVALID_ERROR };
    }

    uniqueStudentUids.add(normalizedStudentUid);
    items.push({ studentUid: normalizedStudentUid, tier });
  }

  if (uniqueStudentUids.size > MAX_RECRUITED_STUDENT_BATCH_SIZE) {
    return { error: BATCH_INVALID_ERROR };
  }
  return { items };
}

function parseNullableCurrentStateValue(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    throw new RecruitedStudentValidationError(CURRENT_STATE_INVALID_ERROR);
  }
  return Number(value.trim());
}

function parseCurrentStatePayload(
  formData: FormData,
): { studentUid: string; patch: RecruitedStudentCurrentStatePatch } | { error: string } {
  const rawStudentUid = formData.get("studentUid");
  const rawTier = formData.get("tier");
  if (typeof rawStudentUid !== "string" || rawStudentUid.trim() === "") {
    return { error: CURRENT_STATE_INVALID_ERROR };
  }

  const hiddenFields = ["weaponLevel", "equip1Level", "equip2Level", "equip3Level"];
  if (hiddenFields.some((field) => formData.has(field))) {
    return { error: CURRENT_STATE_INVALID_ERROR };
  }
  if (rawTier != null) {
    if (typeof rawTier !== "string" || !/^\d+$/.test(rawTier.trim())) {
      return { error: CURRENT_STATE_INVALID_ERROR };
    }
    const tier = Number(rawTier.trim());
    if (!Number.isInteger(tier) || tier < 1 || tier > 9) {
      return { error: CURRENT_STATE_INVALID_ERROR };
    }
  }

  const patch: RecruitedStudentCurrentStatePatch = {};
  if (rawTier != null) patch.tier = Number(rawTier.trim());
  try {
    for (const field of currentStateFieldKeys) {
      if (formData.has(field)) {
        patch[field] = parseNullableCurrentStateValue(formData.get(field));
      }
    }
  } catch (error) {
    if (error instanceof RecruitedStudentValidationError) return { error: error.message };
    return { error: CURRENT_STATE_INVALID_ERROR };
  }

  if (Object.keys(patch).length === 0) return { error: CURRENT_STATE_INVALID_ERROR };
  return { studentUid: rawStudentUid.trim(), patch };
}

type StudentDetailData = NonNullable<Awaited<ReturnType<typeof getStudentDetailData>>>;

function getCurrentStateEquipmentMaxLevels(
  student: NonNullable<StudentDetailData["student"]>,
  studentCatalog: NonNullable<StudentDetailData["studentCatalog"]>,
): RecruitedStudentCurrentStatePatchOptions["equipmentMaxLevelsByTier"] {
  if (!studentCatalog) return [new Map(), new Map(), new Map()];
  return [0, 1, 2].map((index) => {
    const category = student.equipments[index];
    return new Map(
      studentCatalog.equipment
        .filter((equipment) => equipment.category === category)
        .map((equipment) => [equipment.tier, equipment.maxLevel] as const),
    );
  }) as [Map<number, number>, Map<number, number>, Map<number, number>];
}

function isSuccessfulBatchResult(value: unknown): value is BatchActionResult & { success: true } {
  return typeof value === "object" && value !== null && "success" in value && value.success === true;
}

function getBatchFailureMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value && typeof value.error === "string") {
    return value.error;
  }
  return STUDENT_WRITE_ERROR;
}

function reportStudentActionError(
  logger: ReturnType<typeof getLogger>,
  error: unknown,
  operation: string,
  context: Record<string, unknown> = {},
) {
  const errorContext = {
    route: "username.students.action",
    operation,
    ...context,
  };
  logger.error("Recruited student action failed", error, errorContext);
  captureServerError(error, errorContext);
}

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "username.students.action" });
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return data({ error: LOGIN_REQUIRED_ERROR }, { status: 401 });
  }

  const sensei = await getRouteSensei(env, params, currentUser.id, { ctx });
  if (currentUser.id !== sensei.id) {
    return data({ error: FORBIDDEN_ERROR }, { status: 403 });
  }

  if (request.method !== "POST" && request.method !== "DELETE") {
    return data({ error: METHOD_NOT_ALLOWED_ERROR }, { status: 405 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  if (request.method === "POST" && intent === GROWTH_VISIBILITY_INTENT) {
    const rawVisibility = formData.get("growthVisibility");
    const growthVisibility =
      rawVisibility === "on" || rawVisibility === "true"
        ? true
        : rawVisibility === "off" || rawVisibility === "false"
          ? false
          : null;
    if (growthVisibility === null) {
      return data<CurrentStateActionData>(
        { intent: GROWTH_VISIBILITY_INTENT, error: GROWTH_VISIBILITY_INVALID_ERROR },
        { status: 400 },
      );
    }

    try {
      const result = await updateSensei(env, sensei.id, { growthVisibility }, { ctx });
      if (result.error) {
        return data<CurrentStateActionData>(
          { intent: GROWTH_VISIBILITY_INTENT, error: GROWTH_VISIBILITY_WRITE_ERROR },
          { status: 500 },
        );
      }
      return data<CurrentStateActionData>({ intent: GROWTH_VISIBILITY_INTENT, success: true, growthVisibility });
    } catch (error) {
      reportStudentActionError(logger, error, "growth-visibility-write");
      return data<CurrentStateActionData>(
        { intent: GROWTH_VISIBILITY_INTENT, error: GROWTH_VISIBILITY_WRITE_ERROR },
        { status: 500 },
      );
    }
  }

  if (request.method === "POST" && intent === CURRENT_STATE_INTENT) {
    const currentStatePayload = parseCurrentStatePayload(formData);
    if ("error" in currentStatePayload) {
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: currentStatePayload.error },
        { status: 400 },
      );
    }

    let releasedStudents: Awaited<ReturnType<typeof getAllStudentsMap>>;
    try {
      releasedStudents = await getAllStudentsMap(env, true);
    } catch (error) {
      reportStudentActionError(logger, error, "current-state-catalog");
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: CURRENT_STATE_CATALOG_ERROR },
        { status: 500 },
      );
    }
    if (Object.keys(releasedStudents).length === 0) {
      reportStudentActionError(logger, new Error("Released student catalog is empty"), "current-state-catalog", {
        catalogSize: 0,
      });
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: CURRENT_STATE_CATALOG_ERROR },
        { status: 500 },
      );
    }

    const student = releasedStudents[currentStatePayload.studentUid];
    if (!student) {
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: STUDENT_NOT_FOUND_ERROR },
        { status: 400 },
      );
    }
    if (!student.released) {
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: "출시되지 않은 학생이에요" },
        { status: 400 },
      );
    }

    let recruitedStudent: Awaited<ReturnType<typeof getRecruitedStudents>>[number] | undefined;
    let studentDetailData: Awaited<ReturnType<typeof getStudentDetailData>>;
    try {
      recruitedStudent = (await getRecruitedStudents(env, sensei.id, [currentStatePayload.studentUid]))[0];
      if (!recruitedStudent) {
        return data<CurrentStateActionData>(
          { intent: CURRENT_STATE_INTENT, error: "모집한 학생만 성장 상태를 저장할 수 있어요" },
          { status: 400 },
        );
      }
      studentDetailData = await getStudentDetailData(env, currentStatePayload.studentUid);
    } catch (error) {
      reportStudentActionError(logger, error, "current-state-catalog");
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: CURRENT_STATE_CATALOG_ERROR },
        { status: 500 },
      );
    }

    if (!studentDetailData?.student || !studentDetailData.studentCatalog) {
      reportStudentActionError(logger, new Error("Student detail catalog is unavailable"), "current-state-catalog");
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: CURRENT_STATE_CATALOG_ERROR },
        { status: 500 },
      );
    }

    const tier = currentStatePayload.patch.tier ?? recruitedStudent.tier;
    if (tier < student.initialTier) {
      return data<CurrentStateActionData>(
        {
          intent: CURRENT_STATE_INTENT,
          error: `성급은 최초 성급인 ${student.initialTier}성보다 낮게 설정할 수 없어요`,
        },
        { status: 400 },
      );
    }

    const detailStudent = studentDetailData.student;
    const gearAvailable = detailStudent.catalog?.gear != null;
    if (Object.hasOwn(currentStatePayload.patch, "equipSpecial") && !gearAvailable) {
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: "애용품 정보를 확인하지 못했어요" },
        { status: 400 },
      );
    }

    for (const [index, key] of ["equip1", "equip2", "equip3"].entries()) {
      if (!Object.hasOwn(currentStatePayload.patch, key)) continue;
      const equipmentTier = currentStatePayload.patch[key as "equip1" | "equip2" | "equip3"];
      if (equipmentTier == null) continue;
      const category = detailStudent.equipments[index];
      const equipment = studentDetailData.studentCatalog.equipment.find(
        (candidate) => candidate.category === category && candidate.tier === equipmentTier,
      );
      if (!equipment) {
        return data<CurrentStateActionData>(
          { intent: CURRENT_STATE_INTENT, error: `장비 ${index + 1} 정보를 확인하지 못했어요` },
          { status: 400 },
        );
      }
    }

    const abilityAvailable = getWeaponLevelMaxByTier(tier) > 0 && detailStudent.catalog?.weapon != null;
    const abilityFields = ["abilityHp", "abilityAtk", "abilityHeal"] as const;
    if (!abilityAvailable && abilityFields.some((field) => Object.hasOwn(currentStatePayload.patch, field))) {
      const hasValue = abilityFields.some(
        (field) => currentStatePayload.patch[field] != null && currentStatePayload.patch[field] > 0,
      );
      if (hasValue) {
        return data<CurrentStateActionData>(
          { intent: CURRENT_STATE_INTENT, error: "능력 개방 정보를 확인하지 못했어요" },
          { status: 400 },
        );
      }
    }

    const equipmentMaxLevelsByTier = getCurrentStateEquipmentMaxLevels(detailStudent, studentDetailData.studentCatalog);
    try {
      await patchRecruitedStudentCurrentState(
        env,
        sensei.id,
        currentStatePayload.studentUid,
        currentStatePayload.patch,
        {
          equipmentMaxLevelsByTier,
        },
      );
      return data<CurrentStateActionData>({ intent: CURRENT_STATE_INTENT, success: true });
    } catch (error) {
      if (error instanceof RecruitedStudentValidationError) {
        return data<CurrentStateActionData>({ intent: CURRENT_STATE_INTENT, error: error.message }, { status: 400 });
      }
      reportStudentActionError(logger, error, "current-state-write");
      return data<CurrentStateActionData>(
        { intent: CURRENT_STATE_INTENT, error: CURRENT_STATE_WRITE_ERROR },
        { status: 500 },
      );
    }
  }

  if (request.method === "POST" && intent === BATCH_ADD_INTENT) {
    const batchPayload = parseBatchAddPayload(formData);
    if ("error" in batchPayload) {
      return data({ error: batchPayload.error }, { status: 400 });
    }
    if (batchPayload.items.length === 0) {
      return data({ error: EMPTY_BATCH_ERROR }, { status: 400 });
    }

    let releasedStudents: Awaited<ReturnType<typeof getAllStudentsMap>>;
    try {
      releasedStudents = await getAllStudentsMap(env);
    } catch (error) {
      reportStudentActionError(logger, error, "batch-catalog");
      return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
    }
    if (Object.keys(releasedStudents).length === 0) {
      reportStudentActionError(logger, new Error("Released student catalog is empty"), "batch-catalog", {
        catalogSize: 0,
      });
      return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
    }
    if (batchPayload.items.some(({ studentUid }) => !releasedStudents[studentUid])) {
      return data({ error: STUDENT_NOT_FOUND_ERROR }, { status: 400 });
    }

    try {
      await addRecruitedStudents(env, sensei.id, batchPayload.items);
    } catch (error) {
      if (error instanceof RecruitedStudentValidationError) {
        return data({ error: BATCH_INVALID_ERROR }, { status: 400 });
      }
      reportStudentActionError(logger, error, "batch-write", { batchSize: batchPayload.items.length });
      return data({ error: STUDENT_WRITE_ERROR }, { status: 500 });
    }
    return data({ success: true });
  }

  const rawStudentUid = formData.get("studentUid");
  if (typeof rawStudentUid !== "string" || rawStudentUid.trim() === "") {
    return data({ error: STUDENT_REQUIRED_ERROR }, { status: 400 });
  }
  const studentUid = rawStudentUid.trim();

  if (request.method === "DELETE") {
    await removeRecruitedStudent(env, sensei.id, studentUid);
    return data({ success: true });
  }

  const rawTier = formData.get("tier");
  const tier = typeof rawTier === "string" && /^[1-9]$/.test(rawTier.trim()) ? Number(rawTier) : Number.NaN;
  if (!Number.isInteger(tier) || tier < 1 || tier > 9) {
    return data({ error: SINGLE_TIER_INVALID_ERROR }, { status: 400 });
  }

  let releasedStudents: Awaited<ReturnType<typeof getAllStudentsMap>>;
  try {
    releasedStudents = await getAllStudentsMap(env);
  } catch (error) {
    reportStudentActionError(logger, error, "single-catalog");
    return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
  }
  if (Object.keys(releasedStudents).length === 0) {
    reportStudentActionError(logger, new Error("Released student catalog is empty"), "single-catalog", {
      catalogSize: 0,
    });
    return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
  }
  if (!releasedStudents[studentUid]) {
    return data({ error: STUDENT_NOT_FOUND_ERROR }, { status: 400 });
  }

  try {
    await upsertRecruitedStudent(env, sensei.id, studentUid, tier);
  } catch (error) {
    if (error instanceof RecruitedStudentValidationError) {
      return data({ error: SINGLE_TIER_INVALID_ERROR }, { status: 400 });
    }
    reportStudentActionError(logger, error, "single-write");
    return data({ error: STUDENT_WRITE_ERROR }, { status: 500 });
  }
  return data({ success: true });
};

export default function UserPage() {
  const loaderData = useLoaderData<typeof loader>();
  const {
    filterState: initialFilterState,
    me,
    noRecruited,
    students,
    view,
    growthVisibility: loaderGrowthVisibility,
    canViewGrowth,
    profileVisibility,
    username,
  } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const [filterState, setFilterState] = usePersistentStudentFilterState({
    ...userStudentFilterCookieOptions,
    initialState: initialFilterState,
  });
  const filterStudents = useMemo(
    () => students.map((student) => ({ ...student, tier: student.tier ?? undefined })),
    [students],
  );
  const filteredUids = useMemo(
    () => getFilteredStudentUids(filterStudents, filterState),
    [filterStudents, filterState],
  );
  const studentMap = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
  const [recruitedStudents, unrecruitedStudents] = useMemo(() => {
    const filteredStudents = filteredUids.flatMap((uid) => {
      const student = studentMap.get(uid);
      return student ? [student] : [];
    });
    return [filteredStudents.filter(({ tier }) => tier !== null), filteredStudents.filter(({ tier }) => tier === null)];
  }, [studentMap, filteredUids]);

  const [editingStudentUid, setEditingStudentUid] = useState<string | null>(null);
  const [editingDirty, setEditingDirty] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!editingDirty) return false;
    return currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search;
  });

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("저장하지 않은 성장 상태가 있어요. 페이지를 벗어나시겠어요?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  useEffect(() => {
    if (!editingDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editingDirty]);

  const { setPanels } = useOutletContext<{
    setPanels: React.Dispatch<React.SetStateAction<PagePanelProps[]>>;
  }>();

  const [batchAddMode, setBatchAddMode] = useState(false);
  const [batchAddStudentUids, setBatchAddStudentUids] = useState<string[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchSubmittingRef = useRef(false);
  const batchDataAtSubmitRef = useRef<BatchActionResult | undefined>(undefined);

  const fetcher = useFetcher<Awaited<ReturnType<typeof action>>>();
  const batchFetcher = useFetcher<BatchActionResult>();
  const batchSubmitting = batchSubmittingRef.current || batchFetcher.state !== "idle";

  useEffect(() => {
    if (!batchSubmittingRef.current || batchFetcher.state !== "idle") return;
    if (batchFetcher.data === batchDataAtSubmitRef.current) return;

    batchSubmittingRef.current = false;
    if (isSuccessfulBatchResult(batchFetcher.data)) {
      setBatchAddStudentUids([]);
      setBatchAddMode(false);
      return;
    }
    setBatchError(getBatchFailureMessage(batchFetcher.data));
  }, [batchFetcher.data, batchFetcher.state]);

  const growthFetcher = useFetcher<GrowthVisibilityActionData>();
  const growthSubmitRef = useRef<boolean | null>(null);
  const [growthStatus, setGrowthStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [growthError, setGrowthError] = useState<string | null>(null);
  const growthSaving = growthFetcher.state !== "idle";
  const growthVisibility = resolveGrowthVisibility(
    loaderGrowthVisibility,
    growthFetcher.state,
    growthSubmitRef.current ?? undefined,
  );

  useEffect(() => {
    if (growthSubmitRef.current === null || growthFetcher.state !== "idle") return;
    growthSubmitRef.current = null;
    if (!growthFetcher.data) {
      setGrowthStatus("error");
      setGrowthError(GROWTH_VISIBILITY_WRITE_ERROR);
    } else if (growthFetcher.data.intent === GROWTH_VISIBILITY_INTENT && "growthVisibility" in growthFetcher.data) {
      setGrowthStatus("saved");
      setGrowthError(null);
    } else {
      setGrowthStatus("error");
      setGrowthError(
        growthFetcher.data.intent === GROWTH_VISIBILITY_INTENT && "error" in growthFetcher.data
          ? growthFetcher.data.error
          : GROWTH_VISIBILITY_WRITE_ERROR,
      );
    }
  }, [growthFetcher.data, growthFetcher.state]);

  const handleGrowthVisibilityChange = useCallback(
    (enabled: boolean) => {
      if (growthSaving) return;
      const formData = new FormData();
      formData.set("intent", GROWTH_VISIBILITY_INTENT);
      formData.set("growthVisibility", enabled ? "on" : "off");
      growthSubmitRef.current = enabled;
      setGrowthStatus("saving");
      setGrowthError(null);
      growthFetcher.submit(formData, { method: "post" });
    },
    [growthFetcher, growthSaving],
  );

  const panels = useMemo<PagePanelProps[]>(() => {
    const nextPanels: PagePanelProps[] = [
      {
        title: "필터 및 정렬",
        description: `${students.length}명 중 ${filteredUids.length}명 표시 중`,
        Icon: FunnelIcon,
        children: (
          <fieldset disabled={editingStudentUid !== null} className="contents">
            <StudentFilter
              students={filterStudents}
              state={filterState}
              onStateChange={setFilterState}
              useFilter
              useSearch
              sortBy={[...USER_STUDENT_FILTER_SORTS]}
            />
          </fieldset>
        ),
      },
    ];

    if (me) {
      nextPanels.push({
        title: "성장 상태 공개",
        Icon: EyeIcon,
        children: (
          <GrowthVisibilityControl
            enabled={growthVisibility}
            saving={growthSaving}
            status={growthStatus}
            error={growthError}
            onChange={handleGrowthVisibilityChange}
          />
        ),
      });
    }

    return nextPanels;
  }, [
    editingStudentUid,
    filterState,
    filteredUids.length,
    filterStudents,
    growthError,
    growthSaving,
    growthStatus,
    growthVisibility,
    handleGrowthVisibilityChange,
    me,
    setFilterState,
    students.length,
  ]);

  useEffect(() => {
    setPanels(panels);
  }, [panels, setPanels]);

  useEffect(() => {
    return () => setPanels([]);
  }, [setPanels]);

  const handleAddStudent = (studentUid: string, tier: number) => {
    const formData = new FormData();
    formData.append("studentUid", studentUid);
    formData.append("tier", tier.toString());
    fetcher.submit(formData, { method: "post" });
  };

  const handleRemoveStudent = (studentUid: string) => {
    const formData = new FormData();
    formData.append("studentUid", studentUid);
    fetcher.submit(formData, { method: "delete" });
  };

  const changeView = (nextView: UserStudentsViewMode) => {
    if (editingStudentUid !== null || nextView === view) return;
    setSearchParams(nextView === "growth" ? { view: "growth" } : {});
  };

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.origin);
    url.pathname = `/@${username}/students`;
    url.searchParams.set("view", "growth");
    return url.toString();
  }, [username]);

  const growthStudents = recruitedStudents.filter(
    (student): student is typeof student & { growth: NonNullable<typeof student.growth>; tier: number } =>
      student.growth !== undefined && student.tier !== null,
  );
  const handleEditingDirtyChange = useCallback(
    (studentUid: string, dirty: boolean) => {
      if (editingStudentUid === studentUid) setEditingDirty(dirty);
    },
    [editingStudentUid],
  );

  return (
    <>
      {batchSubmitting ? (
        <div className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8 lg:bottom-4">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">학생을 등록 중이에요...</span>
        </div>
      ) : batchError ? (
        <div
          className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8 lg:bottom-4"
          role="alert"
        >
          <span className="text-sm font-medium">{batchError}</span>
          <button
            type="button"
            aria-label="학생 등록 오류 닫기"
            className="rounded p-0.5 text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 dark:text-neutral-700 dark:hover:text-neutral-900"
            onClick={() => setBatchError(null)}
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {me && (profileVisibility === "private" || growthVisibility) ? (
        <div className="my-6 space-y-3">
          {profileVisibility === "private" ? (
            <Callout
              tone="warning"
              title="프로필이 비공개라 성장 상태를 공유할 수 없어요."
              description="프로필 설정에서 공개로 바꾸면 공유 링크를 만들 수 있어요."
            >
              <Button text="프로필 설정" variant="secondary" size="xs" to="/edit" />
            </Callout>
          ) : growthVisibility ? (
            <ShareStudentGrowthButton url={shareUrl} disabled={editingStudentUid !== null} />
          ) : null}
        </div>
      ) : null}

      <div className="my-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SubTitle
          text="모집한 학생"
          description={
            me && !noRecruited
              ? view === "growth"
                ? "한 번에 한 학생의 현재 성장 상태를 편집할 수 있어요."
                : "학생을 선택해 성장 등급을 수정할 수 있어요."
              : undefined
          }
        />
        <fieldset disabled={editingStudentUid !== null || !canViewGrowth} className="shrink-0">
          <legend className="sr-only">학생부 보기 방식</legend>
          <FilterButtons
            buttonProps={[
              { text: "간략히", active: view === "summary", onToggle: () => changeView("summary") },
              { text: "성장 상세", active: view === "growth", onToggle: () => changeView("growth") },
            ]}
            exclusive
            atLeastOne
            size="sm"
            surface="page"
            className="my-0"
            buttonGroupClassName="justify-end"
          />
        </fieldset>
      </div>

      {noRecruited ? (
        <div className="my-16 text-center">아직 모집한 학생이 없어요</div>
      ) : view === "growth" ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
          {growthStudents.map((student) => (
            <StudentGrowthCard
              key={student.uid}
              student={student}
              editable={me}
              editDisabled={editingStudentUid !== null && editingStudentUid !== student.uid}
              editing={editingStudentUid === student.uid}
              onEdit={() => {
                if (editingStudentUid === null) setEditingStudentUid(student.uid);
              }}
              onCancel={() => {
                setEditingDirty(false);
                setEditingStudentUid(null);
              }}
              onSaved={() => {
                setEditingDirty(false);
                setEditingStudentUid(null);
              }}
              onDirtyChange={handleEditingDirtyChange}
            />
          ))}
        </div>
      ) : (
        <StudentCards
          layout="responsive-wrap"
          cardSize="lg"
          students={recruitedStudents.map(({ uid, name, attackType, defenseType, role, initialTier, tier }) => ({
            uid,
            name,
            attackType,
            defenseType,
            role,
            initialTier,
            tier,
            popups: [
              ...(me
                ? [
                    {
                      children: (
                        <TierSelector
                          initialTier={initialTier}
                          currentTier={tier}
                          onTierChange={(nextTier) => handleAddStudent(uid, nextTier)}
                        />
                      ),
                    },
                    {
                      Icon: MinusCircleIcon,
                      text: "모집한 학생에서 제외",
                      onClick: () => handleRemoveStudent(uid),
                    },
                  ]
                : []),
              {
                Icon: IdentificationIcon,
                text: "학생부 보기",
                link: `/students/${uid}`,
              },
            ],
          }))}
        />
      )}

      {editingStudentUid !== null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          현재 카드를 저장하거나 취소하면 다른 학생을 편집할 수 있어요.
        </p>
      ) : null}

      <div className="my-8">
        <SubTitle text="미모집 학생" description={me ? "학생을 선택해 모집 정보를 등록할 수 있어요." : undefined} />
        {me && (
          <>
            <Toggle
              label="모집한 학생 일괄 등록"
              initialState={batchAddMode}
              disabled={batchSubmitting || editingStudentUid !== null}
              onChange={setBatchAddMode}
            />
            {batchAddMode && (
              <div className="mb-2 flex gap-x-1">
                <Button
                  variant="primary"
                  disabled={batchAddStudentUids.length === 0 || batchSubmitting}
                  onClick={() => {
                    if (batchSubmittingRef.current || batchAddStudentUids.length === 0) return;

                    setBatchError(null);
                    const formData = new FormData();
                    formData.append("intent", BATCH_ADD_INTENT);
                    for (const uid of batchAddStudentUids) {
                      const student = studentMap.get(uid);
                      if (student) {
                        formData.append("studentUids", uid);
                        formData.append("tiers", student.initialTier.toString());
                      }
                    }
                    if (formData.getAll("studentUids").length === 0) {
                      setBatchError(STUDENT_NOT_FOUND_ERROR);
                      return;
                    }

                    batchDataAtSubmitRef.current = batchFetcher.data;
                    batchSubmittingRef.current = true;
                    batchFetcher.submit(formData, { method: "post" });
                  }}
                >
                  선택한 학생 등록
                </Button>
                {batchAddStudentUids.length > 0 ? (
                  <Button disabled={batchSubmitting} onClick={() => setBatchAddStudentUids([])}>
                    모두 해제
                  </Button>
                ) : (
                  <Button
                    disabled={batchSubmitting}
                    onClick={() => setBatchAddStudentUids(unrecruitedStudents.map((student) => student.uid))}
                  >
                    모두 선택
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        <StudentCards
          layout="responsive-wrap"
          cardSize="lg"
          students={unrecruitedStudents.map(({ uid, name, attackType, defenseType, role, initialTier }) => ({
            uid,
            name,
            attackType,
            defenseType,
            role,
            grayscale: true,
            checked: batchAddMode ? batchAddStudentUids.includes(uid) : undefined,
            popups: batchAddMode
              ? []
              : [
                  ...(me
                    ? [
                        {
                          Icon: PlusCircleIcon,
                          text: "모집한 학생에 추가",
                          onClick: () => handleAddStudent(uid, initialTier),
                        },
                      ]
                    : []),
                  {
                    Icon: IdentificationIcon,
                    text: "학생부 보기",
                    link: `/students/${uid}`,
                  },
                ],
          }))}
          onSelect={
            batchAddMode && !batchSubmitting && editingStudentUid === null
              ? (uid: string) => {
                  setBatchAddStudentUids((prev) => {
                    if (prev.includes(uid)) {
                      return prev.filter((each) => each !== uid);
                    }
                    return [...prev, uid];
                  });
                }
              : undefined
          }
        />
      </div>
    </>
  );
}
