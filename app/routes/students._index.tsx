import { StarIcon } from "@heroicons/react/16/solid";
import { useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { StudentCards } from "~/components/features/students";
import { getStudentDirectoryLabel, groupStudentDirectoryStudents } from "~/components/features/students/StudentFilter";
import { attackTypeColor, defenseTypeColor } from "~/locales/ko";
import { terrainAdaptationIconUrl } from "~/models/assets";
import type { StudentDirectoryDisplayField, StudentDirectoryStudent } from "~/models/student-directory";
import type { StudentsPageContext } from "./students";

const directoryLabelClassName = "min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap";
const directoryLabelTextColorClass = {
  red: "text-red-300",
  yellow: "text-yellow-300",
  green: "text-green-300",
  blue: "text-blue-300",
  purple: "text-purple-300",
  grey: "text-neutral-300",
} as const;
const terrainLabelNames = {
  street: "시가지",
  outdoor: "야외",
  indoor: "실내",
} as const;

type StudentDirectoryCardDisplayField = Exclude<StudentDirectoryDisplayField, "none">;

function StudentDirectoryCardLabel({
  student,
  displayBy,
}: {
  student: StudentDirectoryStudent;
  displayBy: StudentDirectoryCardDisplayField;
}) {
  const label = getStudentDirectoryLabel(student, displayBy);
  const commonProps = {
    title: label.ariaLabel,
  };

  if (displayBy === "initialTier") {
    const initialTier = student.initialTier > 0 ? student.initialTier : null;
    if (initialTier === null) {
      const accessibleLabel = "초기 성급 정보 없음";
      return (
        <span title={accessibleLabel} className={`block ${directoryLabelClassName}`}>
          <span className="sr-only">{accessibleLabel}</span>
          <span aria-hidden="true">정보 없음</span>
        </span>
      );
    }

    const accessibleLabel = `초기 성급 ${initialTier}성`;
    return (
      <span
        title={accessibleLabel}
        aria-label={accessibleLabel}
        role="img"
        className={`inline-flex items-center justify-center gap-0.5 ${directoryLabelClassName} text-yellow-300`}
      >
        <StarIcon aria-hidden="true" className="size-3 shrink-0" />
        <span>{initialTier}</span>
      </span>
    );
  }

  if (displayBy === "street" || displayBy === "outdoor" || displayBy === "indoor") {
    const terrainLabel = terrainLabelNames[displayBy];
    const rank = student.catalog?.terrainAdaptations?.[displayBy];
    if (!rank) {
      const accessibleLabel = `${terrainLabel} 적성 정보 없음`;
      return (
        <span title={accessibleLabel} className={`block ${directoryLabelClassName}`}>
          <span className="sr-only">{accessibleLabel}</span>
          <span aria-hidden="true">정보 없음</span>
        </span>
      );
    }

    const accessibleLabel = `${terrainLabel} 적성 ${rank}`;
    return (
      <span
        title={accessibleLabel}
        aria-label={accessibleLabel}
        role="img"
        className={`inline-flex items-center justify-center ${directoryLabelClassName}`}
      >
        <img
          src={terrainAdaptationIconUrl(rank)}
          alt=""
          aria-hidden="true"
          className="size-3.5 shrink-0 object-contain"
        />
      </span>
    );
  }

  const textColorClass =
    displayBy === "attackType"
      ? directoryLabelTextColorClass[attackTypeColor[student.attackType]]
      : displayBy === "defenseType"
        ? directoryLabelTextColorClass[defenseTypeColor[student.defenseType]]
        : undefined;

  return (
    <span {...commonProps} className={`block ${directoryLabelClassName}${textColorClass ? ` ${textColorClass}` : ""}`}>
      {label.value}
    </span>
  );
}

export default function Students() {
  const { students, filterState } = useOutletContext<StudentsPageContext>();
  const navigate = useNavigate();
  const groups = useMemo(
    () => groupStudentDirectoryStudents(students, filterState.groupBy ?? "none"),
    [filterState.groupBy, students],
  );
  const displayBy = filterState.displayBy ?? "none";

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label ?? "학생 목록"} className="space-y-2">
          {group.label && (
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
              <span className="text-xs text-muted-foreground">{group.students.length}명</span>
            </div>
          )}
          <StudentCards
            students={group.students.map((student) => {
              return {
                uid: student.uid,
                name: student.name,
                attackType: student.attackType,
                defenseType: student.defenseType,
                role: student.role,
                ...(displayBy === "none"
                  ? {}
                  : { label: <StudentDirectoryCardLabel student={student} displayBy={displayBy} /> }),
              };
            })}
            layout="responsive-wrap"
            cardSize="lg"
            onSelect={(uid) => navigate(`/students/${uid}`)}
          />
        </section>
      ))}
    </div>
  );
}
