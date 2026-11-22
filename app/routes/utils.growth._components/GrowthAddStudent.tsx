import { PlusIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { useEffect, useRef, useState } from "react";
import { RoundStudentImage } from "~/components/v2/features/students/RoundStudentImage";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { Popover } from "~/components/v2/primitives/Popover";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { cn } from "~/lib/utils";
import type { GrowthAvailableStudent } from "./types";

const MAX_LISTED_STUDENTS = 50;

// The "학생 추가" button and its search. Picking a student adds it to the planner and closes the search.
export function GrowthAddStudent({
  availableStudents,
  adding,
  onAdd,
}: {
  availableStudents: GrowthAvailableStudent[];
  adding: boolean;
  onAdd: (studentUid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();
  const matches = trimmed
    ? availableStudents.filter((student) => hangul.search(student.name, trimmed) >= 0)
    : availableStudents;

  // The search field takes focus, not the first student of the list.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.querySelector("input")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="primary"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={adding}
        onClick={() => setOpen((current) => !current)}
      >
        <PlusIcon className="size-4" aria-hidden="true" />
        학생 추가
      </Button>
      <Popover
        open={open}
        label="학생 추가"
        onClose={close}
        returnFocusRef={triggerRef}
        className="w-[min(22rem,calc(100vw-2rem))] p-2"
      >
        <div ref={searchRef}>
          <SearchInput
            aria-label="학생 이름으로 검색"
            placeholder="학생 이름으로 검색"
            value={query}
            onChange={setQuery}
          />
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto">
          {matches.length > 0 ? (
            matches.slice(0, MAX_LISTED_STUDENTS).map((student) => {
              const { name, variant } = splitVisibleStudentName(student.name);
              return (
                <button
                  key={student.uid}
                  type="button"
                  onClick={() => {
                    close();
                    onAdd(student.uid);
                    triggerRef.current?.focus({ preventScroll: true });
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-v2-hover v2-interaction-transition",
                    v2FocusRing,
                  )}
                >
                  <RoundStudentImage studentUid={student.uid} size="md" />
                  <span className="min-w-0 flex-1 truncate text-sm text-v2-fg">
                    {name}
                    {variant ? <span className="ml-1 text-xs text-v2-fg-tertiary">{variant}</span> : null}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-6 text-center text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
          )}
        </div>
      </Popover>
    </>
  );
}
