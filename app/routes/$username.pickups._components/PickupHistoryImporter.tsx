import { useEffect, useState } from "react";
import { StudentSelectForm } from "~/components/features/forms";
import { Button, Textarea } from "~/components/primitives";
import { parsePickupHistory } from "~/models/pickup-history";

type PickupHistoryImporterProps = {
  tier3Students: {
    uid: string;
    name: string;
  }[];

  initialTotalCount?: number;
  initialTier3Count?: number;
  initialTier3StudentIds?: string[];
  initialRawData?: string;

  onComplete: (pickupData: {
    totalCount: number;
    tier3Count: number;
    tier3StudentIds: string[];
    rawData: string;
  }) => void;
};

export default function PickupHistoryImporter(
  { tier3Students, initialTotalCount, initialTier3Count, initialTier3StudentIds, initialRawData, onComplete }: PickupHistoryImporterProps,
) {
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [tier3Count, setTier3Count] = useState(initialTier3Count);
  const [tier3StudentIds, setTier3StudentIds] = useState(initialTier3StudentIds ?? []);
  const [rawData, setRawData] = useState(initialRawData);
  const canSelectTier3Students = tier3Count !== undefined && tier3Count > 0;
  const canSave = Boolean(
    totalCount !== undefined &&
      totalCount > 0 &&
      tier3Count !== undefined &&
      tier3StudentIds.length === tier3Count &&
      rawData,
  );
  const handleSave = () => {
    if (!canSave || totalCount === undefined || tier3Count === undefined || !rawData) {
      return;
    }

    onComplete({ totalCount, tier3Count, tier3StudentIds, rawData });
  };

  useEffect(() => {
    if (rawData && tier3StudentIds.length === 0) {
      const parsedResult = parsePickupHistory(rawData, tier3Students);
      setTotalCount(parsedResult.length > 0 ? Math.max(...parsedResult.map((result) => result.trial)) : undefined);
      setTier3Count(parsedResult.reduce((acc, result) => acc + result.tier3Count, 0));
      setTier3StudentIds(parsedResult.flatMap((result) => result.tier3StudentIds));
    }
  }, [rawData, tier3StudentIds.length, tier3Students]);

  return (
    <div className="space-y-6">
      <Textarea
        label="모집 결과"
        description="10연 모집 결과를 한 줄에 하나씩 입력"
        placeholder={"1/2/7 드요코\n1 3 6 밴즈사\n..."}
        defaultValue={initialRawData}
        rows={8}
        onChange={(value) => {
          setTier3StudentIds([]);
          setTier3Count(undefined);
          setTotalCount(undefined);
          setRawData(value);
        }}
        className="min-h-48 resize-y"
        containerClassName="mt-0 mb-0"
      />
      {canSelectTier3Students && (
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
}
