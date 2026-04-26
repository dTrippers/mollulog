import { HeartIcon } from "@heroicons/react/16/solid";
import { useMemo, useState } from "react";
import { Input, ProfileImage } from "~/components/primitives";
import { filterStudentByName } from "~/filters/student";
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
  const [searchValue, setSearchValue] = useState("");
  const selectedStudent = useMemo(
    () => students.find((student) => student.uid === selectedStudentUid),
    [selectedStudentUid, students],
  );
  const savedStudents = useMemo(
    () => sortStudentsByLevel(students.filter((student) => student.currentLevel !== null), students),
    [students],
  );
  const searchResults = useMemo(() => {
    const normalizedSearchValue = searchValue.trim();
    if (!normalizedSearchValue) {
      return [];
    }

    return sortStudentsByLevel(filterStudentByName(normalizedSearchValue, students, 20), students);
  }, [searchValue, students]);
  const hasSearchValue = searchValue.trim().length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 md:p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">학생 찾기</p>

      <Input
        containerClassName="my-0"
        placeholder={selectedStudent ? "다른 학생 검색..." : "이름으로 찾기..."}
        value={searchValue}
        onChange={setSearchValue}
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
                  setSearchValue("");
                  onSelectStudentUid(student.uid);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {hasSearchValue && (
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
          {searchResults.length > 0 ? (
            searchResults.map((student) => (
              <SearchResultButton
                key={student.uid}
                student={student}
                selected={selectedStudentUid === student.uid}
                onSelect={() => {
                  setSearchValue("");
                  onSelectStudentUid(student.uid);
                }}
              />
            ))
          ) : (
            <p className="rounded-md bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
              검색 결과가 없어요
            </p>
          )}
        </div>
      )}

      {!selectedStudent && !hasSearchValue && savedStudents.length === 0 && (
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

function SearchResultButton({
  student,
  selected,
  onSelect,
}: {
  student: RelationshipStudent;
  selected: boolean;
  onSelect: () => void;
}) {
  const visibleNames = parseVisibleNames(student.name);
  const visibleName = formatVisibleName(student.name);

  return (
    <button
      type="button"
      className={sanitizeClassName(`
        flex min-w-0 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors
        ${selected ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30" : "border-border bg-background hover:bg-muted"}
      `)}
      onClick={onSelect}
    >
      <ProfileImage studentUid={student.uid} imageSize={10} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{visibleName}</span>
      </span>
      {student.currentLevel && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
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
