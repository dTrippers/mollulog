import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  FunnelIcon,
  IdentificationIcon,
  LockClosedIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  VideoCameraIcon,
} from "@heroicons/react/16/solid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  data,
  useBlocker,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useRouteError,
  useSearchParams,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import { AsideLinks, PageActionBar, PanelAction, PanelSheet, useV2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { Popover } from "~/components/v2/primitives/Popover";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import {
  MAX_RECRUITED_STUDENT_BATCH_SIZE,
  STUDENT_GROWTH_EDIT_FIELDS,
  type StudentGrowthEditField,
  type StudentGrowthEditStudent,
  type StudentGrowthEditValues,
} from "~/domain/student-growth-edit";
import {
  isStaleStudentStateRequestError,
  STUDENT_STATE_STALE_CODE,
  STUDENT_STATE_STALE_MESSAGE,
} from "~/domain/student-state-errors";
import { isActionValidationError } from "~/lib/action-errors";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { useTrackGoogleAnalyticsSearch } from "~/lib/google-analytics-hooks";
import { withDirectionParticle, withObjectParticle } from "~/lib/korean";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { normalizeRouteError } from "~/lib/route-error";
import { cn } from "~/lib/utils";
import {
  addRecruitedStudents,
  type RecruitedStudentBatchInput,
  RecruitedStudentValidationError,
  removeRecruitedStudent,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { getStudentStateWriteMode } from "~/models/relationship-level";
import {
  getAllStudents,
  getAllStudentsMap,
  getStudentGrowthEquipmentCatalog,
  getStudentGrowthVisualsBatch,
} from "~/models/student";
import {
  type StudentBasicInfoBatchConflict,
  StudentBasicInfoBatchConflictError,
  type StudentBasicInfoBatchFieldError,
  StudentBasicInfoBatchValidationError,
  saveStudentBasicInfoBatch,
} from "~/models/student-basic-info";
import { getUserStudentsView, type UserStudent, type UserStudentsViewMode } from "~/views/user-students.server";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { useUserLayout } from "./$username._components/user-layout";
import {
  buildGrowthSavePayload,
  countGrowthChanges,
  type GrowthBaseline,
  type GrowthDraft,
  type GrowthRowErrors,
  setDraftValue,
  toGrowthRow,
  validateGrowthDraft,
} from "./$username.students._components/growth-edit-state";
import { ResultToast, type ResultToastState } from "./$username.students._components/ResultToast";
import ShareStudentGrowthButton, {
  SHARE_RESULT_MESSAGES,
} from "./$username.students._components/ShareStudentGrowthButton";
import { StudentGrowthTable } from "./$username.students._components/StudentGrowthTable";
import { StudentsFilterBody } from "./$username.students._components/StudentsFilterPanel";
import { type StudentActionFailure, StudentGrid } from "./$username.students._components/StudentsGrid";
import {
  applyStudentsFilter,
  clearStudentsFilters,
  hasActiveStudentsFilters,
  isSameStudentsFilterCookie,
  readStudentsFilterFromCookie,
  type StudentsFilterState,
  writeStudentsFilterCookie,
} from "./$username.students._components/students-filter";
import { formatTierForMessage } from "./$username.students._components/TierMark";

const BATCH_ADD_INTENT = "batch-add";
const SAVE_GROWTH_INTENT = "save-growth";
const BATCH_INVALID_ERROR = "학생 일괄 등록 요청이 올바르지 않아요";
const EMPTY_BATCH_ERROR = "등록할 학생을 선택해 주세요";
const LOGIN_REQUIRED_ERROR = "로그인이 필요해요";
const FORBIDDEN_ERROR = "본인 학생부만 수정할 수 있어요";
const STUDENT_REQUIRED_ERROR = "학생 정보가 필요해요";
const STUDENT_NOT_FOUND_ERROR = "존재하지 않는 학생이에요";
const STUDENT_CATALOG_ERROR = "학생 목록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요";
const STUDENT_WRITE_ERROR = "학생 등록에 실패했어요. 잠시 후 다시 시도해 주세요";
const STUDENT_REMOVE_ERROR = "학생을 제외하지 못했어요. 잠시 후 다시 시도해주세요.";
const SINGLE_TIER_INVALID_ERROR = "성급 범위가 올바르지 않아요";
const METHOD_NOT_ALLOWED_ERROR = "지원하지 않는 요청 방식이에요";
const GROWTH_PAYLOAD_ERROR = "저장할 값이 올바르지 않아요";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);

  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const requestedView: UserStudentsViewMode =
    new URL(request.url).searchParams.get("view") === "growth" ? "growth" : "summary";
  const isOwner = currentUser?.id === sensei.id;
  const [userStudents, stateFormat] = await Promise.all([
    getUserStudentsView(env, sensei, currentUser?.id, requestedView),
    // The owner's bulk save tells the server which stored format the table was read in.
    isOwner && requestedView === "growth" ? getStudentStateWriteMode(env) : Promise.resolve(null),
  ]);
  return {
    me: isOwner,
    noRecruited: userStudents.noRecruited,
    view: userStudents.view,
    growthVisibility: userStudents.growthVisibility,
    canViewGrowth: userStudents.canViewGrowth,
    filterState: readStudentsFilterFromCookie(request.headers.get("Cookie")),
    profileVisibility: sensei.profileVisibility,
    username: sensei.username,
    students: userStudents.students,
    equipmentLimits: userStudents.equipmentLimits,
    stateFormat,
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

type BatchActionResult = { success: true } | { error: string };

type SaveGrowthResult =
  | { ok: true; saved: number }
  | { ok: false; code: typeof STUDENT_STATE_STALE_CODE; error: string }
  | { ok: false; code: "CONFLICT"; conflicts: StudentBasicInfoBatchConflict[] }
  | { ok: false; code: "INVALID"; errors: StudentBasicInfoBatchFieldError[] }
  | { ok: false; code: "FAILED"; error: string };

type ActionResult = BatchActionResult | SaveGrowthResult;

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

type GrowthSaveEntry = {
  studentUid: string;
  changes: Partial<StudentGrowthEditValues>;
  expected: Partial<StudentGrowthEditValues>;
};

function parseGrowthValues(value: unknown): Partial<StudentGrowthEditValues> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result: Partial<StudentGrowthEditValues> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (!(STUDENT_GROWTH_EDIT_FIELDS as readonly string[]).includes(field)) return null;
    if (fieldValue !== null && (typeof fieldValue !== "number" || !Number.isFinite(fieldValue))) return null;
    result[field as StudentGrowthEditField] = fieldValue;
  }
  return result;
}

