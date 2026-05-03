import { useState } from "react";
import dayjs from "dayjs";
import { Button, Field, FilterButtons, Input } from "~/components/primitives";

type PackageInputProps = {
  onSavePackage: (startDate: Date, packageType: "half" | "full") => void;
  disabled?: boolean;
};

export default function PackageInput({ onSavePackage, disabled = false }: PackageInputProps) {
  const [packageType, setPackageType] = useState<"half" | "full">("full");
  const [startDate, setStartDate] = useState(new Date());

  return (
    <>
      <p className="mb-2 text-sm text-neutral-500">월간 패키지의 구매 정보를 입력해주세요</p>
      <div className="space-y-4">
        <Field label="패키지 종류">
          <FilterButtons
            size="sm"
            exclusive
            atLeastOne
            buttonProps={[
              {
                text: "월간",
                active: packageType === "full",
                onToggle: (activated) => {
                  if (activated) {
                    setPackageType("full");
                  }
                },
              },
              {
                text: "하프",
                active: packageType === "half",
                onToggle: (activated) => {
                  if (activated) {
                    setPackageType("half");
                  }
                },
              },
            ]}
          />
        </Field>
        <Input
          label="패키지 시작 날짜"
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
          onClick={() => onSavePackage(startDate, packageType)}
        />
      </div>
    </>
  );
}
