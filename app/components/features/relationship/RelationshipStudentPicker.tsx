import { HeartIcon } from "@heroicons/react/16/solid";
import { useMemo } from "react";
import { StudentSelectForm } from "~/components/features/forms";
import { ProfileImage } from "~/components/primitives";
import { parseVisibleNames } from "~/models/student";
import { sanitizeClassName } from "~/prophandlers";

type RelationshipStudent = {
  uid: string;
  name: string;
  currentLevel: number | null;
};

type RelationshipStudentPickerProps = {
  students: RelationshipStudent[];
  selectedStudentUid: string | null;
  onSelectStudentUid: (studentUid: string | null) => void;
};

export default function RelationshipStudentPicker({
  students,
  selectedStudentUid,
  onSelectStudentUid,
}: RelationshipStudentPickerProps) {
  const selectedStudent = useMemo(
    () => students.find((student) => student.uid === selectedStudentUid),
    [selectedStudentUid, students],
  );
  const savedStudents = useMemo(
    () => sortStudentsByLevel(students.filter((student) => student.currentLevel !== null), students),
    [students],
  );

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 md:p-4">
      <StudentSelectForm
        label="학생 찾기"
        students={students}
        initialStudentUids={selectedStudentUid ? [selectedStudentUid] : undefined}
        placeholder={selectedStudent ? "다른 학생 검색..." : "이름으로 찾기..."}
        searchPlaceholder="학생 이름으로 검색"
        className="max-w-none"
        containerClassName="mt-0 mb-0"
        onSelect={(value) => {
          onSelectStudentUid(Array.isArray(value) ? (value[0] ?? null) : (value || null));
        }}
      />

      {savedStudents.length > 0 && (
        <div className="mt-2">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:grid-cols-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {savedStudents.map((student) => (
              <SavedStudentButton
                key={student.uid}
                student={student}
                selected={selectedStudentUid === student.uid}
                onSelect={() => {
                  onSelectStudentUid(student.uid);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {!selectedStudent && savedStudents.length === 0 && (
        <p className="mt-2 rounded-md bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
          학생 이름을 검색해서 계산을 시작해보세요.
        </p>
      )}
    </div>
  );
}

function SavedStudentButton({
  student,
  selected,
  onSelect,
}: {
  student: RelationshipStudent;
  selected: boolean;
  onSelect: () => void;
}) {
  const visibleName = formatVisibleName(student.name);

  return (
    <button
      type="button"
      className={sanitizeClassName(`
        flex min-w-24 shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors lg:min-w-0 lg:shrink lg:gap-2 lg:py-2
        ${selected ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30" : "border-border bg-background hover:bg-muted"}
      `)}
      onClick={onSelect}
    >
      <ProfileImage studentUid={student.uid} imageSize={8} />
      <span className="min-w-0 flex-1">
        <span className="block max-w-20 truncate text-xs font-medium text-foreground lg:max-w-none lg:text-sm">{visibleName}</span>
      </span>
      {student.currentLevel && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
          <HeartIcon className="size-3" />
          {student.currentLevel}
        </span>
      )}
    </button>
  );
}

function formatVisibleName(name: string): string {
  const visibleNames = parseVisibleNames(name);
  if (visibleNames.length === 2) {
    return `${visibleNames[0]}(${visibleNames[1]})`;
  }
  return visibleNames.join(" ");
}

function sortStudentsByLevel(candidates: RelationshipStudent[], students: RelationshipStudent[]) {
  return [...candidates].sort((a, b) => {
    const aLevel = students.find((student) => student.uid === a.uid)?.currentLevel ?? 0;
    const bLevel = students.find((student) => student.uid === b.uid)?.currentLevel ?? 0;
    return bLevel - aLevel;
  });
}
