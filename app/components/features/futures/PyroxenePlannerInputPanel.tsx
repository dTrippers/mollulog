import { useState } from "react";
import FilterButtons from "~/components/navigation/FilterButtons";
import type { PickupResources } from ".";
import ResourcesInput from "./planner-input/ResourcesInput";
import BuyInput from "./planner-input/BuyInput";
import PackageInput from "./planner-input/PackageInput";
import AttendanceInput from "./planner-input/AttendanceInput";

type PyroxenePlannerInputPanelProps = {
  onSaveBuy: (quantity: number, date: Date) => void;
  onSavePackage: (startDate: Date, packageType: "half" | "full") => void;
  onSaveAttendance: (startDate: Date) => void;
  onSaveOther: (resources: PickupResources, description: string, date: Date) => void;
};

type InputMode = "buy" | "package" | "attendance" | "other";

const inputModeOptions: { text: string; mode: InputMode }[] = [
  { text: "청휘석 구매", mode: "buy" },
  { text: "월간 패키지", mode: "package" },
  { text: "출석", mode: "attendance" },
  { text: "기타", mode: "other" },
];

export default function PyroxenePlannerInputPanel({ onSaveBuy, onSavePackage, onSaveAttendance, onSaveOther }: PyroxenePlannerInputPanelProps) {
  const [inputMode, setInputMode] = useState<InputMode | null>(null);
  const toggle = (mode: InputMode, activated: boolean) => {
    if (activated) {
      setInputMode(mode);
    } else {
      setInputMode(null);
    }
  };

  return (
    <>
      <div className="mb-2">
        <FilterButtons
          buttonProps={inputModeOptions.map(({ text, mode }) => ({
            text,
            active: inputMode === mode,
            onToggle: (activated) => toggle(mode, activated),
          }))}
          exclusive
        />

        <div className="mb-3" />

        {inputMode === "buy" && (
          <BuyInput
            onSaveBuy={(quantity, date) => {
              onSaveBuy(quantity, date);
              setInputMode(null);
            }}
          />
        )}
        {inputMode === "package" && (
          <PackageInput
            onSavePackage={(startDate, packageType) => {
              onSavePackage(startDate, packageType);
              setInputMode(null);
            }}
          />
        )}
        {inputMode === "attendance" && (
          <AttendanceInput
            onSaveAttendance={(startDate) => {
              onSaveAttendance(startDate);
              setInputMode(null);
            }}
          />
        )}
        {inputMode === "other" && (
          <ResourcesInput
            onSaveResources={(resources, description, date) => {
              if (description === undefined || date === undefined) {
                return;
              }
              onSaveOther(resources, description, date);
              setInputMode(null);
            }}
            descriptionInput dateInput vertical
          />
        )}
        {inputMode === null && (
          <p className="text-sm text-neutral-500 text-center py-8">
            재화 획득 방식을 선택해주세요
          </p>
        )}
      </div>
    </>
  );
}
