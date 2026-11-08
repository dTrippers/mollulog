import { PencilIcon, Square3Stack3DIcon } from "@heroicons/react/16/solid";
import { useEffect, useId, useState } from "react";
import { MAX_RECRUITMENT_STACK, type RecruitmentStacks } from "~/domain/pyroxene-recruitment-goal";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { Button } from "../../primitives/Button";
import { NumberInput } from "../../primitives/NumberInput";
import {
  formatAmount,
  PlannerDialog,
  PYROXENE_RESOURCE_LABELS,
  type PyroxeneResourceKey,
  RECRUITMENT_STACK_LABELS,
  ResourceIcon,
} from "./pyroxene-ui";

export type OwnedResourceValues = { resources: PickupResources; stacks: RecruitmentStacks };

const RESOURCE_ORDER: PyroxeneResourceKey[] = ["pyroxene", "tenTimeTicket", "oneTimeTicket"];
const STACK_ORDER = ["regular", "limited"] as const;

/** Owned resources and stacks, read-only, as a list. */
export function OwnedResourceList({ values, stacksEntered }: { values: OwnedResourceValues; stacksEntered: boolean }) {
  return (
    <dl className="flex flex-col gap-2.5 text-sm">
      {RESOURCE_ORDER.map((key) => (
        <div key={key} className="flex items-center gap-2">
          <ResourceIcon resource={key} />
          <dt className="min-w-0 flex-1 text-v2-fg-secondary">{PYROXENE_RESOURCE_LABELS[key]}</dt>
          <dd className="font-semibold tabular-nums text-v2-fg">{formatAmount(values.resources[key])}</dd>
        </div>
      ))}
      {STACK_ORDER.map((scope) => (
        <div key={scope} className={`flex items-center gap-2${scope === "regular" ? " mt-1" : ""}`}>
          <Square3Stack3DIcon className="size-6 shrink-0 p-1 text-v2-fg-tertiary" aria-hidden="true" />
          <dt className="min-w-0 flex-1 text-v2-fg-secondary">{RECRUITMENT_STACK_LABELS[scope]}</dt>
          <dd className="font-semibold tabular-nums text-v2-fg">
            {values.stacks[scope]}
            {stacksEntered ? null : <span className="sr-only"> (입력 전, 0으로 계산)</span>}
          </dd>
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

/** Edits resources and stacks. The completion record reuses it with the expected values filled in. */
export function OwnedResourcesDialog({
  open,
  title,
  submitLabel,
  description,
  initialValues,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  description?: string;
  initialValues: OwnedResourceValues;
  onClose: () => void;
  onSubmit: (values: OwnedResourceValues) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const idPrefix = useId();
  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, initialValues]);

  return (
    <PlannerDialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => onSubmit(values)}>
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
        <p className="text-xs text-v2-fg-tertiary">
          개편 규칙의 모집에서 쌓인 횟수예요. 200회째에 픽업 학생을 확정으로 얻고, 픽업 학생을 얻으면 0으로 돌아가요.
        </p>
      </div>
    </PlannerDialog>
  );
}
