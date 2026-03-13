import dayjs from "dayjs";
import { useState } from "react";
import PlannerButtonForm from "./PlannerButtonForm";
import PlannerInputForm from "./PlannerInputForm";
import PlannerFormGroup from "./PlannerFormGroup";

type BuyInputProps = {
  onSaveBuy: (quantity: number, date: Date) => void;
};

export default function BuyInput({ onSaveBuy }: BuyInputProps) {
  const [quantity, setQuantity] = useState(6600);
  const [date, setDate] = useState(new Date());

  // Check if the date (without time) is before today
  const dateIsBeforeToday = dayjs(date).startOf("day").isBefore(dayjs().startOf("day"));

  return (
    <>
      <p className="mb-2 text-sm text-neutral-500">구매할 청휘석의 수량과 날짜를 입력해주세요</p>
      <PlannerFormGroup>
        <PlannerInputForm
          label="구매 수량"
          type="number"
          defaultValue="6600"
          onChange={(value) => setQuantity(Number(value))}
          error={quantity <= 0 ? "구매 수량은 0보다 커야 해요" : undefined}
        />
        <PlannerInputForm
          label="구매 날짜"
          type="date"
          defaultValue={dayjs().format("YYYY-MM-DD")}
          onChange={(value) => setDate(new Date(value))}
          error={dateIsBeforeToday ? "구매 날짜가 오늘보다 이전이에요" : undefined}
        />
        <PlannerButtonForm
          label="저장"
          color="blue"
          onClick={() => onSaveBuy(quantity, date)}
        />
      </PlannerFormGroup>
    </>
  )
}
