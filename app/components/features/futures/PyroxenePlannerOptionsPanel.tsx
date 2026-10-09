import { PanelOptionChip, PanelOptionGroup } from "~/components/primitives";
import { PYROXENE_PICKUP_CHANCE_OPTIONS } from "~/domain/pyroxene-assumptions";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";

type PyroxenePlannerOptionsPanelProps = {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
};

export default function PyroxenePlannerOptionsPanel({ options, onOptionsChange }: PyroxenePlannerOptionsPanelProps) {
  const selectedOption =
    PYROXENE_PICKUP_CHANCE_OPTIONS.find(({ value }) => value === options.event.pickupChance) ??
    PYROXENE_PICKUP_CHANCE_OPTIONS[0];

  return (
    <PanelOptionGroup title="★3 학생 모집 목표">
      {PYROXENE_PICKUP_CHANCE_OPTIONS.map(({ label, value }) => (
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
