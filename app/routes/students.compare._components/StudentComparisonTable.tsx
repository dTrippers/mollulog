import {
  compareStudentStats,
  STUDENT_COMPARISON_STATS,
  type StudentComparisonStats,
} from "~/domain/student-comparison";
import type { Attack, Defense } from "~/graphql/graphql";
import { attackTypeColor, attackTypeLocale, defenseTypeColor, defenseTypeLocale } from "~/locales/ko";

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
  leftName: string | null;
  rightName: string | null;
  leftTypes: StudentComparisonTypes | null;
  rightTypes: StudentComparisonTypes | null;
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
    return <span className="text-sm text-muted-foreground">자료 없음</span>;
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
  if (studentName === null) {
    return <span className="text-sm text-muted-foreground">{unavailableReason ?? "학생 선택"}</span>;
  }
  if (label === null || color === null) {
    return <span className="text-sm text-muted-foreground">자료 없음</span>;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${semanticColorDotClass[color]}`} />
      <span className="min-w-0">{label}</span>
    </span>
  );
}

export default function StudentComparisonTable({
  leftName,
  rightName,
  leftTypes,
  rightTypes,
  leftStats,
  rightStats,
  leftUnavailableReason,
  rightUnavailableReason,
}: StudentComparisonTableProps) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left">
      <caption className="sr-only">두 학생의 공격 타입, 방어 타입, 능력치 비교</caption>
      <colgroup>
        <col className="w-20 sm:w-32" />
        <col />
        <col />
      </colgroup>
      <thead className="sr-only">
        <tr>
          <th scope="col">항목</th>
          <th scope="col">{leftName ?? "첫 번째 학생"}</th>
          <th scope="col">{rightName ?? "두 번째 학생"}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="py-2 pr-2 text-sm font-normal text-foreground/85">
            공격 타입
          </th>
          <td className="py-2 pr-2 align-middle">
            {renderCategoryValue(
              leftTypes ? attackTypeLocale[leftTypes.attackType] : null,
              leftTypes ? attackTypeColor[leftTypes.attackType] : null,
              leftName,
              leftUnavailableReason,
            )}
          </td>
          <td className="py-2 align-middle">
            {renderCategoryValue(
              rightTypes ? attackTypeLocale[rightTypes.attackType] : null,
              rightTypes ? attackTypeColor[rightTypes.attackType] : null,
              rightName,
              rightUnavailableReason,
            )}
          </td>
        </tr>
        <tr>
          <th scope="row" className="py-2 pr-2 text-sm font-normal text-foreground/85">
            방어 타입
          </th>
          <td className="py-2 pr-2 align-middle">
            {renderCategoryValue(
              leftTypes ? defenseTypeLocale[leftTypes.defenseType] : null,
              leftTypes ? defenseTypeColor[leftTypes.defenseType] : null,
              leftName,
              leftUnavailableReason,
            )}
          </td>
          <td className="py-2 align-middle">
            {renderCategoryValue(
              rightTypes ? defenseTypeLocale[rightTypes.defenseType] : null,
              rightTypes ? defenseTypeColor[rightTypes.defenseType] : null,
              rightName,
              rightUnavailableReason,
            )}
          </td>
        </tr>
        {STUDENT_COMPARISON_STATS.map((group, groupIndex) => (
          <ComparisonGroup key={group.title} title={group.title} isFirst={groupIndex === 0}>
            {group.stats.map(({ stat, label }) => {
              const left = leftStats?.get(stat);
              const right = rightStats?.get(stat);
              const comparison = compareStudentStats(left, right);
              return (
                <tr key={stat}>
                  <th scope="row" className="py-2 pr-2 text-sm font-normal text-foreground/85">
                    {label}
                  </th>
                  <td className="py-2 pr-2 align-middle">
                    {renderCellValue(left, "left", comparison, leftName, rightName, label, leftUnavailableReason)}
                  </td>
                  <td className="py-2 align-middle">
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

function ComparisonGroup({ title, children, isFirst }: { title: string; children: React.ReactNode; isFirst: boolean }) {
  return (
    <>
      <tr>
        <th
          colSpan={3}
          scope="colgroup"
          className={`pb-1 ${isFirst ? "pt-4" : "border-t border-border/60 pt-4"} text-xs font-semibold text-muted-foreground`}
        >
          {title}
        </th>
      </tr>
      {children}
    </>
  );
}
