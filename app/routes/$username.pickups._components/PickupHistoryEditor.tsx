import { useState } from "react";
import { ButtonForm, FormGroup, InputForm, StudentSelectForm } from "~/components/features/forms";

type PickupHistoryEditorProps = {
  tier3Students: {
    uid: string;
    name: string;
  }[];

  initialTotalCount?: number;
  initialTier3Count?: number;
  initialTier3StudentIds?: string[];

  onComplete: (pickupData: {
    totalCount: number;
    tier3Count: number;
    tier3StudentIds: string[];
  }) => void;
};

export default function PickupHistoryEditor(
  { tier3Students, initialTotalCount, initialTier3Count, initialTier3StudentIds, onComplete }: PickupHistoryEditorProps,
) {
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [tier3Count, setTier3Count] = useState(initialTier3Count);
  const [tier3StudentIds, setTier3StudentIds] = useState(initialTier3StudentIds ?? []);

  return (
    <FormGroup>
      <InputForm
        type="number"
        label="총 모집 횟수"
        description="전체 모집 횟수를 입력해주세요"
        placeholder="200"
        defaultValue={initialTotalCount?.toString()}
        onChange={(value) => setTotalCount(Number.parseInt(value))}
      />
      <InputForm
        type="number"
        label="모집한 ★3 횟수"
        description="모집한 ★3 학생의 수를 입력해주세요"
        placeholder="6"
        defaultValue={initialTier3Count?.toString()}
        onChange={(value) => {
          const newCount = Number.parseInt(value);
          setTier3Count(Number.isNaN(newCount) ? undefined : newCount);
          if (tier3StudentIds.length > newCount) {
            setTier3StudentIds((prev) => prev.slice(0, newCount));
          }
        }}
      />
      {tier3Count && tier3Count > 0 && (
        <StudentSelectForm
          label="모집한 ★3 학생"
          description="모집한 ★3 학생을 선택해주세요"
          students={tier3Students}
          initialStudentUids={tier3StudentIds}
          onSelect={(value) => setTier3StudentIds(value as string[])}
          multiple
        />
      )}
      {totalCount && totalCount > 0 && tier3Count !== undefined && tier3StudentIds.length === tier3Count && (
        <ButtonForm
          label="모집 결과 저장"
          color="blue"
          onClick={() => onComplete({ totalCount, tier3Count, tier3StudentIds })}
        />
      )}
    </FormGroup>
  );
};
