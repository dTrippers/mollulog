import type { ReactNode } from "react";
import { ProfileImage } from "~/components/primitives";
import {
  compareStudentStats,
  STUDENT_COMPARISON_STATS,
  type StudentComparisonStats,
  type StudentComparisonTerrain,
} from "~/domain/student-comparison";
import type { Attack, Defense } from "~/graphql/graphql";
import { attackTypeColor, attackTypeLocale, defenseTypeColor, defenseTypeLocale } from "~/locales/ko";
import { terrainAdaptationIconUrl } from "~/models/assets";

type StudentComparisonTypes = {
  attackType: Attack;
  defenseType: Defense;
};

type SemanticColor = (typeof attackTypeColor)[Attack];

const semanticColorDotClass: Record<SemanticColor, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-green-600",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  grey: "bg-neutral-500",
};

type StudentComparisonTableProps = {
  leftUid: string | null;
  rightUid: string | null;
  leftName: string | null;
  rightName: string | null;
  leftTypes: StudentComparisonTypes | null;
  rightTypes: StudentComparisonTypes | null;
  leftAdaptations: readonly StudentComparisonTerrain[] | null;
  rightAdaptations: readonly StudentComparisonTerrain[] | null;
  leftStats: Map<string, number> | null;
  rightStats: Map<string, number> | null;
  leftUnavailableReason: string | null;
  rightUnavailableReason: string | null;
};

function renderCellValue(
  value: number | undefined,
  side: "left" | "right",
  comparison: StudentComparisonStats,
  studentName: string | null,
  otherStudentName: string | null,
  statLabel: string,
  unavailableReason: string | null,
) {
  if (unavailableReason) {
    return <span className="text-sm text-muted-foreground">{unavailableReason}</span>;
  }
  if (studentName === null) {
    return <span className="text-sm text-muted-foreground">학생 선택</span>;
  }
  if (value === undefined) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  const isLarger = comparison.largerSide === side;
  const largerName = studentName;
  const smallerName = otherStudentName;

  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5">
      <span className="whitespace-nowrap text-sm font-medium tabular-nums md:text-base">
        {value.toLocaleString("ko-KR")}
      </span>
      {isLarger && comparison.difference !== null ? (
        <>
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            +{comparison.difference.toLocaleString("ko-KR")}
          </span>
          <span className="sr-only">
            {otherStudentName
              ? `${smallerName}보다 ${largerName}의 ${statLabel} 값이 ${comparison.difference.toLocaleString("ko-KR")} 더 큽니다.`
              : `${comparison.difference.toLocaleString("ko-KR")} 차이`}
          </span>
        </>
      ) : null}
    </span>
  );
}

