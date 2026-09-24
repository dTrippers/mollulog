import { AdjustmentsHorizontalIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunctionArgs } from "react-router";
import { useLoaderData, useLocation, useNavigate, useNavigation } from "react-router";
import { RouteErrorBoundary } from "~/components/features/layout";
import { StudentSearchInput } from "~/components/features/students";
import { BottomSheet, Button, Callout, SectionCard, SubTitle } from "~/components/primitives";
import type {
  StudentCalculatedStat,
  StudentCalculatorCatalog,
  StudentCalculatorSource,
} from "~/domain/student-calculator";
import {
  calculateStudentComparisonStats,
  getStudentComparisonSettingsErrors,
  parseStudentComparisonSettings,
  type StudentComparisonSettingField,
  type StudentComparisonSettings,
  type StudentComparisonSide,
} from "~/domain/student-comparison";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import type { StudentComparisonStudent } from "~/models/student-comparison";
import { getStudentComparisonData } from "~/models/student-comparison";
import StudentComparisonSettingsEditor from "./students.compare._components/StudentComparisonSettingsEditor";
import StudentComparisonStudentSlot from "./students.compare._components/StudentComparisonStudentSlot";
import StudentComparisonTable from "./students.compare._components/StudentComparisonTable";

const sideKeys: readonly StudentComparisonSide[] = ["left", "right"];
const settingFields: readonly StudentComparisonSettingField[] = [
  "level",
  "tier",
  "bond",
  "equipmentTier",
  "includeSkillEffects",
];

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