function parseGrowthSavePayload(
  formData: FormData,
): { entries: GrowthSaveEntry[]; requestMode: "legacy" | "nullable" } | null {
  const stateFormat = formData.get("stateFormat");
  if (stateFormat !== "legacy" && stateFormat !== "nullable") return null;
  const raw = formData.get("entries");
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const entries: GrowthSaveEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const { studentUid, changes, expected } = item as Record<string, unknown>;
    const parsedChanges = parseGrowthValues(changes);
    const parsedExpected = parseGrowthValues(expected);
    if (typeof studentUid !== "string" || studentUid === "" || !parsedChanges || !parsedExpected) return null;
    if (Object.keys(parsedChanges).length === 0) return null;
    entries.push({ studentUid, changes: parsedChanges, expected: parsedExpected });
  }
  return { entries, requestMode: stateFormat };
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

async function saveGrowth(env: Env, logger: ReturnType<typeof getLogger>, senseiId: number, formData: FormData) {
  const payload = parseGrowthSavePayload(formData);
  if (!payload)
    return data<SaveGrowthResult>({ ok: false, code: "FAILED", error: GROWTH_PAYLOAD_ERROR }, { status: 400 });
  if (payload.entries.length === 0) {
    return data<SaveGrowthResult>({ ok: false, code: "FAILED", error: GROWTH_PAYLOAD_ERROR }, { status: 400 });
  }
  try {
    const studentUids = payload.entries.map((entry) => entry.studentUid);
    const [allStudents, growthVisuals, equipmentCatalog] = await Promise.all([
      getAllStudents(env),
      getStudentGrowthVisualsBatch(env, studentUids),
      getStudentGrowthEquipmentCatalog(env),
    ]);
    const catalogByUid = new Map(allStudents.map((student) => [student.uid, student]));
    const students = new Map<string, StudentGrowthEditStudent>();
    for (const studentUid of studentUids) {
      const student = catalogByUid.get(studentUid);
      const growthVisual = growthVisuals.get(studentUid);
      if (!student || !growthVisual) {
        return data<SaveGrowthResult>(
          {
            ok: false,
            code: "INVALID",
            errors: [{ studentUid, message: "학생 정보를 확인하지 못해서 저장하지 못했어요." }],
          },
          { status: 400 },
        );
      }
      students.set(studentUid, {
        initialTier: student.initialTier,
        equipments: student.equipments,
        gearAvailable: growthVisual.gearAvailable,
      });
    }
    await saveStudentBasicInfoBatch(env, senseiId, payload.entries, {
      requestMode: payload.requestMode,
      students,
      equipmentLimits: equipmentCatalog.map(({ category, tier, maxLevel }) => ({ category, tier, maxLevel })),
    });
    return data<SaveGrowthResult>({ ok: true, saved: payload.entries.length });
  } catch (error) {
    if (isStaleStudentStateRequestError(error)) {
      return data<SaveGrowthResult>(
        { ok: false, code: STUDENT_STATE_STALE_CODE, error: STUDENT_STATE_STALE_MESSAGE },
        { status: 409 },
      );
    }
    if (error instanceof StudentBasicInfoBatchConflictError) {
      return data<SaveGrowthResult>({ ok: false, code: "CONFLICT", conflicts: error.conflicts }, { status: 409 });
    }
    if (error instanceof StudentBasicInfoBatchValidationError) {
      return data<SaveGrowthResult>({ ok: false, code: "INVALID", errors: error.errors }, { status: 400 });
    }
    if (isActionValidationError(error)) {
      return data<SaveGrowthResult>({ ok: false, code: "FAILED", error: error.message }, { status: 400 });
    }
    reportStudentActionError(logger, error, "growth-save", { entryCount: payload.entries.length });
    return data<SaveGrowthResult>(
      { ok: false, code: "FAILED", error: "성장 상태를 저장하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
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
  if (request.method === "POST" && intent === SAVE_GROWTH_INTENT) {
    return saveGrowth(env, logger, sensei.id, formData);
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
    try {
      await removeRecruitedStudent(env, sensei.id, studentUid);
    } catch (error) {
      reportStudentActionError(logger, error, "single-remove");
      return data({ error: STUDENT_REMOVE_ERROR }, { status: 500 });
    }
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

const SCANNER_LINK = {
  title: "게임 화면 인식기",
  description: "게임 내 학생 리스트 화면을 녹화하여 학생 정보를 가져올 수 있어요",
  to: "/scanner/student",
} as const;

const DIRECTORY_LINK = {
  title: "학생부",
  description: "모든 학생의 프로필과 통계를 확인해요",
  to: "/students",
} as const;

const FILTER_PANEL_ID = "user-students-filter";

type QuickAction =
  | { kind: "tier"; student: UserStudent; tier: number }
  | { kind: "remove"; student: UserStudent }
  | { kind: "add"; student: UserStudent };

function isSuccess(value: ActionResult | undefined): boolean {
  if (!value) return false;
  return ("success" in value && value.success === true) || ("ok" in value && value.ok === true);
}

function displayName(student: UserStudent): string {
  // The map name is "시로코*테러": main name and the variant in parentheses, as the rest of the screens show it.
  const [main, variant] = student.name.split("*");
  return variant ? `${main}(${variant})` : (main ?? student.name);
}

// A save that stops on a student scrolls to that row, so the mark beside the name is in view.
function revealGrowthRow(uid: string | undefined) {
  if (!uid) return;
  requestAnimationFrame(() => {
    document.querySelector(`[data-growth-row="${CSS.escape(uid)}"]`)?.scrollIntoView({ block: "center" });
  });
}

const QUICK_FAILURE_MESSAGES = {
  tier: "성급을 저장하지 못했어요. 다시 시도해주세요.",
  remove: "모집한 학생에서 제외하지 못했어요. 다시 시도해주세요.",
  add: "모집한 학생에 추가하지 못했어요. 다시 시도해주세요.",
} as const;

export default function UserPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { me, noRecruited, students, view, canViewGrowth, profileVisibility, username, stateFormat } = loaderData;
  const layout = useUserLayout();
  const { stacked } = useV2Page();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const initialFilterRef = useRef(loaderData.filterState);
  const [filter, setFilterState] = useState<StudentsFilterState>(loaderData.filterState);
  const filterRef = useRef(filter);
  const setFilter = useCallback((updater: (current: StudentsFilterState) => StudentsFilterState) => {
    const next = updater(filterRef.current);
    if (!isSameStudentsFilterCookie(filterRef.current, next)) writeStudentsFilterCookie(next);
    filterRef.current = next;
    setFilterState(next);
  }, []);
  void initialFilterRef;

  const filteredStudents = useMemo(() => applyStudentsFilter(students, filter), [students, filter]);
  useTrackGoogleAnalyticsSearch(filter.search, me ? "my_students" : "students", filteredStudents.length);
  const recruitedStudents = useMemo(() => filteredStudents.filter(({ tier }) => tier !== null), [filteredStudents]);
  const unrecruitedStudents = useMemo(() => filteredStudents.filter(({ tier }) => tier === null), [filteredStudents]);
  const filtersActive = hasActiveStudentsFilters(filter);

  // ---- Toast ----
  const [toast, setToast] = useState<ResultToastState | null>(null);
  const toastIdRef = useRef(0);
  const showToast = useCallback((tone: ResultToastState["tone"], message: string) => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, tone, message });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // ---- Quick actions: tier, remove, add ----
  const quickFetcher = useFetcher<ActionResult>();
  const pendingActionRef = useRef<QuickAction | null>(null);
  const handledQuickDataRef = useRef<ActionResult | undefined>(undefined);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [failure, setFailure] = useState<StudentActionFailure | null>(null);
  const pendingUid = quickFetcher.state === "idle" ? null : (pendingActionRef.current?.student.uid ?? null);

  const submitQuickAction = (quickAction: QuickAction) => {
    pendingActionRef.current = quickAction;
    handledQuickDataRef.current = quickFetcher.data;
    setFailure(null);
    const formData = new FormData();
    formData.append("studentUid", quickAction.student.uid);
    if (quickAction.kind === "remove") {
      quickFetcher.submit(formData, { method: "delete" });
      return;
    }
    formData.append("tier", String(quickAction.kind === "tier" ? quickAction.tier : quickAction.student.initialTier));
    quickFetcher.submit(formData, { method: "post" });
  };

  useEffect(() => {
    const pending = pendingActionRef.current;
    if (!pending || quickFetcher.state !== "idle" || quickFetcher.data === handledQuickDataRef.current) return;
    handledQuickDataRef.current = quickFetcher.data;
    pendingActionRef.current = null;
    if (isSuccess(quickFetcher.data)) {
      setOpenUid(null);
      trackGoogleAnalyticsEvent("student_state_saved", { source: "manual", scope: "single" });
      if (pending.kind === "tier") {
        showToast(
          "success",
          `${withObjectParticle(displayName(pending.student))} ${withDirectionParticle(formatTierForMessage(pending.tier))} 저장했어요`,
        );
      } else if (pending.kind === "remove") {
        showToast("success", `${withObjectParticle(displayName(pending.student))} 모집한 학생에서 제외했어요`);
      } else {
        showToast("success", `${withObjectParticle(displayName(pending.student))} 모집한 학생에 추가했어요`);
      }
      return;
    }
    setFailure({ uid: pending.student.uid, message: QUICK_FAILURE_MESSAGES[pending.kind] });
  }, [quickFetcher.data, quickFetcher.state, showToast]);

  // ---- Batch registration ----
  const [batchMode, setBatchMode] = useState(false);
  const [batchUids, setBatchUids] = useState<ReadonlySet<string>>(new Set());
  const batchFetcher = useFetcher<ActionResult>();
  const batchSubmittingRef = useRef(false);
  const batchDataAtSubmitRef = useRef<ActionResult | undefined>(undefined);
  const batchSubmitting = batchSubmittingRef.current || batchFetcher.state !== "idle";
  const studentByUid = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);

  useEffect(() => {
    if (!batchSubmittingRef.current || batchFetcher.state !== "idle") return;
    if (batchFetcher.data === batchDataAtSubmitRef.current) return;
    batchSubmittingRef.current = false;
    if (isSuccess(batchFetcher.data)) {
      showToast("success", `학생 ${batchUids.size}명을 모집한 학생으로 등록했어요`);
      setBatchUids(new Set());
      setBatchMode(false);
      trackGoogleAnalyticsEvent("student_state_saved", { source: "manual", scope: "bulk" });
      return;
    }
    showToast("failure", "학생을 등록하지 못했어요. 다시 시도해주세요.");
  }, [batchFetcher.data, batchFetcher.state, batchUids, showToast]);

  const submitBatch = () => {
    if (batchSubmittingRef.current || batchUids.size === 0) return;
    const formData = new FormData();
    formData.append("intent", BATCH_ADD_INTENT);
    for (const uid of batchUids) {
      const student = studentByUid.get(uid);
      if (student) {
        formData.append("studentUids", uid);
        formData.append("tiers", String(student.initialTier));
      }
    }
    batchDataAtSubmitRef.current = batchFetcher.data;
    batchSubmittingRef.current = true;
    batchFetcher.submit(formData, { method: "post" });
  };

  const toggleBatchUid = (uid: string) =>
    setBatchUids((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  const batchOverLimit = batchUids.size > MAX_RECRUITED_STUDENT_BATCH_SIZE;

  // ---- Growth table: view and bulk edit ----
  const allRows = useMemo(
    () => students.flatMap((student) => (student.tier === null ? [] : (toGrowthRow(student) ?? []))),
    [students],
  );
  const rowByUid = useMemo(() => new Map(allRows.map((row) => [row.uid, row])), [allRows]);
  const visibleRows = useMemo(
    () => recruitedStudents.flatMap((student) => rowByUid.get(student.uid) ?? []),
    [recruitedStudents, rowByUid],
  );
  const growthView = view === "growth";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GrowthDraft>({});
  const [baseline, setBaseline] = useState<GrowthBaseline>({});
  const [conflicts, setConflicts] = useState<Record<string, Partial<Record<StudentGrowthEditField, number | null>>>>(
    {},
  );
  const [serverErrors, setServerErrors] = useState<Record<string, GrowthRowErrors>>({});
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const saveFetcher = useFetcher<ActionResult>();
  const savingRef = useRef(false);
  const saveDataAtSubmitRef = useRef<ActionResult | undefined>(undefined);
  const saving = savingRef.current || saveFetcher.state !== "idle";

  const clientErrors = useMemo(
    () => validateGrowthDraft(allRows, draft, baseline, loaderData.equipmentLimits),
    [allRows, draft, baseline, loaderData.equipmentLimits],
  );
  const errors = useMemo(() => {
    const merged: Record<string, GrowthRowErrors> = {};
    for (const [uid, rowErrors] of Object.entries(serverErrors)) merged[uid] = { ...rowErrors };
    for (const [uid, rowErrors] of Object.entries(clientErrors)) merged[uid] = { ...merged[uid], ...rowErrors };
    return merged;
  }, [clientErrors, serverErrors]);
  const errorCount = Object.values(errors).reduce((sum, rowErrors) => sum + Object.keys(rowErrors).length, 0);
  const conflictCount = Object.values(conflicts).reduce(
    (sum, rowConflicts) => sum + Object.keys(rowConflicts).length,
    0,
  );
  const changes = countGrowthChanges(draft);
  const dirty = editing && changes.values > 0;

  const exitEditing = useCallback(() => {
    setEditing(false);
    setDraft({});
    setBaseline({});
    setConflicts({});
    setServerErrors({});
    setSaveFailure(null);
    setFilterPopoverOpen(false);
  }, []);

  const handleValueChange = (uid: string, field: StudentGrowthEditField, value: number | null) => {
    const row = rowByUid.get(uid);
    if (!row) return;
    setDraft((current) => setDraftValue(current, row, baseline, field, value));
    setSaveFailure(null);
    const clearField = <T extends Record<string, unknown>>(map: Record<string, T>): Record<string, T> => {
      if (!map[uid] || !(field in map[uid])) return map;
      const { [field]: _removed, ...rest } = map[uid] as Record<string, unknown>;
      const next = { ...map };
      if (Object.keys(rest).length === 0) delete next[uid];
      else next[uid] = rest as T;
      return next;
    };
    setConflicts((current) => clearField(current));
    setServerErrors((current) => clearField(current));
  };

  const submitSave = (nextBaseline: GrowthBaseline, nextDraft: GrowthDraft) => {
    if (savingRef.current || stateFormat === null) return;
    const entries = buildGrowthSavePayload(nextDraft, allRows, nextBaseline);
    if (entries.length === 0) return;
    setSaveFailure(null);
    setConflicts({});
    setServerErrors({});
    saveDataAtSubmitRef.current = saveFetcher.data;
    savingRef.current = true;
    saveFetcher.submit(
      { intent: SAVE_GROWTH_INTENT, stateFormat, entries: JSON.stringify(entries) },
      { method: "post" },
    );
  };

  // The user accepts the values another screen stored: they become the baseline, and the user's own values stay.
  const saveOverConflicts = () => {
    const nextBaseline: GrowthBaseline = { ...baseline };
    let nextDraft = { ...draft };
    for (const [uid, rowConflicts] of Object.entries(conflicts)) {
      const row = rowByUid.get(uid);
      if (!row) continue;
      nextBaseline[uid] = { ...nextBaseline[uid], ...rowConflicts };
      for (const [field, current] of Object.entries(rowConflicts) as [StudentGrowthEditField, number | null][]) {
        if (nextDraft[uid]?.[field] === current)
          nextDraft = setDraftValue(nextDraft, row, nextBaseline, field, current);
      }
    }
    setBaseline(nextBaseline);
    setDraft(nextDraft);
    submitSave(nextBaseline, nextDraft);
  };

  useEffect(() => {
    if (!savingRef.current || saveFetcher.state !== "idle") return;
    if (saveFetcher.data === saveDataAtSubmitRef.current) return;
    savingRef.current = false;
    const result = saveFetcher.data;
    if (!result) {
      setSaveFailure("저장하지 못했어요. 입력한 값은 그대로 있어요. 다시 시도해주세요.");
      return;
    }
    if ("ok" in result && result.ok) {
      showToast("success", `학생 ${result.saved}명의 성장 상태를 저장했어요`);
      trackGoogleAnalyticsEvent("student_state_saved", { source: "manual", scope: "bulk" });
      exitEditing();
      return;
    }
    if ("code" in result && result.code === "CONFLICT") {
      const next: Record<string, Partial<Record<StudentGrowthEditField, number | null>>> = {};
      for (const conflict of result.conflicts) {
        next[conflict.studentUid] = { ...next[conflict.studentUid], [conflict.field]: conflict.current };
      }
      setConflicts(next);
      revealGrowthRow(Object.keys(next)[0]);
      return;
    }
    if ("code" in result && result.code === "INVALID") {
      const next: Record<string, GrowthRowErrors> = {};
      for (const error of result.errors) {
        // A message about the student as a whole sits on the tier cell, beside the name.
        const field = error.field ?? "tier";
        next[error.studentUid] = {
          ...next[error.studentUid],
          [field]: { field, message: error.message, ...(error.max !== undefined ? { max: error.max } : {}) },
        };
      }
      setServerErrors(next);
      revealGrowthRow(Object.keys(next)[0]);
      return;
    }
    setSaveFailure(
      "code" in result && result.code === STUDENT_STATE_STALE_CODE
        ? result.error
        : "저장하지 못했어요. 입력한 값은 그대로 있어요. 다시 시도해주세요.",
    );
  }, [saveFetcher.data, saveFetcher.state, exitEditing, showToast]);

  // Desktop edits the table at the full content width, so the Aside folds away while editing.
  const { setAsideCollapsed, setAsideContent, setMobileActions } = layout;
  useEffect(() => {
    setAsideCollapsed(editing && !stacked);
    return () => setAsideCollapsed(false);
  }, [editing, stacked, setAsideCollapsed]);

  // A stored view that cannot be edited any more (the owner left the growth view) closes the edit mode.
  useEffect(() => {
    if (editing && (!growthView || !me)) exitEditing();
  }, [editing, growthView, me, exitEditing]);

  // ---- Leaving with unsaved edits ----
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      `${currentLocation.pathname}${currentLocation.search}` !== `${nextLocation.pathname}${nextLocation.search}`,
  );
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // ---- Aside and mobile bar ----
  const resetFilters = useCallback(() => setFilter((current) => clearStudentsFilters(current)), [setFilter]);
  const hideMobileBar = stacked && (editing || (batchMode && batchUids.size > 0));
  useEffect(() => {
    setAsideContent(
      <>
        <PanelSheet
          panelId={FILTER_PANEL_ID}
          title="필터 및 정렬"
          description={`${students.length}명 중 ${filteredStudents.length}명 표시 중`}
          Icon={FunnelIcon}
          headerAction={
            filtersActive ? (
              <PanelAction variant="danger" onClick={resetFilters}>
                초기화
              </PanelAction>
            ) : undefined
          }
        >
          <StudentsFilterBody state={filter} onChange={setFilter} />
        </PanelSheet>
        <AsideLinks
          items={[
            { key: "students", Icon: IdentificationIcon, ...DIRECTORY_LINK, transition: "forward" },
            ...(me ? [{ key: "scanner", Icon: VideoCameraIcon, ...SCANNER_LINK, transition: "forward" as const }] : []),
          ]}
        />
      </>,
    );
    return () => setAsideContent(null);
  }, [setAsideContent, students.length, filteredStudents.length, filtersActive, resetFilters, filter, setFilter, me]);

  useEffect(() => {
    setMobileActions(
      hideMobileBar
        ? {}
        : {
            panels: [{ panelId: FILTER_PANEL_ID, title: "필터", Icon: FunnelIcon }],
            links: [
              {
                key: "students",
                title: DIRECTORY_LINK.title,
                Icon: IdentificationIcon,
                to: DIRECTORY_LINK.to,
                transition: "forward",
              },
              ...(me
                ? [
                    {
                      key: "scanner",
                      title: SCANNER_LINK.title,
                      Icon: VideoCameraIcon,
                      to: SCANNER_LINK.to,
                      transition: "forward" as const,
                    },
                  ]
                : []),
            ],
          },
    );
    return () => setMobileActions(null);
  }, [setMobileActions, hideMobileBar, me]);

  // ---- View ----
  const changeView = (nextView: UserStudentsViewMode) => {
    if (nextView === view) return;
    setSearchParams(nextView === "growth" ? { view: "growth" } : {});
  };
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.origin);
    url.pathname = `/@${username}/students`;
    url.searchParams.set("view", "growth");
    return url.toString();
  }, [username]);
  const loadingView =
    navigation.state === "loading" &&
    navigation.location.pathname === `/@${username}/students` &&
    navigation.location.search !== (searchParams.size > 0 ? `?${searchParams.toString()}` : "");

  const quickActions = {
    pendingUid,
    failure,
    onTierChange: (student: UserStudent, tier: number) => submitQuickAction({ kind: "tier", student, tier }),
    onRemove: (student: UserStudent) => submitQuickAction({ kind: "remove", student }),
    onAdd: (student: UserStudent) => submitQuickAction({ kind: "add", student }),
  };
  const gridMode = me ? ("owner" as const) : ("visitor" as const);
  const editBarFixed = stacked;

  const noMatches = filteredStudents.length === 0 && students.length > 0;
  const barClass = editBarFixed ? undefined : "mt-v2-group-gap";

  const dirtyMessage = `바꾼 값 ${changes.values}개가 아직 저장되지 않았어요. 나가면 입력한 값이 사라져요.`;

  return (
    <div
      className={cn(
        "min-w-0 space-y-v2-group-gap",
        (editing || (batchMode && batchUids.size > 0)) && stacked && "pb-24",
      )}
    >
      <ResultToast toast={toast} onClose={closeToast} aboveActionBar={stacked && (editing || batchMode)} />

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-7 items-center gap-1 rounded-md bg-v2-inset px-2 text-xs font-medium text-v2-fg-secondary">
            <PencilSquareIcon className="size-3.5" aria-hidden="true" />
            편집 중
          </span>
          {!stacked ? (
            <>
              <Button
                ref={filterTriggerRef}
                size="sm"
                aria-haspopup="dialog"
                aria-expanded={filterPopoverOpen}
                onClick={() => setFilterPopoverOpen((open) => !open)}
              >
                <FunnelIcon className="size-3.5" aria-hidden="true" />
                필터 및 정렬
              </Button>
              <Popover
                open={filterPopoverOpen}
                label="필터 및 정렬"
                onClose={() => setFilterPopoverOpen(false)}
                returnFocusRef={filterTriggerRef}
                className="max-h-[70dvh] w-80 overflow-y-auto"
              >
                <StudentsFilterBody state={filter} onChange={setFilter} />
              </Popover>
              <span className="text-xs text-v2-fg-tertiary">화살표 키로 입력칸 사이를 이동할 수 있어요.</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <ViewSwitch view={view} canViewGrowth={canViewGrowth} onChange={changeView} />
            {!canViewGrowth && !me ? (
              <span className="inline-flex items-center gap-1 text-xs text-v2-fg-tertiary">
                이 선생님은 학생 성장도를 공개하지 않았어요
              </span>
            ) : null}
          </div>
          {me && growthView && visibleRows.length > 0 ? (
            <div className="flex items-center gap-2">
              <ShareStudentGrowthButton
                url={shareUrl}
                profilePrivate={profileVisibility === "private"}
                onResult={(result) =>
                  showToast(result === "error" ? "failure" : "success", SHARE_RESULT_MESSAGES[result])
                }
              />
              <Button variant="primary" onClick={() => setEditing(true)} disabled={stateFormat === null}>
                <PencilSquareIcon className="size-4" aria-hidden="true" />
                편집
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {loadingView ? (
        <StudentsLoadingState />
      ) : growthView ? (
        noRecruited ? (
          <EmptySection title="아직 모집한 학생이 없어요" />
        ) : noMatches || visibleRows.length === 0 ? (
          <NoMatchesState onReset={resetFilters} />
        ) : (
          <>
            {!editing ? (
              <p className="text-xs text-v2-fg-tertiary">
                <span aria-hidden="true">–</span> 미입력 · 미장착: 장비를 장착하지 않음 · 빈칸: 해당 없음 · MAX: 최대
                레벨
              </p>
            ) : null}
            <StudentGrowthTable
              rows={visibleRows}
              mode={editing ? "edit" : "view"}
              stacked={stacked}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              draft={draft}
              baseline={baseline}
              errors={errors}
              conflicts={conflicts}
              disabled={saving}
              onValueChange={handleValueChange}
              getDetailHref={(uid) => (me ? `/students/${uid}#student-basic-info` : `/students/${uid}`)}
            />
            {editing && !stacked ? (
              <p className="text-xs text-v2-fg-tertiary">
                표를 가로로 스크롤하면 나머지 열을 볼 수 있어요. 학생 열은 고정돼요.
              </p>
            ) : null}
          </>
        )
      ) : (
        <>
          <section aria-labelledby="recruited-heading" className="space-y-3">
            <div>
              <h2 id="recruited-heading" className="text-lg font-semibold text-v2-fg">
                모집한 학생{" "}
                <span className="font-normal text-v2-fg-tertiary tabular-nums">{recruitedStudents.length}</span>
              </h2>
              {me && !noRecruited ? (
                <p className="mt-0.5 text-sm text-v2-fg-secondary">학생을 선택해 현재 성급을 수정할 수 있어요.</p>
              ) : null}
            </div>
            {noRecruited ? (
              <EmptySection
                title="아직 모집한 학생이 없어요"
                description={
                  me
                    ? '아래 미모집 학생에서 "모집한 학생 일괄 등록"을 켜면 여러 명을 한 번에 등록할 수 있어요.'
                    : undefined
                }
              />
            ) : recruitedStudents.length === 0 ? (
              <NoMatchesState onReset={resetFilters} />
            ) : (
              <StudentGrid
                students={recruitedStudents}
                mode={gridMode}
                openUid={openUid}
                onOpenChange={(uid) => {
                  setOpenUid(uid);
                  setFailure(null);
                }}
                actions={quickActions}
              />
            )}
          </section>

          <section aria-labelledby="unrecruited-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="unrecruited-heading" className="text-lg font-semibold text-v2-fg">
                미모집 학생{" "}
                <span className="font-normal text-v2-fg-tertiary tabular-nums">{unrecruitedStudents.length}</span>
              </h2>
              {me && unrecruitedStudents.length > 0 ? (
                <Switch
                  id="user-students-batch-register"
                  layout="inline"
                  label="모집한 학생 일괄 등록"
                  checked={batchMode}
                  disabled={batchSubmitting}
                  onCheckedChange={(checked) => {
                    setBatchMode(checked);
                    if (!checked) setBatchUids(new Set());
                    setOpenUid(null);
                  }}
                />
              ) : null}
            </div>
            {unrecruitedStudents.length === 0 ? (
              filtersActive ? (
                <NoMatchesState onReset={resetFilters} />
              ) : (
                <EmptySection title={students.length > 0 ? "모든 학생을 모집했어요" : "학생이 없어요"} plain />
              )
            ) : (
              <StudentGrid
                students={unrecruitedStudents}
                mode={gridMode}
                openUid={openUid}
                onOpenChange={(uid) => {
                  setOpenUid(uid);
                  setFailure(null);
                }}
                actions={quickActions}
                selectedUids={me && batchMode ? batchUids : undefined}
                onToggleSelect={me && batchMode && !batchSubmitting ? toggleBatchUid : undefined}
              />
            )}
            {me && batchMode ? (
              <PageActionBar
                placement={editBarFixed ? "fixed" : "sticky"}
                expandActions={editBarFixed}
                className={barClass}
                summary={
                  <span className="block">
                    {batchUids.size}명 선택됨
                    <span className="block text-xs font-normal text-v2-fg-tertiary">
                      {batchOverLimit
                        ? `한 번에 최대 ${MAX_RECRUITED_STUDENT_BATCH_SIZE}명까지 등록할 수 있어요.`
                        : "학생마다 초기 성급으로 등록돼요."}
                    </span>
                  </span>
                }
              >
                <Button
                  variant="text"
                  disabled={batchSubmitting || unrecruitedStudents.length === 0}
                  onClick={() => setBatchUids(new Set(unrecruitedStudents.map((student) => student.uid)))}
                >
                  모두 선택
                </Button>
                <Button
                  variant="text"
                  disabled={batchSubmitting || batchUids.size === 0}
                  onClick={() => setBatchUids(new Set())}
                >
                  모두 해제
                </Button>
                <Button
                  variant="primary"
                  disabled={batchSubmitting || batchUids.size === 0 || batchOverLimit}
                  onClick={submitBatch}
                >
                  {batchSubmitting ? (
                    <>
                      <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      등록 중…
                    </>
                  ) : (
                    "선택한 학생 등록"
                  )}
                </Button>
              </PageActionBar>
            ) : null}
          </section>
        </>
      )}

      {editing ? (
        <PageActionBar
          placement={editBarFixed ? "fixed" : "sticky"}
          expandActions={editBarFixed}
          className={barClass}
          summary={
            <span className="block">
              학생 {changes.students}명 · 바꾼 값 {changes.values}개
              {saving ? (
                <StatusNotice tone="neutral" Icon={ArrowPathIcon} className="mt-0.5 text-xs font-normal">
                  저장하는 중이에요…
                </StatusNotice>
              ) : conflictCount > 0 ? (
                <StatusNotice tone="warning" className="mt-0.5 text-xs font-normal">
                  편집하는 사이 다른 곳에서 바뀐 값이 {conflictCount}개 있어요.
                </StatusNotice>
              ) : errorCount > 0 ? (
                <StatusNotice tone="danger" className="mt-0.5 text-xs font-normal">
                  확인할 입력값이 {errorCount}개 있어요.
                </StatusNotice>
              ) : saveFailure ? (
                <StatusNotice tone="danger" className="mt-0.5 text-xs font-normal">
                  {saveFailure}
                </StatusNotice>
              ) : null}
            </span>
          }
        >
          <Button
            disabled={saving}
            onClick={() => {
              if (dirty) setConfirmCancel(true);
              else exitEditing();
            }}
          >
            취소
          </Button>
          {conflictCount > 0 ? (
            <Button variant="primary" disabled={saving} onClick={saveOverConflicts}>
              입력한 값으로 저장
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={saving || changes.values === 0 || errorCount > 0}
              onClick={() => submitSave(baseline, draft)}
            >
              {saving ? "저장 중…" : saveFailure ? "다시 시도" : "저장"}
            </Button>
          )}
        </PageActionBar>
      ) : null}

      <Dialog
        open={blocker.state === "blocked" || confirmCancel}
        onClose={() => {
          if (blocker.state === "blocked") blocker.reset();
          setConfirmCancel(false);
        }}
        title="저장하지 않고 나갈까요?"
        size="sm"
      >
        <p className="text-sm text-v2-fg-secondary">{dirtyMessage}</p>
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              if (blocker.state === "blocked") blocker.reset();
              setConfirmCancel(false);
            }}
          >
            계속 편집
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (blocker.state === "blocked") {
                setDraft({});
                blocker.proceed();
              } else {
                exitEditing();
              }
              setConfirmCancel(false);
            }}
          >
            저장하지 않고 나가기
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function ViewSwitch({
  view,
  canViewGrowth,
  onChange,
}: {
  view: UserStudentsViewMode;
  canViewGrowth: boolean;
  onChange: (view: UserStudentsViewMode) => void;
}) {
  const options = [
    { key: "summary" as const, label: "간략히", Icon: Squares2X2Icon, disabled: false },
    {
      key: "growth" as const,
      label: "자세히",
      Icon: canViewGrowth ? Bars3BottomLeftIcon : LockClosedIcon,
      disabled: !canViewGrowth,
    },
  ];
  return (
    <fieldset className="m-0 inline-flex gap-1 rounded-lg bg-v2-inset p-1" aria-label="학생부 보기 방식">
      {options.map(({ key, label, Icon, disabled }) => (
        <button
          key={key}
          type="button"
          aria-pressed={view === key}
          disabled={disabled}
          onClick={() => onChange(key)}
          className={cn(
            "inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium",
            view === key ? "bg-v2-surface text-v2-fg shadow-sm" : "text-v2-fg-secondary hover:bg-v2-hover",
            "disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:hover:bg-transparent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </fieldset>
  );
}

function EmptySection({ title, description, plain = false }: { title: string; description?: string; plain?: boolean }) {
  return (
    <div className={cn("rounded-lg px-4 py-10 text-center", plain ? "py-4 text-left" : "bg-v2-surface")}>
      <p className={cn("text-sm", plain ? "text-v2-fg-secondary" : "font-semibold text-v2-fg")}>{title}</p>
      {description ? <p className="mt-1 text-xs text-v2-fg-tertiary">{description}</p> : null}
    </div>
  );
}

function NoMatchesState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-lg bg-v2-surface px-4 py-10 text-center">
      <p className="text-sm font-semibold text-v2-fg">조건에 맞는 학생이 없어요</p>
      <p className="mt-1 text-xs text-v2-fg-tertiary">필터를 바꾸거나 초기화해주세요.</p>
      <Button variant="danger-subtle" size="sm" className="mt-3" onClick={onReset}>
        필터 초기화
      </Button>
    </div>
  );
}

function StudentsLoadingState() {
  return (
    <div
      role="status"
      aria-label="학생 목록을 불러오는 중이에요"
      className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))]"
    >
      {Array.from({ length: 24 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed placeholder list
        <Skeleton key={index} className="aspect-[5/6] w-full rounded-md" />
      ))}
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  normalizeRouteError(error);
  return <LoadFailureState title="학생 목록을 불러오지 못했어요" onRetry={() => revalidator.revalidate()} />;
}
