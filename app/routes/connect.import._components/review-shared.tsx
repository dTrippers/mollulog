import { CheckIcon, ExclamationTriangleIcon, MinusIcon } from "@heroicons/react/16/solid";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { useId } from "react";
import { Form, useNavigation } from "react-router";
import { PageActionBar } from "~/components/v2/layout/PageActionBar";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { useV2Page } from "~/components/v2/layout/V2Page";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { cn } from "~/lib/utils";
import { TierFace } from "../connect._components/TierFace";
import type { SyncDraftDisplayMetadata, SyncDraftReviewActionData } from "./review-types";

export type { SyncDraftDisplayMetadata, SyncDraftReviewActionData };
export { TierFace };

/** The cell and row states of a review table, shared by the student and the item/tier reviews. */
export const reviewChangedClassName = "ring-1 ring-inset ring-v2-accent";

/** A checkbox that can show a partial selection. The name comes from `label`, so a table needs no visible text. */
export function SelectionCheckbox({
  checked,
  mixed = false,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  mixed?: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const active = checked || mixed;
  return (
    <span className="relative inline-flex size-4 shrink-0">
      <input
        type="checkbox"
        aria-label={label}
        aria-checked={mixed ? "mixed" : checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        className={cn(
          "peer size-4 cursor-pointer appearance-none rounded border bg-transparent disabled:cursor-not-allowed disabled:opacity-50",
          active ? "border-v2-accent bg-v2-accent" : "border-v2-fg-tertiary",
          v2FocusRing,
        )}
      />
      {mixed ? (
        <MinusIcon
          className="pointer-events-none absolute inset-0 m-auto size-3.5 text-v2-on-media"
          aria-hidden="true"
        />
      ) : (
        <CheckIcon
          className={cn(
            "pointer-events-none absolute inset-0 m-auto size-3.5 text-v2-on-media",
            checked ? "opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

/** The mark beside a student or item name for a value to check. Its reasons are the accessible description. */
export function ReviewWarningMark({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  const description = reasons.join(" ");
  return (
    <button
      type="button"
      aria-label={`확인 필요: ${description}`}
      title={description}
      className={cn("inline-flex shrink-0 cursor-help rounded-sm text-v2-warning", v2FocusRing)}
    >
      <ExclamationTriangleIcon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

/** The reading guide above a review table. */
// `showCurrentHint` is for reviews that print the current value under each input; others show it in its own column.
export function ReviewLegend({ showCurrentHint = true }: { showCurrentHint?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-v2-fg-tertiary">
      {showCurrentHint ? <span>입력칸 아래 숫자는 지금 값</span> : null}
      <span className="inline-flex items-center gap-1">
        <span className={cn("inline-block h-3.5 w-4 rounded-sm", reviewChangedClassName)} aria-hidden="true" />
        바뀌는 값
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3.5 w-4 rounded-sm bg-v2-warning-subtle" aria-hidden="true" />
        확인할 값
      </span>
      <span className="inline-flex items-center gap-1">
        <ExclamationTriangleIcon className="size-3.5 text-v2-warning" aria-hidden="true" />
        확인 필요
      </span>
    </div>
  );
}

/**
 * The bottom bar of a pending review: the selection summary and what happens to the unselected values, the failure of
 * the last attempt, and the delete and apply actions. The forms are the review's own, joined by id.
 */
export function DraftApplyBar({
  applyFormId,
  summary,
  discardNote,
  canApply,
  actionData,
  invalidInputCount,
}: {
  applyFormId: string;
  summary: ReactNode;
  discardNote: string;
  canApply: boolean;
  actionData?: SyncDraftReviewActionData;
  invalidInputCount: number;
}) {
  const navigation = useNavigation();
  const { stacked } = useV2Page();
  const discardFormId = useId();
  const submittingIntent = navigation.state === "submitting" ? navigation.formData?.get("intent") : null;
  const isApplying = submittingIntent === "apply";
  const isDiscarding = submittingIntent === "discard";
  const busy = navigation.state === "submitting";
  const applyFailed = actionData?.code === "apply_failed";
  const conflictMessage =
    actionData?.code === "conflict" || actionData?.code === "invalid_selection" ? actionData.error : null;

  return (
    <>
      <Form method="post" id={discardFormId} className="hidden" />
      <div className="flex flex-col gap-v2-block-gap">
        {invalidInputCount > 0 ? (
          <div role="alert">
            <StatusNotice tone="danger" boxed>
              확인할 입력값이 {invalidInputCount.toLocaleString("ko-KR")}개 있어요.
            </StatusNotice>
          </div>
        ) : null}
        {applyFailed ? (
          <div role="alert">
            <StatusNotice
              tone="danger"
              boxed
              action={
                <Button type="submit" name="intent" value="apply" form={applyFormId} size="sm" disabled={busy}>
                  다시 시도
                </Button>
              }
            >
              프로필에 반영하지 못했어요. 입력한 값은 그대로 있어요. 잠시 후 다시 시도해주세요.
            </StatusNotice>
          </div>
        ) : null}
        {actionData?.code === "discard_failed" ? (
          <div role="alert">
            <StatusNotice tone="danger" boxed>
              데이터를 삭제하지 못했어요. 잠시 후 다시 시도해주세요.
            </StatusNotice>
          </div>
        ) : null}
        {conflictMessage ? (
          <div role="alert">
            <StatusNotice tone="danger" boxed>
              {conflictMessage}
            </StatusNotice>
          </div>
        ) : null}
        <PageActionBar
          placement={stacked ? "fixed" : "sticky"}
          expandActions
          summary={
            <div className="flex flex-col gap-0.5">
              <span>{summary}</span>
              <span className="text-xs font-normal text-v2-fg-tertiary">{discardNote}</span>
            </div>
          }
        >
          <Button
            type="submit"
            name="intent"
            value="discard"
            form={discardFormId}
            variant="danger-subtle"
            disabled={busy}
          >
            {isDiscarding ? "삭제 중…" : "삭제"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="apply"
            form={applyFormId}
            variant="primary"
            disabled={busy || !canApply}
          >
            {isApplying ? <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isApplying ? "반영 중…" : "프로필에 반영"}
          </Button>
        </PageActionBar>
        {/* The stacked bar is fixed above the navigation, so the screen keeps room for it at the end. */}
        {stacked ? <div aria-hidden="true" className="h-[calc(var(--mobile-nav-height)+5.5rem)]" /> : null}
      </div>
    </>
  );
}
