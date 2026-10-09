import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { Button } from "~/components/primitives";
import { buildPyroxeneAssumptionItems, buildPyroxeneCalculationAssumptions } from "~/domain/pyroxene-assumptions";
import type { PyroxenePickupChance } from "~/domain/pyroxene-planner";
import type { PyroxeneScheduleItem } from "~/domain/pyroxene-schedule";
import { cn } from "~/lib/utils";
import PyroxeneCalculationMethodSheet from "./PyroxeneCalculationMethodSheet";

type PyroxeneCalculationAssumptionsProps = {
  scheduleItems: PyroxeneScheduleItem[];
  pickupChance: PyroxenePickupChance;
  from: Date;
  showRange: boolean;
  leadLabel?: string;
  sheetDescription?: string;
  className?: string;
} & (
  | { onChangePickupChance: () => void; changePickupChanceTo?: never }
  | { onChangePickupChance?: never; changePickupChanceTo: string }
);

export default function PyroxeneCalculationAssumptions({
  scheduleItems,
  pickupChance,
  from,
  showRange,
  leadLabel,
  sheetDescription = "그래프와 타임라인의 청휘석을 이렇게 계산해요",
  className,
  onChangePickupChance,
  changePickupChanceTo,
}: PyroxeneCalculationAssumptionsProps) {
  const [open, setOpen] = useState(false);
  const pendingChangeRef = useRef(false);
  const assumptions = buildPyroxeneCalculationAssumptions(scheduleItems, pickupChance, from);
  const items = buildPyroxeneAssumptionItems(assumptions);

  const handleExit = () => {
    if (!pendingChangeRef.current) return;
    pendingChangeRef.current = false;
    onChangePickupChance?.();
  };

  return (
    <>
      <div className={cn("flex items-start gap-2", className)}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-[3px]">
          {leadLabel ? (
            <span className="whitespace-nowrap text-sm font-medium text-foreground">{leadLabel}</span>
          ) : null}
          <ul
            aria-label={leadLabel ? "청휘석 계산 가정" : "계산 가정"}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            {items.map(({ id, label }) => (
              <li key={id} className="whitespace-nowrap text-sm text-muted-foreground">
                {label}
              </li>
            ))}
          </ul>
        </div>
        <Button
          text="계산 방식"
          icon={QuestionMarkCircleIcon}
          size="xs"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
          onClick={() => setOpen(true)}
        />
      </div>
      <PyroxeneCalculationMethodSheet
        open={open}
        onClose={() => setOpen(false)}
        onExited={handleExit}
        assumptions={assumptions}
        showRange={showRange}
        description={sheetDescription}
        onChangePickupChance={
          onChangePickupChance
            ? () => {
                pendingChangeRef.current = true;
                setOpen(false);
              }
            : undefined
        }
        changePickupChanceTo={changePickupChanceTo}
      />
    </>
  );
}
