import dayjs from "dayjs";
import { useState } from "react";
import { Button, Input } from "~/components/primitives";

type AttendanceInputProps = {
  onSaveAttendance: (startDate: Date) => void;
  disabled?: boolean;
};

export default function AttendanceInput({ onSaveAttendance, disabled = false }: AttendanceInputProps) {
  const [startDate, setStartDate] = useState(new Date());

  return (
    <>
      <p className="mb-2 text-sm text-neutral-500">
        출석 1일차 기준 날짜를 입력해주세요.
        <br />
        5일차에 50개, 10일치에 100개의 청휘석을 획득해요.
      </p>
      <div className="space-y-4">
        <Input
          label="출석 1일차 기준 날짜"
          type="date"
          size="sm"
          defaultValue={dayjs().format("YYYY-MM-DD")}
          onChange={(value) => setStartDate(new Date(value))}
        />
        <Button
          text="저장"
          variant="tint-blue"
          fullWidth
          className="mt-2"
          disabled={disabled}
          onClick={() => onSaveAttendance(startDate)}
        />
      </div>
    </>
  );
}
