import { AdjustmentsHorizontalIcon } from "@heroicons/react/16/solid";
import { useId, useRef, useState } from "react";
import { Button } from "~/components/v2/primitives/Button";
import { Popover } from "~/components/v2/primitives/Popover";
import { Select, type SelectOption } from "~/components/v2/primitives/Select";
import { Switch } from "~/components/v2/primitives/Switch";
import type { GrowthSortOrder } from "~/domain/growth-planner";

export const GROWTH_SORT_OPTIONS: readonly SelectOption<GrowthSortOrder>[] = [
  { value: "planner-newest", label: "플래너 등록 최신순" },
  { value: "planner-oldest", label: "플래너 등록 과거순" },
  { value: "student-newest", label: "학생 최신순" },
  { value: "student-oldest", label: "학생 과거순" },
  { value: "name", label: "학생 이름순" },
  { value: "manual", label: "수동 정렬" },
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const switchId = useId();

  return (
    <>
      <Button
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <AdjustmentsHorizontalIcon className="size-4" aria-hidden="true" />
        정렬 및 화면 설정
      </Button>
      <Popover
        open={open}
        label="정렬 및 화면 설정"
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        className="w-[min(18rem,calc(100vw-2rem))] p-3"
      >
        <section>
          <h2 className="text-xs font-semibold text-v2-fg-secondary">정렬</h2>
          {studentCount > 1 ? (
            <Select
              label="정렬"
              value={sortOrder}
              options={GROWTH_SORT_OPTIONS}
              onChange={onSortOrderChange}
              className="mt-2 w-full [&_select]:w-full"
            />
          ) : (
            <p className="mt-2 text-sm text-v2-fg-secondary">학생이 두 명 이상이면 정렬 기준을 선택할 수 있어요.</p>
          )}
        </section>
        <section className="mt-4">
          <h2 className="text-xs font-semibold text-v2-fg-secondary">화면 설정</h2>
          <div className="mt-1">
            <Switch
              id={switchId}
              size="sm"
              label="− / + / 최대 버튼 표시"
              checked={showNumberInputShortcuts}
              onCheckedChange={onShowNumberInputShortcutsChange}
            />
          </div>
        </section>
      </Popover>
    </>
  );
}
