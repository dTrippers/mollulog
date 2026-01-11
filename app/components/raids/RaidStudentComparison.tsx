import { useState } from "react";
import type { AttackType, DefenseType, Role } from "~/models/content.d";
import { StudentCard } from "~/components/students";

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
  allStudents: Record<string, { name: string; attackType: AttackType; defenseType: DefenseType; role: Role }>;
};

type StudentComparison = {
  student: { uid: string; name: string; role: string };
  fromCount: number;
  currentCount: number;
  countDiff: number;
  percentageDiff: number;
};

export default function RaidStudentComparison({ currentStudentStats, fromStudentStats, allStudents }: RaidStudentComparisonProps) {
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

    const percentageDiff = fromCount > 0 ? Math.round((countDiff / fromCount) * 100) : (currentCount > 0 ? 100 : 0);
    comparisons.push({
      student: { uid, name: student.name, role: student.role },
      fromCount,
      currentCount,
      countDiff,
      percentageDiff,
    });
  }

  // Separate into increased and decreased
  const allIncreased = comparisons
    .filter((comp) => comp.countDiff > 20)
    .sort((a, b) => b.countDiff - a.countDiff); // Sort by absolute count diff descending

  const allDecreased = comparisons
    .filter((comp) => comp.countDiff < -20)
    .sort((a, b) => a.countDiff - b.countDiff); // Sort by absolute count diff ascending (most negative first)

  if (allIncreased.length === 0 && allDecreased.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
        변화가 있는 학생이 없어요
      </div>
    );
  }

  const renderStudentItem = (comp: StudentComparison) => {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800">
        <div className="flex-shrink-0 w-8">
          <StudentCard uid={comp.student.uid} circular />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {comp.student.name}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {comp.fromCount.toLocaleString()} → {comp.currentCount.toLocaleString()}회
            <span className={`ml-1 ${comp.countDiff > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              ({comp.countDiff > 0 ? "+" : ""}{comp.countDiff.toLocaleString()})
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
          <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
            감소 ({allDecreased.length}명)
          </h3>
          <div className="space-y-1 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 bg-white dark:bg-neutral-900">
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
                onClick={() => setShowAllDecreased(true)}
                className="w-full mt-2 px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors md:hidden"
              >
                더 보기 ({allDecreased.length - 10}명)
              </button>
            )}
            {/* Show "접기" button only on mobile when showing all */}
            {allDecreased.length > 10 && showAllDecreased && (
              <button
                onClick={() => setShowAllDecreased(false)}
                className="w-full mt-2 px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors md:hidden"
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
          <div className="space-y-1 border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 bg-white dark:bg-neutral-900">
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
                onClick={() => setShowAllIncreased(true)}
                className="w-full mt-2 px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors md:hidden"
              >
                더 보기 ({allIncreased.length - 10}명)
              </button>
            )}
            {/* Show "접기" button only on mobile when showing all */}
            {allIncreased.length > 10 && showAllIncreased && (
              <button
                onClick={() => setShowAllIncreased(false)}
                className="w-full mt-2 px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors md:hidden"
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

