import dayjs from "dayjs";
import { useState } from "react";
import { CheckIcon } from "@heroicons/react/16/solid";
import { Button, Field, Input, NumberInput, Toggle } from "~/components/primitives";
import { cn } from "~/lib/utils";
import {
  DEFAULT_BUY_PYROXENE_QUANTITY,
  PYROXENE_BUY_PRESET_GROUPS,
} from "~/models/pyroxene-planner-source-config";
import type { PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";

type BuyInputProps = {
  onSaveBuy: (
    quantity: number,
    date: Date,
    options?: { repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number },
  ) => void;
};

export default function BuyInput({ onSaveBuy }: BuyInputProps) {
  const [monthlyRepeat, setMonthlyRepeat] = useState(false);
  const [quantity, setQuantity] = useState(DEFAULT_BUY_PYROXENE_QUANTITY);
  const [monthlyCount, setMonthlyCount] = useState(1);
  const [date, setDate] = useState(new Date());
  const [showMorePresets, setShowMorePresets] = useState(false);

  const presets = PYROXENE_BUY_PRESET_GROUPS.flatMap((group) =>
    group.presets.map((preset) => ({ ...preset, limited: group.id === "limited" })),
  );
  const visiblePresets = showMorePresets ? presets : presets.slice(0, 3);

  return (
    <>
      <p className="mb-2 text-sm text-neutral-500">구매한 청휘석 상품과 날짜를 선택해주세요</p>
      <div className="space-y-4">
        <Input
          label="구매 날짜"
          type="date"
          size="sm"
          containerClassName="min-w-0 max-w-full"
          className="min-w-0 max-w-full appearance-none"
          defaultValue={dayjs().format("YYYY-MM-DD")}
          onChange={(value) => setDate(new Date(value))}
        />
        <Field label="구매 상품">
          <div className="grid grid-cols-3 gap-2">
            {visiblePresets.map((preset) => {
              const selected = quantity === preset.quantity;

              return (
                <button
                  key={`${preset.limited ? "limited" : "regular"}-${preset.quantity}`}
                  type="button"
                  className={cn(
                    "relative flex cursor-pointer flex-col rounded-md border px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : "border-neutral-200 bg-background text-foreground hover:bg-muted dark:border-neutral-700",
                  )}
                  aria-pressed={selected}
                  onClick={() => setQuantity(preset.quantity)}
                >
                  <span className="text-sm font-semibold leading-5">{preset.quantity.toLocaleString()}개</span>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {preset.price}
                    {preset.limited && (
                      <>
                        <span className="hidden sm:inline"> · </span>
                        <span className="block sm:inline">한정 구매</span>
                      </>
                    )}
                  </span>
                  {selected && <CheckIcon className="absolute top-2 right-2 size-4" />}
                </button>
              );
            })}
          </div>
          {!showMorePresets && (
            <button
              type="button"
              className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setShowMorePresets(true)}
            >
              그 외 상품 더 보기
            </button>
          )}
        </Field>
        <Field label="구매 주기">
          <Toggle
            label="매월 반복 구매"
            initialState={monthlyRepeat}
            className="my-2"
            onChange={setMonthlyRepeat}
          />
        </Field>
        {monthlyRepeat && (
          <div className="space-y-2">
            <NumberInput
              label="월 구매 횟수"
              size="sm"
              minValue={1}
              value={monthlyCount}
              onChange={(value) => setMonthlyCount(Math.max(1, Math.floor(value)))}
            />
            <p className="text-xs text-muted-foreground">
              입력한 날짜에 {(quantity * monthlyCount).toLocaleString()}개를 반영하고, 다음 달부터 매월 1일 같은 수량을
              반복 반영해요
            </p>
          </div>
        )}
        <Button
          text="저장"
          variant="tint-blue"
          fullWidth
          className="mt-2"
          onClick={() =>
            onSaveBuy(
              quantity,
              date,
              monthlyRepeat ? { repeatType: "monthly_first", monthlyCount } : undefined,
            )
          }
        />
      </div>
    </>
  );
}