export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
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
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [choosingSide, setChoosingSide] = useState<StudentComparisonSide | null>(null);
  const [settingsSide, setSettingsSide] = useState<StudentComparisonSide | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

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
    return {
      left: {
        ...leftUid,
        settings: parseStudentComparisonSettings(params, "left"),
        student: leftUid.uid ? (detailsByUid.get(leftUid.uid) ?? null) : null,
        uidError:
          leftUid.error ??
          (leftUid.uid && !directoryByUid.has(leftUid.uid) ? "학생을 찾지 못했어요." : null) ??
          (leftUid.uid && !detailsByUid.has(leftUid.uid) ? "학생 자료를 찾지 못했어요." : null) ??
          (hasSettingsWithoutStudent(params, "left") && leftUid.uid === null ? "학생을 먼저 선택해 주세요." : null),
        duplicate: false,
      },
      right: {
        ...rightUid,
        settings: parseStudentComparisonSettings(params, "right"),
        student: rightUid.uid && !duplicate ? (detailsByUid.get(rightUid.uid) ?? null) : null,
        uidError:
          rightUid.error ??
          (duplicate ? "같은 학생은 두 칸에 선택할 수 없어요." : null) ??
          (rightUid.uid && !directoryByUid.has(rightUid.uid) ? "학생을 찾지 못했어요." : null) ??
          (rightUid.uid && !detailsByUid.has(rightUid.uid) ? "학생 자료를 찾지 못했어요." : null) ??
          (hasSettingsWithoutStudent(params, "right") && rightUid.uid === null ? "학생을 먼저 선택해 주세요." : null),
        duplicate,
      },
    };
  }, [detailsByUid, directoryByUid, params]);

  const calculated = useMemo(() => {
    const calculate = (side: StudentComparisonSide) => {
      const slot = slotState[side];
      const settings = slot.settings.settings;
      const student = slot.student;
      const settingsErrors =
        student && settings ? getStudentComparisonSettingsErrors(student as StudentCalculatorSource, settings) : [];
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

  const closeChooser = useCallback(() => {
    if (!isMobile && choosingSide) {
      document.querySelector<HTMLButtonElement>('[aria-controls="student-comparison-chooser"]')?.focus();
    }
    setChoosingSide(null);
  }, [choosingSide, isMobile]);

  useEffect(() => {
    if (isMobile || choosingSide === null) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeChooser();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [choosingSide, closeChooser, isMobile]);

  const writeSearch = (nextParams: URLSearchParams, replace = true) => {
    const search = nextParams.toString();
    void navigate(`${location.pathname}${search ? `?${search}` : ""}`, { replace });
  };

  const selectStudent = (side: StudentComparisonSide, uid: string) => {
    const next = new URLSearchParams(location.search);
    next.set(side, uid);
    for (const field of settingFields) next.delete(`${side}.${field}`);
    writeSearch(next, false);
    setChoosingSide(null);
    setSettingsSide(null);
  };

  const updateSetting = <K extends StudentComparisonSettingField>(
    side: StudentComparisonSide,
    field: K,
    value: StudentComparisonSettings[K],
  ) => {
    const next = new URLSearchParams(location.search);
    const key = `${side}.${field}`;
    const defaultValue =
      field === "equipmentTier"
        ? null
        : field === "includeSkillEffects"
          ? false
          : field === "level"
            ? 90
            : field === "tier"
              ? 7
              : 100;
    if (value === defaultValue) next.delete(key);
    else next.set(key, String(value));
    writeSearch(next, true);
  };

  const resetSettings = (side: StudentComparisonSide) => {
    const next = new URLSearchParams(location.search);
    for (const field of settingFields) next.delete(`${side}.${field}`);
    writeSearch(next, true);
  };

  const renderSlot = (side: StudentComparisonSide) => {
    const slot = slotState[side];
    const calculatedSide = calculated[side];
    const student = slot.student;
    const settingsOpen = settingsSide === side;
    const settings = slot.settings.settings;
    return (
      <StudentComparisonStudentSlot
        key={side}
        side={side}
        isMobile={isMobile}
        student={student}
        uidError={slot.uidError}
        chooserOpen={choosingSide === side}
        settingsOpen={settingsOpen}
        settings={settings}
        invalidFields={slot.settings.invalidFields}
        settingsErrors={calculatedSide.settingsErrors}
        calculatorCatalog={data.catalog as StudentCalculatorCatalog | null}
        stats={calculatedSide.stats}
        calculationFailed={calculatedSide.failed}
        onOpenChooser={() => {
          setChoosingSide(side);
          setSettingsSide(null);
        }}
        onToggleSettings={() => {
          setChoosingSide(null);
          setSettingsSide((current) => (current === side ? null : side));
        }}
        onSettingChange={(field, value) => updateSetting(side, field, value)}
        onResetSettings={() => resetSettings(side)}
      />
    );
  };

  const activeSheetSide = settingsSide;
  const activeSheetSlot = activeSheetSide ? slotState[activeSheetSide] : null;
  const activeSheetStudent = activeSheetSlot?.student ?? null;
  const activeSheetSettings = activeSheetSlot?.settings.settings ?? null;
  const activeSheetCalculated = activeSheetSide ? calculated[activeSheetSide] : null;

  return (
    <>
      <SubTitle text="학생 비교" description="두 학생을 선택하고 각자의 성장도 설정을 조절해 능력치를 비교해보세요." />
      <SectionCard className="min-w-0 overflow-hidden p-3 md:p-5">
        <div className="grid grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-border pb-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div aria-hidden="true" />
          {renderSlot("left")}
          {renderSlot("right")}
        </div>
        {!isMobile && chooserSide && chooserSlot ? (
          <section
            id="student-comparison-chooser"
            aria-labelledby="student-comparison-chooser-title"
            className="mt-4 rounded-md bg-muted/50 p-3 md:p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="student-comparison-chooser-title" className="text-sm font-semibold text-foreground">
                {chooserSideLabel} 선택
              </h3>
              <Button text="취소" variant="secondary" size="xs" onClick={closeChooser} />
            </div>
            {chooserSlot.uidError ? (
              <Callout tone="destructive" title={chooserSlot.uidError} className="mb-3">
                학생을 선택하면 링크를 바로잡을 수 있어요.
              </Callout>
            ) : null}
            <StudentSearchInput
              key={chooserSide}
              ariaLabel={`${chooserSideLabel} 검색`}
              placeholder="학생 이름으로 찾기"
              size="sm"
              grid={6}
              mobileGrid={4}
              layout="responsive-wrap"
              cardSize="md"
              showNoResults
              students={chooserStudents}
              onSelect={(uid) => selectStudent(chooserSide, uid)}
            />
          </section>
        ) : null}
        {isNavigatingToSelection ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            학생 정보를 불러오고 있어요.
          </p>
        ) : null}
        {hasSelectedStudent && !data.catalog ? (
          <Callout tone="destructive" title="능력치 카탈로그를 불러오지 못했어요" />
        ) : null}
        <div className="mt-3 min-w-0">
          <StudentComparisonTable
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
            leftStats={formatStudentStatMap(calculated.left.stats)}
            rightStats={formatStudentStatMap(calculated.right.stats)}
            leftUnavailableReason={leftUnavailableReason}
            rightUnavailableReason={rightUnavailableReason}
          />
        </div>
      </SectionCard>

      {isMobile && chooserSide && chooserSlot ? (
        <BottomSheet
          Icon={MagnifyingGlassIcon}
          title={`${chooserSideLabel} 선택`}
          description="비교할 학생을 검색해 선택하세요."
          headerAction={<Button text="취소" variant="secondary" size="xs" onClick={closeChooser} />}
          onClose={closeChooser}
        >
          {chooserSlot.uidError ? (
            <Callout tone="destructive" title={chooserSlot.uidError} className="mb-3">
              학생을 선택하면 링크를 바로잡을 수 있어요.
            </Callout>
          ) : null}
          <StudentSearchInput
            key={chooserSide}
            ariaLabel={`${chooserSideLabel} 검색`}
            placeholder="학생 이름으로 찾기"
            size="sm"
            grid={6}
            mobileGrid={4}
            layout="responsive-wrap"
            cardSize="md"
            showNoResults
            students={chooserStudents}
            onSelect={(uid) => selectStudent(chooserSide, uid)}
          />
        </BottomSheet>
      ) : null}

      {isMobile && activeSheetSide && activeSheetSlot && activeSheetStudent && activeSheetCalculated ? (
        <BottomSheet
          Icon={AdjustmentsHorizontalIcon}
          title={activeSheetStudent.name}
          description="성장도 설정"
          onClose={() => setSettingsSide(null)}
        >
          {data.catalog ? (
            <StudentComparisonSettingsEditor
              student={activeSheetStudent}
              catalog={data.catalog as StudentCalculatorCatalog}
              settings={activeSheetSettings}
              invalidFields={activeSheetSlot.settings.invalidFields}
              settingsErrors={activeSheetCalculated.settingsErrors}
              stats={activeSheetCalculated.stats}
              calculationFailed={activeSheetCalculated.failed}
              showStatsPreview
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
