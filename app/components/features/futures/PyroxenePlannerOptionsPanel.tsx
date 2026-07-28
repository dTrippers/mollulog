import { PanelOptionChip, PanelOptionGroup } from "~/components/primitives";
import type { PyroxenePickupChance, PyroxenePlannerOptions } from "~/domain/pyroxene-planner";

const pickupChanceOptions = [
  {
    label: "평균 (천장 미반영)",
    value: "average",
    description: "픽업 확률만 반영한 기댓값으로 계산해요.",
  },
  {
    label: "평균 (천장 반영)",
    value: "average_pity",
    description: "해당 모집의 천장 규칙까지 반영한 기댓값으로 계산해요.",
  },
  {
    label: "천장",
    value: "ceil",
    description: "모든 픽업 학생을 해당 모집의 천장까지 진행하는 최악의 상황으로 계산해요.",
  },
] satisfies { label: string; value: PyroxenePickupChance; description: string }[];

type PyroxenePlannerOptionsPanelProps = {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
};

export default function PyroxenePlannerOptionsPanel({ options, onOptionsChange }: PyroxenePlannerOptionsPanelProps) {
  const selectedOption =
    pickupChanceOptions.find(({ value }) => value === options.event.pickupChance) ?? pickupChanceOptions[0];

  return (
    <PanelOptionGroup title="★3 학생 모집 목표">
      {pickupChanceOptions.map(({ label, value }) => (
        <PanelOptionChip
          key={value}
          label={label}
          active={options.event.pickupChance === value}
          onClick={() =>
            onOptionsChange({
              ...options,
              event: { ...options.event, pickupChance: value },
            })
          }
        />
      ))}
      <p className="basis-full pt-1 text-xs leading-relaxed text-muted-foreground">{selectedOption.description}</p>
    </PanelOptionGroup>
  );
}
