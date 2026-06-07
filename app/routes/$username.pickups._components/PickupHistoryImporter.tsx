import { useState } from "react";
import { Button, Textarea } from "~/components/primitives";
import { parsePickupHistory } from "~/models/pickup-history";

type PickupHistoryImporterProps = {
  tier3Students: {
    uid: string;
    name: string;
  }[];

  initialRawData?: string;

  onImport: (pickupData: {
    totalCount?: number;
    tier3Count: number;
    tier3StudentIds: string[];
  }) => void;
};

export default function PickupHistoryImporter(
  { tier3Students, initialRawData, onImport }: PickupHistoryImporterProps,
) {
  const [rawData, setRawData] = useState(initialRawData ?? "");
  const hasRawData = rawData.trim().length > 0;
  const handleImport = () => {
    if (!hasRawData) {
      return;
    }

    const parsedResult = parsePickupHistory(rawData, tier3Students);
    onImport({
      totalCount: parsedResult.length > 0 ? Math.max(...parsedResult.map((result) => result.trial)) : undefined,
      tier3Count: parsedResult.reduce((acc, result) => acc + result.tier3Count, 0),
      tier3StudentIds: parsedResult.flatMap((result) => result.tier3StudentIds),
    });
  };

  return (
    <div className="space-y-6">
      <Textarea
        label="외부 데이터"
        description="붙여넣은 데이터로 아래 모집 결과 입력값을 채워요."
        placeholder={"1/2/7 드요코\n1 3 6 밴즈사\n..."}
        value={rawData}
        rows={8}
        onChange={setRawData}
        className="min-h-48 resize-y"
        containerClassName="mt-0 mb-0"
      />
      <div className="pt-2">
        <Button
          text="입력값 채우기"
          variant="inverse"
          disabled={!hasRawData}
          onClick={handleImport}
        />
      </div>
    </div>
  );
}
