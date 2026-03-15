import { useEffect, useState } from "react";
import { parsePickupHistory } from "~/models/pickup-history";
import { ButtonForm, FormGroup, StudentSelectForm, TextareaForm } from "~/components/features/forms";

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
  const [totalCount, setTotalCount] = useState(initialTotalCount ?? 0);
  const [tier3Count, setTier3Count] = useState(initialTier3Count ?? 0);
  const [tier3StudentIds, setTier3StudentIds] = useState(initialTier3StudentIds ?? []);
  const [rawData, setRawData] = useState(initialRawData);

  useEffect(() => {
    if (rawData && tier3StudentIds.length === 0) {
      const parsedResult = parsePickupHistory(rawData, tier3Students);
      setTotalCount(Math.max(...parsedResult.map((result) => result.trial)));
      setTier3Count(parsedResult.reduce((acc, result) => acc + result.tier3Count, 0));
      setTier3StudentIds(parsedResult.flatMap((result) => result.tier3StudentIds));
    }
  }, [rawData, tier3StudentIds.length, tier3Students]);

  return (
    <FormGroup>
      <TextareaForm
        label="모집 결과"
        description="10연 모집 결과를 한 줄에 하나씩 입력"
        placeholder="1/2/7 드요코&#10;1 3 6 밴즈사&#10;..."
        defaultValue={initialRawData}
        onChange={(value) => {
          setTier3StudentIds([]);
          setTier3Count(0);
          setTotalCount(0);
          setRawData(value);
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
      {totalCount && totalCount > 0 && tier3Count && tier3Count > 0 && tier3StudentIds.length === tier3Count && rawData && (
        <ButtonForm
          label="모집 결과 저장"
          color="blue"
          onClick={() => onComplete({ totalCount, tier3Count, tier3StudentIds, rawData })}
        />
      )}
    </FormGroup>
  );
}
