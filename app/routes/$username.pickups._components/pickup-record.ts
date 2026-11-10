import { pickupGroupTypeLocale } from "~/locales/ko";

// The delete action answers with this code when the record could not be deleted, so the card can say so.
export const DELETE_FAILED = "pickup_history.delete_failed";
// The editor's save action answers with this code when the record could not be saved, so the save bar can say so.
export const SAVE_FAILED = "pickup_history.save_failed";

export type PickupStudent = {
  uid: string;
  name: string;
  pickup: boolean;
  tier: number;
};

export function getPickupTypeLabel(type: string): string {
  return pickupGroupTypeLocale[type] ?? "픽업 모집";
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

// Two decimals, as the statistics have always shown. The caller passes a draw count that already carries the fes factor.
export function formatRate(rateCount: number, trial: number): string {
  return `${((rateCount / trial) * 100).toFixed(2)}%`;
}

export const textareaClassName =
  "block w-full resize-y rounded-md border border-v2-control-border bg-v2-surface px-3 py-2 text-base text-v2-fg placeholder:text-v2-fg-tertiary focus:border-v2-control-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus sm:text-sm";
