import { ArrowTrendingUpIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { TierSelector } from "~/components/features/students";
import { BottomSheet, Button, Callout } from "~/components/primitives";
import type { ResolvedStudentCalculatorState } from "~/domain/student-calculator";
import { GrowthNumberField } from "./GrowthFieldRow";

export function shouldShowStickyFooterSurface(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight && scrollTop < scrollHeight - clientHeight - 1;
}

type GrowthEditorSheetProps = {
  open: boolean;
  onClose: () => void;
  initialTier: number;
  growth: Pick<ResolvedStudentCalculatorState, "tier" | "level" | "bond" | "abilityHp" | "abilityAtk" | "abilityHeal">;
  abilityReleaseDisabledReason: string | null;
  onTierChange: (tier: number) => void;
  onLevelChange: (value: number) => void;
  onBondChange: (value: number) => void;
  onAbilityHpChange: (value: number) => void;
  onAbilityAtkChange: (value: number) => void;
  onAbilityHealChange: (value: number) => void;
  saveAvailable: boolean;
  saved: boolean;
  saving: boolean;
  saveDisabled: boolean;
  saveLabel: string;
  saveError: string | null;
  onSave: () => void;
};

export default function GrowthEditorSheet({
  open,
  onClose,
  initialTier,
  growth,
  abilityReleaseDisabledReason,
  onTierChange,
  onLevelChange,
  onBondChange,
  onAbilityHpChange,
  onAbilityAtkChange,
  onAbilityHealChange,
  saveAvailable,
  saved,
  saving,
  saveDisabled,
  saveLabel,
  saveError,
  onSave,
}: GrowthEditorSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [footerStuck, setFooterStuck] = useState(false);

  useEffect(() => {
    if (!open || !saveAvailable) {
      setFooterStuck(false);
      return;
    }

    let scrollContainer: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let frameId = 0;

    const updateFooterSurface = () => {
      const content = contentRef.current;
      const footer = footerRef.current;
      scrollContainer = content?.parentElement ?? null;
      if (!scrollContainer || !content || !footer) return;

      setFooterStuck(
        shouldShowStickyFooterSurface(
          scrollContainer.scrollTop,
          scrollContainer.scrollHeight,
          scrollContainer.clientHeight,
        ),
      );
    };

    frameId = window.requestAnimationFrame(() => {
      updateFooterSurface();
      scrollContainer = contentRef.current?.parentElement ?? null;
      if (!scrollContainer) return;
      scrollContainer.addEventListener("scroll", updateFooterSurface, { passive: true });
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(updateFooterSurface);
        resizeObserver.observe(scrollContainer);
        if (contentRef.current) resizeObserver.observe(contentRef.current);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      scrollContainer?.removeEventListener("scroll", updateFooterSurface);
      resizeObserver?.disconnect();
    };
  }, [open, saveAvailable]);

  return (
    <BottomSheet open={open} onClose={onClose} Icon={ArrowTrendingUpIcon} title="성장도">
      <div ref={contentRef} className="relative flex flex-col gap-4 pb-1">
        <form aria-label="성장도" onSubmit={(event) => event.preventDefault()} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 md:gap-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">신비 해방</span>
                <TierSelector
                  initialTier={initialTier}
                  currentTier={growth.tier}
                  iconSize="md"
                  onTierChange={onTierChange}
                />
              </div>
              <GrowthNumberField
                id="growth-level"
                title="레벨"
                value={growth.level}
                min={1}
                max={90}
                onChange={onLevelChange}
              />
              <GrowthNumberField
                id="growth-bond"
                title="인연 랭크"
                value={growth.bond}
                min={1}
                max={100}
                onChange={onBondChange}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs text-muted-foreground">능력 개방</h3>
              {abilityReleaseDisabledReason ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LockClosedIcon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{abilityReleaseDisabledReason}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <GrowthNumberField
                    id="growth-ability-hp"
                    title="최대 체력"
                    value={growth.abilityHp}
                    min={0}
                    max={25}
                    onChange={onAbilityHpChange}
                  />
                  <GrowthNumberField
                    id="growth-ability-atk"
                    title="공격력"
                    value={growth.abilityAtk}
                    min={0}
                    max={25}
                    onChange={onAbilityAtkChange}
                  />
                  <GrowthNumberField
                    id="growth-ability-heal"
                    title="치유력"
                    value={growth.abilityHeal}
                    min={0}
                    max={25}
                    onChange={onAbilityHealChange}
                  />
                </div>
              )}
            </div>
          </div>
        </form>

        {saveAvailable ? (
          <footer
            ref={footerRef}
            className={`sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 px-4 pt-2 pb-1 transition-colors lg:-mx-8 lg:px-8 ${
              footerStuck ? "bg-popover/90 backdrop-blur-sm" : "bg-transparent"
            }`}
          >
            {saveError ? (
              <div role="alert">
                <Callout tone="destructive" title={saveError} />
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              {saved ? <span className="text-xs font-medium text-primary">반영됨</span> : null}
              <Button variant="primary" size="sm" disabled={saveDisabled} onClick={onSave}>
                {saving ? "반영 중" : saveLabel}
              </Button>
            </div>
          </footer>
        ) : null}
      </div>
    </BottomSheet>
  );
}
