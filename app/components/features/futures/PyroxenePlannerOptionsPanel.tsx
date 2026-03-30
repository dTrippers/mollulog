import { useCallback } from "react";
import { FilterButtons } from "~/components/primitives";
import type { PyroxenePlannerOptions, TimelineSourceType } from "~/models/pyroxene-planner";

const pickupChanceOptions = [
  { text: "평균 (140회)", value: "average" as const, fallback: "ceil" as const },
  { text: "천장 (200회)", value: "ceil" as const, fallback: "average" as const },
];

const raidTierOptions = [
  { text: "플래티넘", value: "platinum" as const },
  { text: "골드", value: "gold" as const },
  { text: "실버", value: "silver" as const },
  { text: "브론즈", value: "bronze" as const },
];

const tacticalLevelOptions = [
  { text: "10위 내", value: "in10" as const },
  { text: "100위 내", value: "in100" as const },
  { text: "200위 내", value: "in200" as const },
  { text: "200위 밖", value: "over200" as const },
];

const timelineDisplayOptions: { text: string; value: TimelineSourceType }[] = [
  { text: "이벤트 보상", value: "event_reward" },
  { text: "총력전/대결전", value: "raid" },
  { text: "청휘석 구매", value: "buy" },
  { text: "패키지 (초회)", value: "package_onetime" },
  { text: "패키지 (일간)", value: "package_daily" },
  { text: "일일 임무", value: "daily_mission" },
  { text: "주간 임무", value: "weekly_mission" },
  { text: "전술대회", value: "tactical" },
  { text: "출석", value: "attendance" },
  { text: "기타", value: "other" },
];

type PyroxenePlannerOptionsPanelProps = {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
};

export default function PyroxenePlannerOptionsPanel({ options, onOptionsChange }: PyroxenePlannerOptionsPanelProps) {
  const onToggleRaidTier = useCallback((tier: "platinum" | "gold" | "silver" | "bronze") => {
    onOptionsChange({ ...options, raid: { ...options.raid, tier } });
  }, [options, onOptionsChange]);

  const onToggleTimelineDisplay = useCallback((type: TimelineSourceType) => {
    onOptionsChange({
      ...options,
      timeline: {
        ...options.timeline,
        display: options.timeline.display.includes(type) ? options.timeline.display.filter((t) => t !== type) : [...options.timeline.display, type],
      },
    });
  }, [options, onOptionsChange]);

  const onToggleTacticalLevel = useCallback((level: "in10" | "in100" | "in200" | "over200") => {
    onOptionsChange({ ...options, tactical: { ...options.tactical, level } });
  }, [options, onOptionsChange]);

  return (
    <>
      <PanelLabel title="★3 학생 모집 목표" description="학생 한 명당 목표 모집 횟수 (이벤트 별 설정 가능)" />
      <FilterButtons
        exclusive
        atLeastOne
        buttonProps={pickupChanceOptions.map(({ text, value, fallback }) => ({
          text,
          active: options.event.pickupChance === value,
          onToggle: (activated) => onOptionsChange({
            ...options,
            event: { ...options.event, pickupChance: activated ? value : fallback },
          }),
        }))}
      />

      <PanelLabel title="총력전 등급" />
      <FilterButtons
        exclusive
        atLeastOne
        buttonProps={raidTierOptions.map(({ text, value }) => ({
          text,
          active: options.raid.tier === value,
          onToggle: () => onToggleRaidTier(value),
        }))}
      />

      <PanelLabel title="전술대회 순위" description="매일 보상 수령 시점의 대략적인 순위" />
      <FilterButtons
        exclusive
        atLeastOne
        buttonProps={tacticalLevelOptions.map(({ text, value }) => ({
          text,
          active: options.tactical.level === value,
          onToggle: () => onToggleTacticalLevel(value),
        }))}
      />

      <PanelLabel title="타임라인에 표시할 항목" description="타임라인에서 숨겨도 계산에는 반영돼요" />
      <FilterButtons
        buttonProps={timelineDisplayOptions.map(({ text, value }) => ({
          text,
          active: options.timeline.display.includes(value),
          onToggle: () => onToggleTimelineDisplay(value),
        }))}
      />
    </>
  );
}

function PanelLabel({ title, description }: { title: string, description?: string }) {
  return (
    <>
      <p className="mt-4 font-bold">{title}</p>
      {description && <p className="mb-2 text-sm text-neutral-500">{description}</p>}
    </>
  );
}
