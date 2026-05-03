import dayjs from "dayjs";
import { useState } from "react";
import { Button, Input } from "~/components/primitives";

type BuyInputProps = {
  onSaveBuy: (quantity: number, date: Date) => void;
};

export default function BuyInput({ onSaveBuy }: BuyInputProps) {
  const [quantity, setQuantity] = useState(6600);
  const [date, setDate] = useState(new Date());

  const quantityError = quantity <= 0 ? "구매 수량은 0보다 커야 해요" : undefined;

  return (
    <>
      <p className="mb-2 text-sm text-neutral-500">구매할 청휘석의 수량과 날짜를 입력해주세요</p>
      <div className="space-y-4">
        <Input
          label="구매 수량"
          type="number"
          size="sm"
          defaultValue="6600"
          onChange={(value) => setQuantity(Number(value))}
          error={quantityError}
        />
        <Input
          label="구매 날짜"
          type="date"
          size="sm"
          defaultValue={dayjs().format("YYYY-MM-DD")}
          onChange={(value) => setDate(new Date(value))}
        />
        <Button
          text="저장"
          variant="tint-blue"
          fullWidth
          className="mt-2"
          disabled={!!quantityError}
          onClick={() => onSaveBuy(quantity, date)}
        />
      </div>
    </>
  );
}
