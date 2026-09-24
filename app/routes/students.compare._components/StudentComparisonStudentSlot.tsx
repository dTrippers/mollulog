import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { Button, Callout, ProfileImage } from "~/components/primitives";
import type { StudentCalculatedStat, StudentCalculatorCatalog } from "~/domain/student-calculator";
import type {
  StudentComparisonSettingField,
  StudentComparisonSettings,
  StudentComparisonSide,
} from "~/domain/student-comparison";
import type { StudentComparisonStudent } from "~/models/student-comparison";
import StudentComparisonSettingsEditor from "./StudentComparisonSettingsEditor";

type StudentComparisonStudentSlotProps = {
  side: StudentComparisonSide;
  isMobile: boolean;
  student: StudentComparisonStudent | null;
  uidError: string | null;
  chooserOpen: boolean;
  settingsOpen: boolean;
  settings: StudentComparisonSettings | null;
  invalidFields: StudentComparisonSettingField[];
  settingsErrors: string[];
  calculatorCatalog: StudentCalculatorCatalog | null;
  stats: StudentCalculatedStat[] | null;
  calculationFailed: boolean;
  onOpenChooser: () => void;
  onToggleSettings: () => void;
  onSettingChange: <K extends StudentComparisonSettingField>(field: K, value: StudentComparisonSettings[K]) => void;
  onResetSettings: () => void;
};

type SettingsSummary = { text: string; isError: boolean } | null;

function getSettingsSummary(settings: StudentComparisonSettings | null, settingsErrors: string[]): SettingsSummary {
  if (!settings || settingsErrors.length > 0) {
    return { text: "성장도 설정 확인 필요", isError: true };
  }

  const changed: string[] = [];
  if (settings.level !== 90) changed.push(`레벨 ${settings.level}`);
  if (settings.tier !== 7) changed.push(`${settings.tier}성`);
  if (settings.bond !== 100) changed.push(`인연 ${settings.bond}`);
  if (settings.equipmentTier !== null) changed.push(`장비 T${settings.equipmentTier}`);
  if (settings.includeSkillEffects) changed.push("스킬 효과 반영");

  return changed.length > 0 ? { text: changed.join(" · "), isError: false } : null;
}

export default function StudentComparisonStudentSlot({
  side,
  isMobile,
  student,
  uidError,
  chooserOpen,
  settingsOpen,
  settings,
  invalidFields,
  settingsErrors,
  calculatorCatalog,
  stats,
  calculationFailed,
  onOpenChooser,
  onToggleSettings,
  onSettingChange,
  onResetSettings,
}: StudentComparisonStudentSlotProps) {
  const sideLabel = side === "left" ? "첫 번째 학생" : "두 번째 학생";
  const studentName = student?.name ?? sideLabel;
  const summary = student ? getSettingsSummary(settings, settingsErrors) : null;
  const summaryId = `${side}-growth-settings-cue`;
  const growthSettingsId = `${side}-growth-settings`;
  const slotErrorId = `${side}-student-slot-error`;

  return (
    <section aria-labelledby={`${side}-student-title`} className={`min-w-0 ${side === "left" ? "pr-2" : ""}`}>
      <div className="min-w-0">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
          <span aria-hidden="true" className="shrink-0">
            <ProfileImage studentUid={student?.uid ?? null} imageSize={12} />
          </span>
          <div className="min-w-0">
            <h2
              id={`${side}-student-title`}
              className="line-clamp-2 break-keep text-sm font-semibold text-foreground [overflow-wrap:anywhere] md:text-base"
            >
              {studentName}
            </h2>
          </div>
        </div>

        <div className="mt-2 grid gap-1">
          <Button
            text={student ? "다른 학생 선택" : "학생 선택"}
            variant="secondary"
            size="xs"
            fullWidth
            className={chooserOpen ? "bg-muted dark:bg-background" : ""}
            aria-label={student ? `${student.name} 다른 학생 선택` : `${sideLabel} 선택`}
            aria-describedby={uidError && !chooserOpen ? slotErrorId : undefined}
            aria-expanded={chooserOpen}
            aria-controls={!isMobile && chooserOpen ? "student-comparison-chooser" : undefined}
            aria-haspopup={isMobile ? "dialog" : undefined}
            onClick={onOpenChooser}
          />
          {student?.catalog ? (
            <>
              <Button
                text="성장도 설정"
                icon={AdjustmentsHorizontalIcon}
                variant="secondary"
                size="xs"
                fullWidth
                className={settingsOpen ? "bg-muted dark:bg-background" : ""}
                aria-label={`${student.name} 성장도 설정`}
                aria-describedby={summary ? summaryId : undefined}
                aria-expanded={!isMobile ? settingsOpen : undefined}
                aria-controls={!isMobile ? growthSettingsId : undefined}
                aria-haspopup={isMobile ? "dialog" : undefined}
                onClick={onToggleSettings}
              />
              {summary ? (
                <p
                  id={summaryId}
                  className={`line-clamp-2 text-xs ${summary.isError ? "text-destructive" : "text-foreground"}`}
                >
                  {summary.text}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        {uidError && !chooserOpen ? (
          <p id={slotErrorId} className="mt-1 text-xs leading-tight text-destructive" role="alert">
            학생 정보 오류
          </p>
        ) : null}
        {student && !student.catalog ? (
          <p className="mt-1 text-xs text-muted-foreground">학생 능력치 자료 없음</p>
        ) : null}
        {student && settingsErrors.length > 0 ? (
          <p className="sr-only" role="alert">
            {settingsErrors.join(" ")}
          </p>
        ) : null}
      </div>

      {student?.catalog ? (
        <div
          id={growthSettingsId}
          className={settingsOpen ? "mt-3 hidden rounded-md bg-muted/50 p-3 md:block md:p-4" : "hidden"}
        >
          {settingsOpen ? (
            calculatorCatalog ? (
              <StudentComparisonSettingsEditor
                student={student}
                catalog={calculatorCatalog}
                settings={settings}
                invalidFields={invalidFields}
                settingsErrors={settingsErrors}
                stats={stats}
                calculationFailed={calculationFailed}
                showStatsPreview={false}
                onChange={onSettingChange}
                onReset={onResetSettings}
              />
            ) : (
              <Callout tone="destructive" title="능력치 카탈로그를 불러오지 못했어요" />
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
