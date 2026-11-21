import { PencilIcon, Square3Stack3DIcon } from "@heroicons/react/16/solid";
import { useEffect, useId, useState } from "react";
import { MAX_RECRUITMENT_STACK, type RecruitmentStacks } from "~/domain/pyroxene-recruitment-goal";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { NumberInput } from "../../primitives/NumberInput";
import {
  formatAmount,
  formatSigned,
  KST,
  PlannerDialog,
  PYROXENE_RESOURCE_LABELS,
  type PyroxeneResourceKey,
  RECRUITMENT_STACK_LABELS,
  ResourceIcon,
} from "./pyroxene-ui";

export type OwnedResourceValues = { resources: PickupResources; stacks: RecruitmentStacks };

/** An event reward that may already be in the owned resources. */
export type ReceivableReward = { sourceKey: string; label: string; pyroxene: number; date: Date };

const RESOURCE_ORDER: PyroxeneResourceKey[] = ["pyroxene", "tenTimeTicket", "oneTimeTicket"];
const STACK_ORDER = ["regular", "limited"] as const;

/** Owned resources and stacks, read-only, as a list. */
export function OwnedResourceList({ values }: { values: OwnedResourceValues }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {RESOURCE_ORDER.map((key) => (
        <div key={key} className="flex items-center gap-2">
          <ResourceIcon resource={key} />
          <dt className="min-w-0 flex-1 text-v2-fg-secondary">{PYROXENE_RESOURCE_LABELS[key]}</dt>
          <dd className="font-medium tabular-nums text-v2-fg">{formatAmount(values.resources[key])}</dd>
        </div>
      ))}
      {/* A stack of 0 is the common case and adds nothing, so only a stack in progress shows. */}
      {STACK_ORDER.filter((scope) => values.stacks[scope] !== 0).map((scope) => (
        <div key={scope} className="flex items-center gap-2">
          <Square3Stack3DIcon className="-my-1 size-6 shrink-0 p-1 text-v2-fg-tertiary" aria-hidden="true" />
          <dt className="min-w-0 flex-1 text-v2-fg-secondary">{RECRUITMENT_STACK_LABELS[scope]}</dt>
          <dd className="font-medium tabular-nums text-v2-fg">{values.stacks[scope]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OwnedResourcesHeaderAction({ onEdit }: { onEdit: () => void }) {
  return (
    <Button size="sm" onClick={onEdit}>
      <PencilIcon className="size-3.5" aria-hidden="true" />
      수정
    </Button>
  );
}

export function formatInputAt(inputAt: Date | null): string {
  return inputAt ? `${dayjs(inputAt).tz("Asia/Seoul").format("MM/DD HH:mm")} 입력` : "아직 입력하지 않았어요";
}

const NO_REWARDS: ReceivableReward[] = [];
const NO_RECEIVED: readonly string[] = [];

/** Edits resources and stacks. The completion record reuses it with the expected values filled in. */
export function OwnedResourcesDialog({
  open,
  title,
  submitLabel,
  description,
  initialValues,
  // Stable defaults: the reset effect below depends on initialReceived.
  rewards = NO_REWARDS,
  initialReceived = NO_RECEIVED,
  saving = false,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  description?: string;
  initialValues: OwnedResourceValues;
  // Rewards of started events still ahead in the schedule; the owned resources may already include them.
  rewards?: ReceivableReward[];
  initialReceived?: readonly string[];
  // An owned-resources save is in flight; a second one would cancel it.
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: OwnedResourceValues, received: ReadonlySet<string>) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [received, setReceived] = useState<ReadonlySet<string>>(new Set(initialReceived));
  const idPrefix = useId();
  useEffect(() => {
    if (!open) return;
    setValues(initialValues);
    setReceived(new Set(initialReceived));
  }, [open, initialValues, initialReceived]);

  return (
    <PlannerDialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={saving} onClick={() => onSubmit(values, received)}>
            {submitLabel}
          </Button>
        </>
      }
    >
      {description ? <p className="text-sm text-v2-fg-secondary">{description}</p> : null}
      <div className="flex flex-col gap-3">
        {RESOURCE_ORDER.map((key) => (
          <div key={key} className="flex items-center gap-3">
            <ResourceIcon resource={key} className="size-6" />
            <label htmlFor={`${idPrefix}-${key}`} className="min-w-0 flex-1 text-sm text-v2-fg">
              {PYROXENE_RESOURCE_LABELS[key]}
            </label>
            <div className="w-44">
              <NumberInput
                id={`${idPrefix}-${key}`}
                grouped
                showMin={false}
                showMax={false}
                formatThousands
                min={0}
                step={key === "pyroxene" ? 120 : 1}
                value={values.resources[key]}
                aria-label={PYROXENE_RESOURCE_LABELS[key]}
                onValueChange={(value) =>
                  setValues((current) => ({ ...current, resources: { ...current.resources, [key]: value } }))
                }
              />
            </div>
          </div>
        ))}
        {STACK_ORDER.map((scope) => (
          <div key={scope} className="flex items-center gap-3">
            <Square3Stack3DIcon className="size-6 shrink-0 p-0.5 text-v2-fg-tertiary" aria-hidden="true" />
            <label htmlFor={`${idPrefix}-${scope}`} className="min-w-0 flex-1 text-sm text-v2-fg">
              {RECRUITMENT_STACK_LABELS[scope]}
            </label>
            <div className="w-44">
              <NumberInput
                id={`${idPrefix}-${scope}`}
                grouped
                showMin={false}
                showMax={false}
                min={0}
                max={MAX_RECRUITMENT_STACK}
                value={values.stacks[scope]}
                aria-label={RECRUITMENT_STACK_LABELS[scope]}
                onValueChange={(value) =>
                  setValues((current) => ({ ...current, stacks: { ...current.stacks, [scope]: value } }))
                }
              />
            </div>
          </div>
        ))}
      </div>
      {rewards.length > 0 ? (
        <section className="flex flex-col gap-2 border-t border-v2-divider pt-4">
          <h3 className="text-sm font-semibold text-v2-fg">이미 받은 보상</h3>
          <ul className="flex flex-col gap-2">
            {rewards.map((reward) => (
              <li key={reward.sourceKey} className="flex items-start gap-3">
                <Checkbox
                  id={`${idPrefix}-${reward.sourceKey}`}
                  checked={received.has(reward.sourceKey)}
                  onCheckedChange={(checked) =>
                    setReceived((current) => {
                      const next = new Set(current);
                      if (checked) next.add(reward.sourceKey);
                      else next.delete(reward.sourceKey);
                      return next;
                    })
                  }
                >
                  {/* Content names carry their own line breaks, as in the schedule. */}
                  <span className="break-keep whitespace-pre-line">{reward.label}</span>
                </Checkbox>
                <span className="ml-auto flex shrink-0 flex-col items-end text-sm tabular-nums">
                  <span className="inline-flex items-center gap-0.5 font-semibold text-v2-fg">
                    <ResourceIcon resource="pyroxene" className="my-0 size-4" />
                    {formatSigned(reward.pyroxene)}
                  </span>
                  <span className="text-xs text-v2-fg-tertiary">{dayjs(reward.date).tz(KST).format("MM/DD")} 지급</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PlannerDialog>
  );
}
