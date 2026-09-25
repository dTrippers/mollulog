import { AdjustmentsHorizontalIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData, useLocation, useNavigate, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RouteErrorBoundary } from "~/components/features/layout";
import { StudentSearchInput } from "~/components/features/students";
import { BottomSheet, Callout, SectionCard, SubTitle } from "~/components/primitives";
import type {
  StudentCalculatedStat,
  StudentCalculatorCatalog,
  StudentCalculatorSource,
} from "~/domain/student-calculator";
import {
  calculateStudentComparisonStats,
  DEFAULT_STUDENT_COMPARISON_SETTINGS,
  getDefaultStudentComparisonSettings,
  getStudentComparisonSettingsAfterTierChange,
  getStudentComparisonSettingsErrors,
  getStudentComparisonTerrainAdaptations,
  parseStudentComparisonSettings,
  resolveImportedStudentComparisonSettings,
  STUDENT_COMPARISON_SETTING_FIELDS,
  type StudentComparisonSettingField,
  type StudentComparisonSettings,
  type StudentComparisonSide,
  stripLegacyStudentComparisonSkillEffectParams,
} from "~/domain/student-comparison";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import type { StudentComparisonSavedGrowth, StudentComparisonStudent } from "~/models/student-comparison";
import { getStudentComparisonData, getStudentComparisonSavedGrowth } from "~/models/student-comparison";
import StudentComparisonSettingsEditor from "./students.compare._components/StudentComparisonSettingsEditor";
import StudentComparisonStudentSlot from "./students.compare._components/StudentComparisonStudentSlot";
import StudentComparisonTable from "./students.compare._components/StudentComparisonTable";

const sideKeys: readonly StudentComparisonSide[] = ["left", "right"];
const settingFields = STUDENT_COMPARISON_SETTING_FIELDS;

type StudentComparisonImportResult =
  | { kind: "success"; side: StudentComparisonSide; studentUid: string; state: StudentComparisonSavedGrowth }
  | { kind: "unavailable"; side: StudentComparisonSide; studentUid: string; message: string }
  | { kind: "error"; side: StudentComparisonSide | null; studentUid: string | null; message: string };

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const selectedUids = sideKeys.flatMap((side) => {
    const uid = url.searchParams.get(side);
    return uid && uid.length <= 128 && uid.trim() === uid ? [uid] : [];
  });
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "students.compare.loader" });

  try {
    return await getStudentComparisonData(env, selectedUids);
  } catch (error) {
    logger.error("Failed to load student comparison data", error);
    throw routeError(500, "student_comparison.load_failed", "학생 비교 자료를 불러오지 못했어요");
  }
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "students.compare.action" });
  if (request.method !== "POST") {
    return data<StudentComparisonImportResult>(
      { kind: "error", side: null, studentUid: null, message: "지원하지 않는 요청 방식이에요." },
      { status: 405 },
    );
  }

  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return data<StudentComparisonImportResult>(
      { kind: "error", side: null, studentUid: null, message: "내 학생 성장도를 가져오려면 로그인이 필요해요." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return data<StudentComparisonImportResult>(
      { kind: "error", side: null, studentUid: null, message: "요청 정보를 확인해 주세요." },
      { status: 400 },
    );
  }

  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const side = record?.side;
  const studentUid = record?.studentUid;
  if (
    (side !== "left" && side !== "right") ||
    typeof studentUid !== "string" ||
    studentUid.length === 0 ||
    studentUid.length > 128 ||
    studentUid.trim() !== studentUid
  ) {
    return data<StudentComparisonImportResult>(
      { kind: "error", side: null, studentUid: null, message: "학생 정보를 확인해 주세요." },
      { status: 400 },
    );
  }

  try {
    const state = await getStudentComparisonSavedGrowth(env, currentUser.id, studentUid);
    if (!state) {
      return data<StudentComparisonImportResult>(
        { kind: "unavailable", side, studentUid, message: "보유 학생의 저장된 성장도가 없어요." },
        { status: 404 },
      );
    }
    return data<StudentComparisonImportResult>({ kind: "success", side, studentUid, state });
  } catch (error) {
    logger.error("Failed to load saved student growth for comparison", error, {
      currentUserId: currentUser.id,
      studentUid,
    });
    return data<StudentComparisonImportResult>(
      { kind: "error", side, studentUid, message: "저장된 성장도를 불러오지 못했어요." },
      { status: 500 },
    );
  }
};

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
  formMethod,
}: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search && formMethod === "POST") {
    return false;
  }
  if (currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) {
    const selectionChanged = sideKeys.some(
      (side) => currentUrl.searchParams.get(side) !== nextUrl.searchParams.get(side),
    );
    if (!selectionChanged) return false;
  }
  return defaultShouldRevalidate;
}

