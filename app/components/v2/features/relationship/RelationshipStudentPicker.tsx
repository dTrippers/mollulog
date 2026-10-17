import { HeartIcon } from "@heroicons/react/16/solid";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import hangul from "hangul-js";
import { useMemo, useState } from "react";
import { cn } from "~/lib/utils";

export type RelationshipStudent = {
  uid: string;
  name: string;
  currentLevel: number | null;
  order: number;
  hasSavedState: boolean;
};

export function RelationshipStudentPicker({
  students,
  selectedStudentUid,
  nullableSemantics,
  showAllStudents = false,
  onSelectStudentUid,
}: {
  students: RelationshipStudent[];
  selectedStudentUid: string | null;
  nullableSemantics: boolean;
  showAllStudents?: boolean;
  onSelectStudentUid: (studentUid: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const savedStudents = useMemo(
    () =>
      students
        .filter((student) => (nullableSemantics ? student.hasSavedState : student.currentLevel !== null))
        .sort((a, b) => (b.currentLevel ?? 0) - (a.currentLevel ?? 0) || a.order - b.order),
    [students, nullableSemantics],
  );
  const visibleStudents = useMemo(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return showAllStudents ? students : savedStudents;
    return students
      .filter((student) => hangul.search(student.name, normalizedQuery) >= 0)
      .sort((a, b) => (b.currentLevel ?? 0) - (a.currentLevel ?? 0) || a.order - b.order);
  }, [query, savedStudents, showAllStudents, students]);

  return (
    <div className="min-w-0">
      <label className="relative block">
        <MagnifyingGlassIcon
          className="absolute inset-y-0 left-3 my-auto size-4 text-v2-fg-tertiary"
          aria-hidden="true"
        />
        <span className="sr-only">이름으로 찾기</span>
        <input
          type="search"
          value={query}
          placeholder="이름으로 찾기"
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="min-h-9 w-full rounded-md border border-v2-control-border bg-v2-surface py-1.5 pr-3 pl-9 text-sm text-v2-fg placeholder:text-v2-fg-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus max-md:min-h-11"
        />
      </label>
      <div className={cn("mt-2 grid grid-cols-1 gap-0", !showAllStudents && "max-h-96 overflow-y-auto")}>
        {visibleStudents.map((student) => {
          const selected = student.uid === selectedStudentUid;
          const visibleName = student.name;
          return (
            <button
              key={student.uid}
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelectStudentUid(student.uid)}
              className={cn(
                "flex min-h-v2-row-min w-full min-w-0 items-center gap-2 rounded-md px-v2-row-x py-v2-row-y text-left text-v2-fg hover:bg-v2-hover",
                selected && "bg-v2-inset",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
              )}
            >
              <img
                src={`https://assets.baql.net/images/students/collection/${student.uid}.webp`}
                alt=""
                loading="lazy"
                className="size-6 shrink-0 rounded-md bg-v2-inset object-cover"
              />
              <span className={cn("min-w-0 flex-1 truncate text-sm font-normal", selected && "font-semibold")}>
                {visibleName}
              </span>
              {student.currentLevel != null ? (
                <span
                  role="img"
                  aria-label={`인연 랭크 ${student.currentLevel}`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm tabular-nums text-v2-fg-secondary"
                >
                  <HeartIcon aria-hidden="true" className="size-3.5 text-v2-bond" />
                  {student.currentLevel}
                </span>
              ) : (
                <span className="sr-only">랭크 미입력</span>
              )}
            </button>
          );
        })}
        {visibleStudents.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-v2-fg-tertiary">
            {query.trim() ? "검색 결과가 없어요" : "학생 이름을 검색해 보세요"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
