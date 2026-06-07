import { StudentSelectForm } from "~/components/features/forms";
import { Input } from "~/components/primitives";

type PickupHistoryEditorProps = {
  tier3Students: {
    uid: string;
    name: string;
  }[];

  totalCount?: number;
  tier3Count?: number;
  tier3StudentIds: string[];

  onTotalCountChange: (value?: number) => void;
  onTier3CountChange: (value?: number) => void;
  onTier3StudentIdsChange: (value: string[]) => void;
};

export default function PickupHistoryEditor(
  {
    tier3Students,
    totalCount,
    tier3Count,
    tier3StudentIds,
    onTotalCountChange,
    onTier3CountChange,
    onTier3StudentIdsChange,
  }: PickupHistoryEditorProps,
) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Input
          type="number"
          label="총 모집 횟수"
          description="전체 모집 횟수를 입력해주세요"
          placeholder="200"
          value={totalCount?.toString() ?? ""}
          onChange={(value) => {
            const newCount = Number.parseInt(value);
            onTotalCountChange(Number.isNaN(newCount) ? undefined : newCount);
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
          value={tier3Count?.toString() ?? ""}
          onChange={(value) => {
            const newCount = Number.parseInt(value);
            onTier3CountChange(Number.isNaN(newCount) ? undefined : newCount);
            if (!Number.isNaN(newCount) && tier3StudentIds.length > newCount) {
              onTier3StudentIdsChange(tier3StudentIds.slice(0, newCount));
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
          onSelect={(value) => onTier3StudentIdsChange(value as string[])}
          multiple
          allowDuplicateSelection
          maxSelectedCount={tier3Count}
          className="max-w-none"
          containerClassName="mt-0 mb-0"
        />
      )}
    </div>
  );
};
