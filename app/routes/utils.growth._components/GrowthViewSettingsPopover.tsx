import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { useEffect, useId, useRef, useState } from "react";
import { Dropdown, Toggle } from "~/components/primitives";
import type { GrowthSortOrder } from "./growth-sort";

const sortOptions: { value: GrowthSortOrder; label: string }[] = [
  { value: "planner-newest", label: "플래너 등록 최신순" },
  { value: "planner-oldest", label: "플래너 등록 과거순" },
  { value: "student-newest", label: "학생 최신순" },
  { value: "student-oldest", label: "학생 과거순" },
  { value: "name", label: "학생 이름순" },
];

export default function GrowthViewSettingsPopover({
  studentCount,
  sortOrder,
  showNumberInputShortcuts,
  onSortOrderChange,
  onShowNumberInputShortcutsChange,
}: {
  studentCount: number;
  sortOrder: GrowthSortOrder;
  showNumberInputShortcuts: boolean;
  onSortOrderChange: (sortOrder: GrowthSortOrder) => void;
  onShowNumberInputShortcutsChange: (show: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-center text-sm font-medium text-foreground shadow-xs transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <AdjustmentsHorizontalIcon className="size-4 shrink-0" strokeWidth={2} />
        정렬 및 화면 설정
      </button>

      {isOpen && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="정렬 및 화면 설정"
          className="absolute top-full left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg shadow-foreground/10"
        >
          <section>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">정렬</p>
            {studentCount > 1 ? (
              <Dropdown
                className="mt-2"
                fullWidth
                size="sm"
                value={sortOrder}
                options={sortOptions}
                onChange={onSortOrderChange}
              />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">학생이 두 명 이상이면 정렬 기준을 선택할 수 있어요.</p>
            )}
          </section>

          <section className="mt-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">화면 설정</p>
            <Toggle
              label="− / + / 최대 버튼 표시"
              initialState={showNumberInputShortcuts}
              className="mt-2 mb-0"
              onChange={onShowNumberInputShortcutsChange}
            />
          </section>
        </div>
      )}
    </div>
  );
}
