import { StudentSelectForm } from "~/components/features/forms";
import { Checkbox, Input } from "~/components/primitives";

type PickupHistoryEditorProps = {
  tier3Students: {
    uid: string;
    name: string;
  }[];
  exchangeableStudents: {
    uid: string;
    name: string;
  }[];

  totalCount?: number;
  tier3Count?: number;
  tier3StudentIds: string[];
  skipTier3StudentList: boolean;
  exchangedStudentIds: string[];

  onTotalCountChange: (value?: number) => void;
  onTier3CountChange: (value?: number) => void;
  onTier3StudentIdsChange: (value: string[]) => void;
  onSkipTier3StudentListChange: (value: boolean) => void;
  onExchangedStudentIdsChange: (value: string[]) => void;
};

export default function PickupHistoryEditor({
  tier3Students,
  exchangeableStudents,
  totalCount,
  tier3Count,
  tier3StudentIds,
  skipTier3StudentList,
  exchangedStudentIds,
  onTotalCountChange,
  onTier3CountChange,
  onTier3StudentIdsChange,
  onSkipTier3StudentListChange,
  onExchangedStudentIdsChange,
}: PickupHistoryEditorProps) {
  const exchangeCountLimit = Math.floor((totalCount ?? 0) / 200);

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
          }}
          descriptionClassName="text-muted-foreground/75"
          className="max-w-none"
          containerClassName="mt-0 mb-0"
        />
      </div>
      <div>
        {tier3Count !== undefined && tier3Count > 0 && (
          <StudentSelectForm
            label="모집한 ★3 학생"
            description="모집한 ★3 학생을 선택해주세요"
            descriptionAction={
              <Checkbox label="선택하지 않기" checked={skipTier3StudentList} onChange={onSkipTier3StudentListChange} />
            }
            students={tier3Students}
            initialStudentUids={tier3StudentIds}
            hideInput={skipTier3StudentList}
            onSelect={(value) => onTier3StudentIdsChange(value as string[])}
            multiple
            allowDuplicateSelection
            maxSelectedCount={tier3Count}
            className="max-w-none"
            containerClassName="mt-0 mb-0"
          />
        )}
        {exchangeCountLimit > 0 && exchangeableStudents.length > 0 && (
          <div className={tier3Count !== undefined && tier3Count > 0 ? "pt-5" : undefined}>
            <StudentSelectForm
              label="모집 포인트 교환 학생"
              description={`${totalCount}회 모집 기준 최대 ${exchangeCountLimit}명까지 선택할 수 있어요`}
              students={exchangeableStudents}
              initialStudentUids={exchangedStudentIds}
              onSelect={(value) => onExchangedStudentIdsChange(value as string[])}
              multiple
              allowDuplicateSelection
              maxSelectedCount={exchangeCountLimit}
              className="max-w-none"
              containerClassName="mt-0 mb-0"
            />
          </div>
        )}
      </div>
    </div>
  );
}
