import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { useId, useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { CHARACTER_EXP_REPORTS, type StudentGrowthResourceRequirements } from "~/domain/growth-resource";
import { cn } from "~/lib/utils";

// The resources one student's goals need. It folds by default; while a save or the recalculation runs, it shows that
// the amounts are being calculated instead of stale ones.
export function GrowthResourceRequirements({
  studentName,
  requirements,
  calculating,
}: {
  studentName: string;
  requirements: StudentGrowthResourceRequirements | null;
  calculating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  if (calculating || requirements == null) {
    return (
      <p role="status" className="flex min-h-7 items-center gap-1.5 text-xs text-v2-fg-secondary">
        <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        재화 계산 중...
      </p>
    );
  }

  const empty = requirements.items.length === 0 && requirements.characterExp <= 0 && requirements.credit <= 0;
  if (empty) {
    return <p className="flex min-h-7 items-center text-xs text-v2-fg-secondary">필요한 재화가 없어요</p>;
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={`${studentName} ${open ? "필요 재화 접기" : "필요 재화 펼치기"}`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-md text-xs font-medium text-v2-fg-secondary hover:text-v2-fg v2-interaction-transition",
          v2FocusRing,
        )}
      >
        {open ? "필요 재화 접기" : "펼쳐서 필요 재화 확인"}
        <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div id={contentId} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 pt-1.5 pb-1">
          {requirements.characterExp > 0 ? (
            <span className="flex items-center gap-2 pr-1">
              <ResourceThumb
                itemUid={CHARACTER_EXP_REPORTS[0].uid}
                rarity={CHARACTER_EXP_REPORTS[0].rarity}
                name="활동 보고서"
                size="md"
              />
              <span className="leading-tight">
                <span className="block text-xs text-v2-fg-secondary">레벨 경험치</span>
                <span className="block text-xs font-semibold tabular-nums text-v2-fg">
                  {requirements.characterExp.toLocaleString()}
                </span>
              </span>
            </span>
          ) : null}
          {requirements.credit > 0 ? (
            <span className="flex items-center gap-2 pr-1">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-md bg-v2-inset text-xs font-bold text-v2-fg-secondary"
              >
                Cr
              </span>
              <span className="leading-tight">
                <span className="block text-xs text-v2-fg-secondary">크레딧</span>
                <span className="block text-xs font-semibold tabular-nums text-v2-fg">
                  {requirements.credit.toLocaleString()}
                </span>
              </span>
            </span>
          ) : null}
          <span className="flex flex-wrap gap-2.5">
            {requirements.items.map((item) => (
              <ResourceThumb
                key={item.uid}
                itemUid={item.uid}
                resourceType={item.type}
                rarity={item.rarity}
                name={item.name}
                quantity={item.amount}
                nameTooltip
                size="md"
              />
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
