import { useEffect } from "react";
import type { ContentFilterState } from "~/domain/futures/content-filter-state";
import type { EventType, RaidType } from "~/models/content.d";
import { Skeleton } from "../../primitives/Skeleton";
import { Switch } from "../../primitives/Switch";
import { ToggleChip } from "../../primitives/ToggleChip";
import { type RecruitmentOpinionSettingView, RecruitmentOpinionToggle } from "../comments/RecruitmentOpinionToggle";
import { eventFilterOptions, type FilterChipOption, raidFilterOptions } from "./filter-options";

export const futureOpinionSwitchId = "future-hide-recruitment-opinions";
const pickupSwitchId = "future-only-pickups";

export type FutureFilterPanelProps = {
  filter: ContentFilterState;
  onFilterChange: (filter: ContentFilterState) => void;
  // The route owns the save. Null while the user's opinion setting has not loaded, so the switch shows a loading state,
  // not a guessed value.
  opinionSetting: RecruitmentOpinionSettingView | null;
  // Increments each time a tutorial action asks for focus on the opinion switch.
  opinionSettingFocusRequest: number;
};

// Filter panel body. The description and reset action belong to the PanelSheet that hosts this body.
export function FutureFilterPanel({
  filter,
  onFilterChange,
  opinionSetting,
  opinionSettingFocusRequest,
}: FutureFilterPanelProps) {
  useEffect(() => {
    if (opinionSettingFocusRequest === 0) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(futureOpinionSwitchId)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [opinionSettingFocusRequest]);

  const toggleGroup = (option: FilterChipOption, pressed: boolean) => {
    const groupTypes = option.types;
    const nextTypes: (EventType | RaidType)[] = pressed
      ? filter.types.filter((type) => !groupTypes.includes(type))
      : Array.from(new Set([...filter.types, ...groupTypes]));
    onFilterChange({ ...filter, types: nextTypes });
  };

  const isPressed = (option: FilterChipOption) => option.types.some((type) => filter.types.includes(type));

  return (
    <div className="space-y-4">
      <ChipGroup title="이벤트" options={eventFilterOptions} isPressed={isPressed} onToggle={toggleGroup} />
      <ChipGroup title="레이드" options={raidFilterOptions} isPressed={isPressed} onToggle={toggleGroup} />
      <div className="space-y-1">
        <Switch
          id={pickupSwitchId}
          label="학생 모집 컨텐츠만 보기"
          checked={filter.onlyPickups}
          onCheckedChange={(checked) => onFilterChange({ ...filter, onlyPickups: checked })}
        />
        {opinionSetting === null ? (
          <div aria-busy="true" className="flex min-h-v2-row-min items-center justify-between gap-3">
            <p className="text-sm text-v2-fg">모집 결과 숨기기</p>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        ) : (
          <RecruitmentOpinionToggle id={futureOpinionSwitchId} setting={opinionSetting} />
        )}
      </div>
    </div>
  );
}

function ChipGroup({
  title,
  options,
  isPressed,
  onToggle,
}: {
  title: string;
  options: FilterChipOption[];
  isPressed: (option: FilterChipOption) => boolean;
  onToggle: (option: FilterChipOption, pressed: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-v2-fg-tertiary">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const pressed = isPressed(option);
          return (
            <ToggleChip key={option.label} pressed={pressed} onPressedChange={() => onToggle(option, pressed)}>
              {option.label}
            </ToggleChip>
          );
        })}
      </div>
    </div>
  );
}
