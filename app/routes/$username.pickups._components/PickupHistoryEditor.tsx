import { useState } from "react";
import { StudentSelectForm } from "~/components/features/forms";
import { Button, Input } from "~/components/primitives";

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
  const canSave = totalCount !== undefined && totalCount > 0 && tier3Count !== undefined && tier3StudentIds.length === tier3Count;
  const handleSave = () => {
    if (!canSave) {
      return;
    }

    onComplete({ totalCount, tier3Count, tier3StudentIds });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Input
          type="number"
          label="총 모집 횟수"
          description="전체 모집 횟수를 입력해주세요"
          placeholder="200"
          defaultValue={initialTotalCount?.toString()}
          onChange={(value) => {
            const newCount = Number.parseInt(value);
            setTotalCount(Number.isNaN(newCount) ? undefined : newCount);
          }}
          descriptionClassName="text-muted-foreground/75"
          className="max-w-none"
          containerClassName="mt-0 mb-0"
        />
        <Input
          type="number"
          label="모집한 ★3 횟수"
          description="모집한 ★3 학생의 수를 입력해주세요"
          placeholder="6"
          defaultValue={initialTier3Count?.toString()}
          onChange={(value) => {
            const newCount = Number.parseInt(value);
            setTier3Count(Number.isNaN(newCount) ? undefined : newCount);
            if (!Number.isNaN(newCount) && tier3StudentIds.length > newCount) {
              setTier3StudentIds((prev) => prev.slice(0, newCount));
            }
          }}
          descriptionClassName="text-muted-foreground/75"
          className="max-w-none"
          containerClassName="mt-0 mb-0"
        />
      </div>
      {tier3Count !== undefined && tier3Count > 0 && (
        <StudentSelectForm
          label="모집한 ★3 학생"
          description="모집한 ★3 학생을 선택해주세요"
          students={tier3Students}
          initialStudentUids={tier3StudentIds}
          onSelect={(value) => setTier3StudentIds(value as string[])}
          multiple
          allowDuplicateSelection
          maxSelectedCount={tier3Count}
          className="max-w-none"
          containerClassName="mt-0 mb-0"
        />
      )}
      {canSave && (
        <div className="pt-2">
          <Button
            text="모집 결과 저장"
            variant="primary"
            onClick={handleSave}
          />
        </div>
      )}
    </div>
  );
};
