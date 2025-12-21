import type { EventType, RaidType } from "~/models/content.d";
import { Toggle } from "~/components/atoms/form";
import { FilterButtons } from "~/components/navigation";

export type ContentFilterState = {
  types: (EventType | RaidType)[];
  onlyPickups: boolean;
};

type ContentFilterPanelProps = {
  filter: ContentFilterState;
  onFilterChange: (filter: ContentFilterState) => void;
};

export default function ContentFilterPanel({ filter, onFilterChange }: ContentFilterPanelProps) {
  const onToggleType = (activated: boolean, types: (EventType | RaidType)[]) => {
    const newFilters = { ...filter };
    const newTypes = activated ? [...filter.types, ...types] : filter.types.filter((type) => !types.includes(type));
    newFilters.types = newTypes;
    onFilterChange(newFilters);
  };

  const onToggleOnlyPickups = (activated: boolean) => {
    const newFilters = { ...filter, onlyPickups: activated };
    onFilterChange(newFilters);
  };

  const eventFilterProps = [
    { text: "메인 이벤트", active: filter.types.some(type => ["event", "immortal_event", "fes", "collab"].includes(type)), onToggle: (activated: boolean) => onToggleType(activated, ["event", "immortal_event", "fes", "collab"]) },
    { text: "미니 이벤트", active: filter.types.includes("mini_event"), onToggle: (activated: boolean) => onToggleType(activated, ["mini_event"]) },
    { text: "스토리", active: filter.types.includes("main_story"), onToggle: (activated: boolean) => onToggleType(activated, ["main_story"]) },
    { text: "캠페인", active: filter.types.includes("campaign"), onToggle: (activated: boolean) => onToggleType(activated, ["campaign"]) },
    { text: "종합전술시험", active: filter.types.includes("exercise"), onToggle: (activated: boolean) => onToggleType(activated, ["exercise"]) },
    { text: "픽업 모집", active: filter.types.includes("pickup"), onToggle: (activated: boolean) => onToggleType(activated, ["pickup"]) },
    { text: "배틀 패스", active: filter.types.includes("battle_pass"), onToggle: (activated: boolean) => onToggleType(activated, ["battle_pass"]) },
  ];

  const contentFilterProps = [
    { text: "총력전", active: filter.types.includes("total_assault"), onToggle: (activated: boolean) => onToggleType(activated, ["total_assault"]) },
    { text: "대결전", active: filter.types.includes("elimination"), onToggle: (activated: boolean) => onToggleType(activated, ["elimination"]) },
    { text: "제약해제결전", active: filter.types.includes("unlimit"), onToggle: (activated: boolean) => onToggleType(activated, ["unlimit"]) },
  ];

  return (
    <>
      <div className="mb-4">
        <p className="mb-2 font-bold">이벤트</p>
        <FilterButtons buttonProps={eventFilterProps} />
      </div>
      <div className="mb-2 xl:mb-8">
        <p className="mb-2 font-bold">레이드</p>
        <FilterButtons buttonProps={contentFilterProps} />
      </div>
      <Toggle label="픽업 진행 컨텐츠만 보기" initialState={filter.onlyPickups} onChange={onToggleOnlyPickups} />
    </>
  );
}
