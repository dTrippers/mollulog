import { FilterButtons, Toggle } from "~/components/primitives";
import type { EventType, RaidType } from "~/models/content.d";
import type { ContentFilterState } from "./content-filter-state";

type ContentFilterPanelProps = {
  filter: ContentFilterState;
  onFilterChange: (filter: ContentFilterState) => void;
};

export default function ContentFilterPanel({ filter, onFilterChange }: ContentFilterPanelProps) {
  const onToggleType = (activated: boolean, types: (EventType | RaidType)[]) => {
    const nextTypes = activated
      ? Array.from(new Set([...filter.types, ...types]))
      : filter.types.filter((type) => !types.includes(type));
    onFilterChange({ ...filter, types: nextTypes });
  };

  const onToggleOnlyPickups = (activated: boolean) => {
    onFilterChange({ ...filter, onlyPickups: activated });
  };

  const eventFilterProps = [
    { text: "메인 이벤트", active: filter.types.some(type => ["event", "immortal_event", "fes", "collab"].includes(type)), onToggle: (activated: boolean) => onToggleType(activated, ["event", "immortal_event", "fes", "collab"]) },
    { text: "미니 이벤트", active: filter.types.includes("mini_event"), onToggle: (activated: boolean) => onToggleType(activated, ["mini_event"]) },
    { text: "스토리", active: filter.types.includes("main_story"), onToggle: (activated: boolean) => onToggleType(activated, ["main_story"]) },
    { text: "캠페인", active: filter.types.includes("campaign"), onToggle: (activated: boolean) => onToggleType(activated, ["campaign"]) },
    { text: "종합전술시험", active: filter.types.includes("joint_firing_drill"), onToggle: (activated: boolean) => onToggleType(activated, ["joint_firing_drill"]) },
    { text: "픽업 모집", active: filter.types.includes("pickup"), onToggle: (activated: boolean) => onToggleType(activated, ["pickup"]) },
  ];

  const contentFilterProps = [
    { text: "총력전", active: filter.types.includes("total_assault"), onToggle: (activated: boolean) => onToggleType(activated, ["total_assault"]) },
    { text: "대결전", active: filter.types.includes("elimination"), onToggle: (activated: boolean) => onToggleType(activated, ["elimination"]) },
    { text: "제약해제결전", active: filter.types.includes("unlimit"), onToggle: (activated: boolean) => onToggleType(activated, ["unlimit"]) },
    { text: "연합작전", active: filter.types.includes("allied"), onToggle: (activated: boolean) => onToggleType(activated, ["allied"]) },
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
      <Toggle label="학생 모집 컨텐츠만 보기" initialState={filter.onlyPickups} onChange={onToggleOnlyPickups} />
    </>
  );
}
