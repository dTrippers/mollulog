import { useState } from "react";
import type { Role } from "~/models/content.d";
import type { Attack, Defense } from "~/graphql/graphql";
import { StudentCard } from "~/components/features/students";

type RaidStudentComparisonProps = {
  currentStudentStats: Array<{
    studentUid: string;
    slotsCount: number;
    assistsCount: number;
  }>;
  fromStudentStats: Array<{
    studentUid: string;
    slotsCount: number;
    assistsCount: number;
  }>;
  allStudents: Record<string, { name: string; attackType: Attack; defenseType: Defense; role: Role }>;
};

type StudentComparison = {
  student: { uid: string; name: string; role: string };
  fromCount: number;
  currentCount: number;
  countDiff: number;
  percentageDiff: number;
};

export default function RaidStudentComparison({
  currentStudentStats,
  fromStudentStats,
  allStudents,
}: RaidStudentComparisonProps) {
  const [showAllIncreased, setShowAllIncreased] = useState(false);
  const [showAllDecreased, setShowAllDecreased] = useState(false);

  // Create maps for quick lookup
  const currentMap = new Map(currentStudentStats.map((stat) => [stat.studentUid, stat.slotsCount + stat.assistsCount]));
  const fromMap = new Map(fromStudentStats.map((stat) => [stat.studentUid, stat.slotsCount + stat.assistsCount]));

  // Get all student UIDs
  const allStudentUids = new Set([...currentMap.keys(), ...fromMap.keys()]);

  // Calculate comparisons
  const comparisons: StudentComparison[] = [];
  for (const uid of allStudentUids) {
    const student = allStudents[uid];
    if (!student) {
      continue;
    }

    const currentCount = currentMap.get(uid) || 0;
    const fromCount = fromMap.get(uid) || 0;
    const countDiff = currentCount - fromCount;
    if (countDiff === 0) {
      continue;
    }

    const percentageDiff = fromCount > 0 ? Math.round((countDiff / fromCount) * 100) : currentCount > 0 ? 100 : 0;
    comparisons.push({
      student: { uid, name: student.name, role: student.role },
      fromCount,
      currentCount,
      countDiff,
      percentageDiff,
    });
  }

  // Separate into increased and decreased
  const allIncreased = comparisons.filter((comp) => comp.countDiff > 20).sort((a, b) => b.countDiff - a.countDiff); // Sort by absolute count diff descending

  const allDecreased = comparisons.filter((comp) => comp.countDiff < -20).sort((a, b) => a.countDiff - b.countDiff); // Sort by absolute count diff ascending (most negative first)

  if (allIncreased.length === 0 && allDecreased.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">변화가 있는 학생이 없어요</div>;
  }

  const renderStudentItem = (comp: StudentComparison) => {
    return (
      <div className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted">
        <div className="flex-shrink-0 w-8">
          <StudentCard uid={comp.student.uid} circular />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">{comp.student.name}</div>
          <div className="text-xs text-muted-foreground">
            {comp.fromCount.toLocaleString()} → {comp.currentCount.toLocaleString()}회
            <span
              className={`ml-1 ${comp.countDiff > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              ({comp.countDiff > 0 ? "+" : ""}
              {comp.countDiff.toLocaleString()})
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {allDecreased.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">감소 ({allDecreased.length}명)</h3>
          <div className="space-y-1 rounded-lg bg-card p-2">
            <div className="space-y-1">
              {allDecreased.map((comp, index) => (
                <div key={comp.student.uid} className={index >= 10 && !showAllDecreased ? "hidden md:block" : ""}>
                  {renderStudentItem(comp)}
                </div>
              ))}
            </div>
            {/* Show "더 보기" button only on mobile when there are more than 10 items and not showing all */}
            {allDecreased.length > 10 && !showAllDecreased && (
              <button
                type="button"
                onClick={() => setShowAllDecreased(true)}
                className="mt-2 w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                더 보기 ({allDecreased.length - 10}명)
              </button>
            )}
            {/* Show "접기" button only on mobile when showing all */}
            {allDecreased.length > 10 && showAllDecreased && (
              <button
                type="button"
                onClick={() => setShowAllDecreased(false)}
                className="mt-2 w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                접기
              </button>
            )}
          </div>
        </div>
      )}

      {allIncreased.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-2">
            증가 ({allIncreased.length}명)
          </h3>
          <div className="space-y-1 rounded-lg bg-card p-2">
            <div className="space-y-1">
              {allIncreased.map((comp, index) => (
                <div key={comp.student.uid} className={index >= 10 && !showAllIncreased ? "hidden md:block" : ""}>
                  {renderStudentItem(comp)}
                </div>
              ))}
            </div>
            {/* Show "더 보기" button only on mobile when there are more than 10 items and not showing all */}
            {allIncreased.length > 10 && !showAllIncreased && (
              <button
                type="button"
                onClick={() => setShowAllIncreased(true)}
                className="mt-2 w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                더 보기 ({allIncreased.length - 10}명)
              </button>
            )}
            {/* Show "접기" button only on mobile when showing all */}
            {allIncreased.length > 10 && showAllIncreased && (
              <button
                type="button"
                onClick={() => setShowAllIncreased(false)}
                className="mt-2 w-full rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              >
                접기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
