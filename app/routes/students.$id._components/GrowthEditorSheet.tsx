import { ArrowPathIcon, ArrowTrendingUpIcon, CheckCircleIcon, ExclamationTriangleIcon, LockClosedIcon, XCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { FocusEventHandler, KeyboardEventHandler, ReactNode } from "react";
import { useNumberInputFlowNavigation } from "~/components/v2/primitives/use-number-input-flow-navigation";
import type { NumberInputFlowNavigationInputProps } from "~/components/v2/primitives/use-number-input-flow-navigation";
import { TierInput } from "~/components/v2/features/students/TierInput";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Sheet } from "~/components/v2/primitives/Sheet";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import type { ResolvedStudentCalculatorState } from "~/domain/student-calculator";

export function shouldShowStickyFooterSurface(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight && scrollTop < scrollHeight - clientHeight - 1;
}

export function getGrowthProgressPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const clampedValue = Math.min(max, Math.max(min, value));
  return ((clampedValue - min) / (max - min)) * 100;
}

function clampGrowthInput(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  signedIn: boolean;
  released: boolean;
  saved: boolean;
  saving: boolean;
  saveDisabled: boolean;
  saveLabel: string;
  saveError: string | null;
  staleWriteBlocked: boolean;
  retryAvailable: boolean;
  onSave: () => void;
  onRefresh: () => void;
  onRetry: () => void;
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
  signedIn,
  released,
  saved,
  saving,
  saveDisabled,
  saveLabel,
  saveError,
  staleWriteBlocked,
  retryAvailable,
  onSave,
  onRefresh,
  onRetry,
}: GrowthEditorSheetProps) {
  const { getInputProps } = useNumberInputFlowNavigation();
  const saveButton = saveAvailable ? (
    <Button className="disabled:!bg-v2-inset" variant="primary" disabled={saveDisabled} onClick={onSave}>
      {saving ? "반영 중" : saveLabel}
    </Button>
  ) : null;
  const retryButton = (label: string, onClick: () => void) => (
    <Button className="-my-1" variant="text" size="sm" onClick={onClick}><ArrowPathIcon className="size-3.5" aria-hidden="true" />{label}</Button>
  );
  const footer = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <span aria-hidden="true" className="mb-0.5 block h-px w-full shrink-0 bg-v2-divider" style={{ marginInline: "calc(var(--spacing-v2-block-p) * -1)", width: "calc(100% + var(--spacing-v2-block-p) + var(--spacing-v2-block-p))" }} />
      {released && saveError ? (
        <StatusNotice
          className="min-w-0 flex-[1_1_18rem] [&>svg]:hidden"
          tone={staleWriteBlocked ? "warning" : "danger"}
          action={
            staleWriteBlocked
              ? retryButton("새로고침", onRefresh)
              : retryAvailable ? retryButton("다시 시도", onRetry) : undefined
          }
        >
          <span className="relative block pl-6 leading-[1.43]">
            {staleWriteBlocked ? <ExclamationTriangleIcon className="absolute top-0.5 left-0 size-4 text-v2-warning" aria-hidden="true" /> : <XCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-danger" aria-hidden="true" />}
            {saveError}
          </span>
        </StatusNotice>
      ) : null}
      <div className="ml-auto flex items-center gap-2.5">
        {!signedIn ? <span className="text-xs leading-[1.43] text-v2-fg-tertiary">로그인 후 사용 가능</span> : null}
        {saved ? <span className="inline-flex items-center gap-1 text-xs leading-[1.43] font-medium text-v2-success"><CheckCircleIcon className="size-3.5" aria-hidden="true" />반영됨</span> : null}
        {saveButton}
      </div>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="성장도"
      Icon={ArrowTrendingUpIcon}
      headerAction={<span aria-hidden="true" data-student-growth-sheet-marker className="pointer-events-none absolute top-[22px] right-[14px] size-5 text-v2-fg-secondary"><XMarkIcon className="size-5" /></span>}
      footer={footer}
    >
      <style>{`
        [role="dialog"]:has([data-student-growth-sheet-marker]) button[aria-label="닫기"] svg {
          width: 20px;
          height: 20px;
          opacity: 0;
        }
        [role="dialog"]:has([data-student-growth-sheet-marker]) .max-w-3xl {
          position: relative;
        }
        @media (max-width: 767px) {
          [role="dialog"]:has([data-student-growth-sheet-marker]) .max-w-3xl > div:last-child {
            padding-top: 0;
          }
        }
        [role="dialog"]:has([data-student-growth-sheet-marker]) h2 {
          line-height: 1.4;
        }
        [role="dialog"][aria-label="신비 해방 성급 선택"] {
          margin-top: -2px;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        [role="dialog"][aria-label="신비 해방 성급 선택"] button:disabled {
          opacity: 0.3;
        }
      `}</style>
      <form aria-label="성장도" onSubmit={(event) => event.preventDefault()}>
        <div className="grid gap-4 md:grid-cols-2 md:gap-8">
          <section aria-label="성장도 설정">
            <GrowthField label="신비 해방">
              <TierInput
                label="신비 해방"
                value={growth.tier}
                initialTier={initialTier}
                min={1}
                max={9}
                flowProps={getInputProps()}
                onChange={onTierChange}
                className="leading-[1.43] [&>span]:!min-h-[30px]"
              />
            </GrowthField>
            <GrowthNumberField id="growth-level" label="레벨" value={growth.level} min={1} max={90} onChange={onLevelChange} flowProps={getInputProps()} />
            <GrowthNumberField id="growth-bond" label="인연 랭크" value={growth.bond} min={1} max={100} onChange={onBondChange} flowProps={getInputProps()} />
          </section>

          <section aria-label="능력 개방">
            <h3 className="mb-1 flex min-h-6 items-center text-sm leading-[1.43] font-semibold text-v2-fg">능력 개방</h3>
            {abilityReleaseDisabledReason ? (
              <div className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-[1.43] text-v2-fg-tertiary">
                <LockClosedIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{abilityReleaseDisabledReason}</span>
              </div>
            ) : (
              <div>
                <GrowthNumberField id="growth-ability-hp" label="최대 체력" value={growth.abilityHp} min={0} max={25} onChange={onAbilityHpChange} flowProps={getInputProps()} />
                <GrowthNumberField id="growth-ability-atk" label="공격력" value={growth.abilityAtk} min={0} max={25} onChange={onAbilityAtkChange} flowProps={getInputProps()} />
                <GrowthNumberField id="growth-ability-heal" label="치유력" value={growth.abilityHeal} min={0} max={25} onChange={onAbilityHealChange} flowProps={getInputProps()} />
              </div>
            )}
          </section>
        </div>
      </form>
    </Sheet>
  );
}

function GrowthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-v2-row-min items-center justify-between gap-3">
      <span className="min-w-0 text-sm leading-[1.43] text-v2-fg-secondary">{label}</span>
      <div className="w-24 shrink-0">{children}</div>
    </div>
  );
}

function GrowthNumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
  flowProps,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  flowProps: NumberInputFlowNavigationInputProps;
}) {
  return (
    <div className="flex min-h-v2-row-min items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-sm leading-[1.43] text-v2-fg-secondary">{label}</label>
      <div className="w-24 shrink-0"><NumberInput
        data-number-input-flow={flowProps["data-number-input-flow"]}
        onFocus={flowProps.onFocus as FocusEventHandler<HTMLInputElement>}
        onKeyDown={flowProps.onKeyDown as KeyboardEventHandler<HTMLInputElement>}
        id={id}
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clampGrowthInput(Number(event.currentTarget.value), min, max))}
        className="leading-[1.43]"
      /></div>
      <span className="sr-only">최대 {max}</span>
    </div>
  );
}