export const meta: MetaFunction = ({ location }) => {
  const title = "학생 비교 | 몰루로그";
  const description = "두 학생의 능력치를 비교하고 학생별 성장도 설정을 조절해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const ErrorBoundary = RouteErrorBoundary;

function getUnavailableReason({
  uid,
  uidError,
  settings,
  settingsErrors,
  catalog,
  student,
  calculationFailed,
}: {
  uid: string | null;
  uidError: string | null;
  settings: StudentComparisonSettings | null;
  settingsErrors: string[];
  catalog: StudentCalculatorCatalog | null;
  student: StudentComparisonStudent | null;
  calculationFailed: boolean;
}): string | null {
  if (uidError) return "학생 확인 필요";
  if (uid === null) return null;
  if (!student) return "학생 확인 필요";
  if (!settings || settingsErrors.length > 0) return "설정 확인 필요";
  if (!catalog || !student.catalog) return "자료 없음";
  if (calculationFailed) return "계산할 수 없음";
  return null;
}

function getSlotUid(
  params: URLSearchParams,
  side: StudentComparisonSide,
): { uid: string | null; error: string | null } {
  if (!params.has(side)) return { uid: null, error: null };
  const uid = params.get(side);
  if (!uid || uid.trim() !== uid || uid.length > 128) {
    return { uid: null, error: "비교 링크의 학생 정보가 올바르지 않아요." };
  }
  return { uid, error: null };
}

function hasSettingsWithoutStudent(params: URLSearchParams, side: StudentComparisonSide): boolean {
  return settingFields.some((field) => params.has(`${side}.${field}`));
}

function formatStudentStatMap(stats: StudentCalculatedStat[] | null): Map<string, number> | null {
  return stats ? new Map(stats.map(({ stat, value }) => [stat, value])) : null;
}

export default function StudentComparisonPage() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const importFetcher = useFetcher<typeof action>();
  const handledImportResult = useRef<StudentComparisonImportResult | undefined>(undefined);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [choosingSide, setChoosingSide] = useState<StudentComparisonSide | null>(null);
  const [settingsSide, setSettingsSide] = useState<StudentComparisonSide | null>(null);
  const [importMessage, setImportMessage] = useState<{ side: StudentComparisonSide; message: string } | null>(null);
  const [pendingImportSide, setPendingImportSide] = useState<StudentComparisonSide | null>(null);

  const directoryByUid = useMemo(
    () => new Map(data.students.map((student) => [student.uid, student])),
    [data.students],
  );
  const detailsByUid = useMemo(
    () => new Map(data.selectedStudents.map((student) => [student.uid, student])),
    [data.selectedStudents],
  );
  const slotState = useMemo(() => {
    const leftUid = getSlotUid(params, "left");
    const rightUid = getSlotUid(params, "right");
    const duplicate = leftUid.uid !== null && rightUid.uid !== null && leftUid.uid === rightUid.uid;
    const leftStudent = leftUid.uid ? (detailsByUid.get(leftUid.uid) ?? null) : null;
    const rightStudent = rightUid.uid && !duplicate ? (detailsByUid.get(rightUid.uid) ?? null) : null;
    const leftDefaults =
      leftStudent?.catalog && data.catalog
        ? getDefaultStudentComparisonSettings(
            leftStudent as StudentCalculatorSource,
            data.catalog as StudentCalculatorCatalog,
          )
        : DEFAULT_STUDENT_COMPARISON_SETTINGS;
    const rightDefaults =
      rightStudent?.catalog && data.catalog
        ? getDefaultStudentComparisonSettings(
            rightStudent as StudentCalculatorSource,
            data.catalog as StudentCalculatorCatalog,
          )
        : DEFAULT_STUDENT_COMPARISON_SETTINGS;
    return {
      left: {
        ...leftUid,
        defaults: leftDefaults,
        settings: parseStudentComparisonSettings(params, "left", leftDefaults),
        student: leftStudent,
        uidError:
          leftUid.error ??
          (leftUid.uid && !directoryByUid.has(leftUid.uid) ? "학생을 찾지 못했어요." : null) ??
          (leftUid.uid && !detailsByUid.has(leftUid.uid) ? "학생 자료를 찾지 못했어요." : null) ??
          (hasSettingsWithoutStudent(params, "left") && leftUid.uid === null ? "학생을 먼저 선택해 주세요." : null),
        duplicate: false,
      },
      right: {
        ...rightUid,
        defaults: rightDefaults,
        settings: parseStudentComparisonSettings(params, "right", rightDefaults),
        student: rightStudent,
        uidError:
          rightUid.error ??
          (duplicate ? "같은 학생은 두 칸에 선택할 수 없어요." : null) ??
          (rightUid.uid && !directoryByUid.has(rightUid.uid) ? "학생을 찾지 못했어요." : null) ??
          (rightUid.uid && !detailsByUid.has(rightUid.uid) ? "학생 자료를 찾지 못했어요." : null) ??
          (hasSettingsWithoutStudent(params, "right") && rightUid.uid === null ? "학생을 먼저 선택해 주세요." : null),
        duplicate,
      },
    };
  }, [data.catalog, detailsByUid, directoryByUid, params]);

  const calculated = useMemo(() => {
    const calculate = (side: StudentComparisonSide) => {
      const slot = slotState[side];
      const settings = slot.settings.settings;
      const student = slot.student;
      const settingsErrors =
        student && settings && data.catalog
          ? getStudentComparisonSettingsErrors(
              student as StudentCalculatorSource,
              data.catalog as StudentCalculatorCatalog,
              settings,
            )
          : [];
      if (!student || !settings || slot.uidError || settingsErrors.length > 0 || !data.catalog || !student.catalog) {
        return { stats: null, failed: false, settingsErrors };
      }
      try {
        return {
          stats: calculateStudentComparisonStats(
            student as StudentCalculatorSource,
            data.catalog as StudentCalculatorCatalog,
            settings,
          ),
          failed: false,
          settingsErrors,
        };
      } catch {
        return { stats: null, failed: true, settingsErrors };
      }
    };
    return { left: calculate("left"), right: calculate("right") };
  }, [data.catalog, slotState]);

  const leftName = slotState.left.student?.name ?? null;
  const rightName = slotState.right.student?.name ?? null;
  const hasSelectedStudent = slotState.left.uid !== null || slotState.right.uid !== null;
  const leftUnavailableReason = getUnavailableReason({
    uid: slotState.left.uid,
    uidError: slotState.left.uidError,
    settings: slotState.left.settings.settings,
    settingsErrors: calculated.left.settingsErrors,
    catalog: data.catalog as StudentCalculatorCatalog | null,
    student: slotState.left.student,
    calculationFailed: calculated.left.failed,
  });
  const rightUnavailableReason = getUnavailableReason({
    uid: slotState.right.uid,
    uidError: slotState.right.uidError,
    settings: slotState.right.settings.settings,
    settingsErrors: calculated.right.settingsErrors,
    catalog: data.catalog as StudentCalculatorCatalog | null,
    student: slotState.right.student,
    calculationFailed: calculated.right.failed,
  });
  const terrainAdaptations = useMemo(() => {
    const getAdaptations = (side: StudentComparisonSide) => {
      const slot = slotState[side];
      const settings = slot.settings.settings;
      if (
        !slot.student?.catalog ||
        !data.catalog ||
        !settings ||
        slot.uidError ||
        calculated[side].settingsErrors.length > 0
      ) {
        return null;
      }
      try {
        return getStudentComparisonTerrainAdaptations(
          slot.student as StudentCalculatorSource,
          data.catalog as StudentCalculatorCatalog,
          settings,
        );
      } catch {
        return null;
      }
    };
    return { left: getAdaptations("left"), right: getAdaptations("right") };
  }, [calculated, data.catalog, slotState]);
  const isNavigatingToSelection = navigation.state === "loading" && navigation.location?.search !== location.search;
  const chooserSide = choosingSide;
  const chooserSlot = chooserSide ? slotState[chooserSide] : null;
  const chooserSideLabel = chooserSide === "left" ? "첫 번째 학생" : "두 번째 학생";
  const chooserStudents = useMemo(() => {
    if (!chooserSide) return [];
    const otherSide = chooserSide === "left" ? "right" : "left";
    const excludedUid = slotState[otherSide].uid;
    return data.students.filter((student) => student.uid !== excludedUid);
  }, [chooserSide, data.students, slotState]);

  const closeChooser = () => setChoosingSide(null);

  const writeSearch = (nextParams: URLSearchParams, replace = true) => {
    const search = stripLegacyStudentComparisonSkillEffectParams(nextParams).toString();
    void navigate(`${location.pathname}${search ? `?${search}` : ""}`, { replace });
  };

  const writeSideSettings = useCallback(
    (side: StudentComparisonSide, nextSettings: StudentComparisonSettings, replace = true) => {
      const next = new URLSearchParams(location.search);
      const defaults = slotState[side].defaults;
      for (const field of settingFields) {
        const value = nextSettings[field];
        if (Object.is(value, defaults[field])) next.delete(`${side}.${field}`);
        else next.set(`${side}.${field}`, value === null ? "none" : String(value));
      }
      const search = stripLegacyStudentComparisonSkillEffectParams(next).toString();
      void navigate(`${location.pathname}${search ? `?${search}` : ""}`, { replace });
    },
    [location.pathname, location.search, navigate, slotState],
  );

  const selectStudent = (side: StudentComparisonSide, uid: string) => {
    const next = new URLSearchParams(location.search);
    next.set(side, uid);
    for (const field of settingFields) next.delete(`${side}.${field}`);
    writeSearch(next, false);
    setChoosingSide(null);
    setSettingsSide(null);
    setImportMessage(null);
  };

  const updateSetting = <K extends StudentComparisonSettingField>(
    side: StudentComparisonSide,
    field: K,
    value: StudentComparisonSettings[K],
  ) => {
    const currentSettings = slotState[side].settings.settings ?? slotState[side].defaults;
    const nextSettings =
      field === "tier" && typeof value === "number"
        ? getStudentComparisonSettingsAfterTierChange({ ...currentSettings, [field]: value }, value)
        : { ...currentSettings, [field]: value };
    const equipmentLevelField = {
      equip1: "equip1Level",
      equip2: "equip2Level",
      equip3: "equip3Level",
    } as const;
    if (field in equipmentLevelField && typeof value === "number") {
      const index = Number(field.at(-1)) - 1;
      const category = slotState[side].student?.equipments[index];
      const equipment = category
        ? (data.catalog as StudentCalculatorCatalog | null)?.equipment.find(
            (candidate) => candidate.category === category && candidate.tier === value,
          )
        : undefined;
      const levelField = equipmentLevelField[field as keyof typeof equipmentLevelField];
      nextSettings[levelField] = equipment?.maxLevel ?? null;
    }
    writeSideSettings(side, nextSettings, true);
  };

  const resetSettings = (side: StudentComparisonSide) => {
    const next = new URLSearchParams(location.search);
    for (const field of settingFields) next.delete(`${side}.${field}`);
    writeSearch(next, true);
    setImportMessage(null);
  };

  const importSavedGrowth = (side: StudentComparisonSide) => {
    const student = slotState[side].student;
    if (!student) return;
    setPendingImportSide(side);
    setImportMessage({ side, message: "내 학생 성장도를 불러오고 있어요." });
    importFetcher.submit(
      { side, studentUid: student.studentVariant.primaryStudent.uid },
      { method: "post", encType: "application/json" },
    );
  };

  const renderSlot = (side: StudentComparisonSide) => {
    const slot = slotState[side];
    const calculatedSide = calculated[side];
    const student = slot.student;
    const settings = slot.settings.settings;
    return (
      <StudentComparisonStudentSlot
        key={side}
        side={side}
        student={student}
        uidError={slot.uidError}
        chooserOpen={choosingSide === side}
        settings={settings}
        equipmentCatalog={data.catalog?.equipment ?? null}
        settingsErrors={calculatedSide.settingsErrors}
        onOpenChooser={() => {
          setChoosingSide(side);
          setSettingsSide(null);
          setImportMessage(null);
        }}
        onOpenSettings={() => {
          setChoosingSide(null);
          setSettingsSide(side);
        }}
      />
    );
  };

  useEffect(() => {
    const result = importFetcher.data;
    if (!result || result === handledImportResult.current) return;
    handledImportResult.current = result;
    const side = result.kind === "error" ? (result.side ?? pendingImportSide) : result.side;
    setPendingImportSide(null);
    if (!side) return;

    if (result.kind === "unavailable" || result.kind === "error") {
      setImportMessage({ side, message: result.message });
      return;
    }

    const slot = slotState[side];
    const student = slot.student;
    if (!student || student.studentVariant.primaryStudent.uid !== result.studentUid) {
      setImportMessage({ side, message: "학생 선택이 바뀌어 성장도를 적용하지 않았어요. 다시 시도해 주세요." });
      return;
    }
    if (!data.catalog || !student.catalog) {
      setImportMessage({ side, message: "학생 능력치 자료를 불러오지 못해 성장도를 적용하지 않았어요." });
      return;
    }
    const settings = resolveImportedStudentComparisonSettings(
      student as StudentCalculatorSource,
      data.catalog as StudentCalculatorCatalog,
      result.state,
    );
    writeSideSettings(side, settings, true);
    setImportMessage({ side, message: "내 학생 성장도를 적용했어요." });
  }, [data.catalog, importFetcher.data, pendingImportSide, slotState, writeSideSettings]);

  const activeSheetSide = settingsSide;
  const activeSheetSlot = activeSheetSide ? slotState[activeSheetSide] : null;
  const activeSheetStudent = activeSheetSlot?.student ?? null;
  const activeSheetSettings = activeSheetSlot?.settings.settings ?? null;
  const activeSheetCalculated = activeSheetSide ? calculated[activeSheetSide] : null;

  return (
    <>
      <SubTitle text="학생 비교" description="두 학생을 선택하고 각자의 성장도 설정을 조절해 능력치를 비교해보세요." />
      <div className="mt-4 min-w-0 space-y-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {renderSlot("left")}
          {renderSlot("right")}
        </div>
        {isNavigatingToSelection ? (
          <p role="status" className="text-sm text-muted-foreground">
            학생 정보를 불러오고 있어요.
          </p>
        ) : null}
        {hasSelectedStudent && !data.catalog ? (
          <Callout tone="destructive" title="능력치 카탈로그를 불러오지 못했어요" />
        ) : null}
        <SectionCard className="min-w-0 p-3 md:p-5">
          <StudentComparisonTable
            leftUid={slotState.left.student?.uid ?? null}
            rightUid={slotState.right.student?.uid ?? null}
            leftName={leftName}
            rightName={rightName}
            leftTypes={
              slotState.left.student
                ? {
                    attackType: slotState.left.student.attackType,
                    defenseType: slotState.left.student.defenseType,
                  }
                : null
            }
            rightTypes={
              slotState.right.student
                ? {
                    attackType: slotState.right.student.attackType,
                    defenseType: slotState.right.student.defenseType,
                  }
                : null
            }
            leftAdaptations={terrainAdaptations.left}
            rightAdaptations={terrainAdaptations.right}
            leftStats={formatStudentStatMap(calculated.left.stats)}
            rightStats={formatStudentStatMap(calculated.right.stats)}
            leftUnavailableReason={leftUnavailableReason}
            rightUnavailableReason={rightUnavailableReason}
          />
        </SectionCard>
      </div>

      {chooserSide && chooserSlot ? (
        <BottomSheet
          Icon={MagnifyingGlassIcon}
          title={`${chooserSideLabel} 선택`}
          description="비교할 학생을 검색해 선택하세요."
          onClose={closeChooser}
        >
          {chooserSlot.uidError ? (
            <Callout tone="destructive" title={chooserSlot.uidError} className="mb-3">
              학생을 선택하면 비교 링크를 바로잡을 수 있어요.
            </Callout>
          ) : null}
          <StudentSearchInput
            key={chooserSide}
            ariaLabel={`${chooserSideLabel} 검색`}
            placeholder="학생 이름으로 찾기"
            size="sm"
            grid={4}
            mobileGrid={4}
            layout="responsive-wrap"
            cardSize="md"
            showNoResults
            students={chooserStudents}
            onSelect={(uid) => selectStudent(chooserSide, uid)}
          />
        </BottomSheet>
      ) : null}

      {activeSheetSide && activeSheetSlot && activeSheetStudent && activeSheetCalculated ? (
        <BottomSheet
          Icon={AdjustmentsHorizontalIcon}
          title={activeSheetStudent.name}
          onClose={() => setSettingsSide(null)}
        >
          {data.catalog ? (
            <StudentComparisonSettingsEditor
              student={activeSheetStudent}
              catalog={data.catalog as StudentCalculatorCatalog}
              settings={activeSheetSettings}
              invalidFields={activeSheetSlot.settings.invalidFields}
              settingsErrors={activeSheetCalculated.settingsErrors}
              importMessage={importMessage?.side === activeSheetSide ? importMessage.message : null}
              isImporting={pendingImportSide === activeSheetSide && importFetcher.state !== "idle"}
              onImportSaved={() => importSavedGrowth(activeSheetSide)}
              onChange={(field, value) => updateSetting(activeSheetSide, field, value)}
              onReset={() => resetSettings(activeSheetSide)}
              onClose={() => setSettingsSide(null)}
            />
          ) : (
            <Callout tone="destructive" title="능력치 카탈로그를 불러오지 못했어요" />
          )}
        </BottomSheet>
      ) : null}
    </>
  );
}