function renderCategoryValue(
  label: string | null,
  color: SemanticColor | null,
  studentName: string | null,
  unavailableReason: string | null,
) {
  if (unavailableReason) return <span className="text-sm text-muted-foreground">{unavailableReason}</span>;
  if (studentName === null) return <span className="text-sm text-muted-foreground">학생 선택</span>;
  if (label === null || color === null) return <span className="text-sm text-muted-foreground">-</span>;

  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${semanticColorDotClass[color]}`} />
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}

function renderTerrainValue(
  terrain: StudentComparisonTerrain | undefined,
  studentName: string | null,
  unavailableReason: string | null,
) {
  if (unavailableReason) return <span className="text-sm text-muted-foreground">{unavailableReason}</span>;
  if (studentName === null) return <span className="text-sm text-muted-foreground">학생 선택</span>;
  if (!terrain?.rank) return <span className="text-sm text-muted-foreground">-</span>;
  return (
    <span
      role="img"
      aria-label={`${studentName} ${terrain.label} 적성 ${terrain.rank}`}
      className="inline-flex items-center text-sm text-foreground"
    >
      <img
        src={terrainAdaptationIconUrl(terrain.rank)}
        alt=""
        aria-hidden="true"
        className="h-6 w-auto object-contain"
      />
    </span>
  );
}

export default function StudentComparisonTable({
  leftUid,
  rightUid,
  leftName,
  rightName,
  leftTypes,
  rightTypes,
  leftAdaptations,
  rightAdaptations,
  leftStats,
  rightStats,
  leftUnavailableReason,
  rightUnavailableReason,
}: StudentComparisonTableProps) {
  const numericGroups = STUDENT_COMPARISON_STATS;

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left">
      <caption className="sr-only">두 학생의 전투 정보와 능력치 비교</caption>
      <colgroup>
        <col className="w-20 md:w-48" />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th
            scope="col"
            className="sticky top-[3.25rem] z-10 bg-card py-2 pr-2 text-xs font-medium text-muted-foreground lg:top-0"
          >
            항목
          </th>
          <th
            scope="col"
            className="sticky top-[3.25rem] z-10 bg-card px-1 py-2 text-xs font-semibold text-foreground lg:top-0"
          >
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <ProfileImage studentUid={leftUid} imageSize={8} />
              <span className="min-w-0 break-keep [overflow-wrap:anywhere]">{leftName ?? "첫 번째 학생"}</span>
            </div>
          </th>
          <th
            scope="col"
            className="sticky top-[3.25rem] z-10 bg-card px-1 py-2 text-xs font-semibold text-foreground lg:top-0"
          >
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <ProfileImage studentUid={rightUid} imageSize={8} />
              <span className="min-w-0 break-keep [overflow-wrap:anywhere]">{rightName ?? "두 번째 학생"}</span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="break-keep py-2 pr-2 text-sm font-normal text-foreground/85">
            공격 타입
          </th>
          <td className="px-1 py-2 align-middle">
            {renderCategoryValue(
              leftTypes ? attackTypeLocale[leftTypes.attackType] : null,
              leftTypes ? attackTypeColor[leftTypes.attackType] : null,
              leftName,
              leftUnavailableReason,
            )}
          </td>
          <td className="px-1 py-2 align-middle">
            {renderCategoryValue(
              rightTypes ? attackTypeLocale[rightTypes.attackType] : null,
              rightTypes ? attackTypeColor[rightTypes.attackType] : null,
              rightName,
              rightUnavailableReason,
            )}
          </td>
        </tr>
        <tr>
          <th scope="row" className="break-keep py-2 pr-2 text-sm font-normal text-foreground/85">
            방어 타입
          </th>
          <td className="px-1 py-2 align-middle">
            {renderCategoryValue(
              leftTypes ? defenseTypeLocale[leftTypes.defenseType] : null,
              leftTypes ? defenseTypeColor[leftTypes.defenseType] : null,
              leftName,
              leftUnavailableReason,
            )}
          </td>
          <td className="px-1 py-2 align-middle">
            {renderCategoryValue(
              rightTypes ? defenseTypeLocale[rightTypes.defenseType] : null,
              rightTypes ? defenseTypeColor[rightTypes.defenseType] : null,
              rightName,
              rightUnavailableReason,
            )}
          </td>
        </tr>
        {[
          { label: "시가지 적성", key: "street" },
          { label: "야외 적성", key: "outdoor" },
          { label: "실내 적성", key: "indoor" },
        ].map(({ label, key }, index) => {
          const isBattleInfoEnd = index === 2;
          const divider = isBattleInfoEnd ? "border-b border-border/60" : "";
          return (
            <tr key={key}>
              <th scope="row" className={`break-keep py-2 pr-2 text-sm font-normal text-foreground/85 ${divider}`}>
                {label}
              </th>
              <td className={`px-1 py-2 align-middle ${divider}`}>
                {renderTerrainValue(
                  leftAdaptations?.find((item) => item.key === key),
                  leftName,
                  leftUnavailableReason,
                )}
              </td>
              <td className={`px-1 py-2 align-middle ${divider}`}>
                {renderTerrainValue(
                  rightAdaptations?.find((item) => item.key === key),
                  rightName,
                  rightUnavailableReason,
                )}
              </td>
            </tr>
          );
        })}
        {numericGroups.map((group, groupIndex) => (
          <ComparisonGroup key={group.title} title={group.title}>
            {group.stats.map(({ stat, label }, statIndex) => {
              const left = leftStats?.get(stat);
              const right = rightStats?.get(stat);
              const comparison = compareStudentStats(left, right);
              const isSectionEnd = groupIndex < numericGroups.length - 1 && statIndex === group.stats.length - 1;
              const sectionDividerClass = isSectionEnd ? "border-b border-border/60" : "";
              return (
                <tr key={stat}>
                  <th
                    scope="row"
                    className={`break-keep py-2 pr-2 text-sm font-normal text-foreground/85 ${sectionDividerClass}`}
                  >
                    {label}
                  </th>
                  <td className={`px-1 py-2 align-middle ${sectionDividerClass}`}>
                    {renderCellValue(left, "left", comparison, leftName, rightName, label, leftUnavailableReason)}
                  </td>
                  <td className={`px-1 py-2 align-middle ${sectionDividerClass}`}>
                    {renderCellValue(right, "right", comparison, rightName, leftName, label, rightUnavailableReason)}
                  </td>
                </tr>
              );
            })}
          </ComparisonGroup>
        ))}
      </tbody>
    </table>
  );
}

function ComparisonGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <tr>
        <th colSpan={3} scope="colgroup" className="pb-1 pt-4 text-xs font-semibold text-muted-foreground">
          {title}
        </th>
      </tr>
      {children}
    </>
  );
}
