import { PanelOptionChip, PanelOptionGroup } from "~/components/primitives";
import type { PyroxenePlannerOptions } from "~/models/pyroxene-planner";

const pickupChanceOptions = [
  { label: "평균 (140회)", value: "average" as const, fallback: "ceil" as const },
  { label: "천장 (200회)", value: "ceil" as const, fallback: "average" as const },
];

type PyroxenePlannerOptionsPanelProps = {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
};

export default function PyroxenePlannerOptionsPanel({ options, onOptionsChange }: PyroxenePlannerOptionsPanelProps) {
  return (
    <PanelOptionGroup title="★3 학생 모집 목표" description="학생 한 명당 목표 모집 횟수 (이벤트 별 설정 가능)">
      {pickupChanceOptions.map(({ label, value, fallback }) => (
        <PanelOptionChip
          key={value}
          label={label}
          active={options.event.pickupChance === value}
          onClick={() =>
            onOptionsChange({
              ...options,
              event: { ...options.event, pickupChance: options.event.pickupChance === value ? fallback : value },
            })
          }
        />
      ))}
    </PanelOptionGroup>
  );
}
