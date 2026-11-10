import { useId, useState } from "react";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { parsePickupHistory } from "~/models/pickup-history";
import { textareaClassName } from "./pickup-record";

type PickupHistoryImporterProps = {
  tier3Students: { uid: string; name: string }[];
  onClose: () => void;
  onImport: (pickupData: { totalCount?: number; tier3Count: number; tier3StudentIds: string[] }) => void;
};

export const IMPORT_FAILED_MESSAGE =
  "붙여넣은 데이터를 읽지 못했어요. 한 줄에 10회 모집 결과가 하나씩, 성급별 학생 수(예: 1/2/7)와 함께 들어 있는지 확인해주세요.";

// Fills the count and student inputs from pasted text. A text it cannot read changes nothing and says why.
export default function PickupHistoryImporter({ tier3Students, onClose, onImport }: PickupHistoryImporterProps) {
  const fieldId = useId();
  const [rawData, setRawData] = useState("");
  const [failed, setFailed] = useState(false);
  const hasRawData = rawData.trim().length > 0;

  const handleImport = () => {
    if (!hasRawData) return;
    const parsed = parsePickupHistory(rawData, tier3Students);
    if (parsed.length === 0) {
      setFailed(true);
      return;
    }
    setFailed(false);
    onImport({
      totalCount: Math.max(...parsed.map((result) => result.trial)),
      tier3Count: parsed.reduce((acc, result) => acc + result.tier3Count, 0),
      tier3StudentIds: parsed.flatMap((result) => result.tier3StudentIds),
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-v2-inset p-v2-block-p">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={fieldId} className="text-sm font-semibold text-v2-fg">
          외부 데이터
        </label>
        <Button variant="text" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>
      <p className="-mt-2 text-xs text-v2-fg-tertiary">붙여넣은 데이터로 아래 모집 결과 입력값을 채워요.</p>
      <textarea
        id={fieldId}
        value={rawData}
        rows={4}
        placeholder={"1/2/7 드요코\n1 3 6 밴즈사\n..."}
        onChange={(event) => {
          setRawData(event.currentTarget.value);
          setFailed(false);
        }}
        className={textareaClassName}
      />
      {failed ? <StatusNotice tone="danger">{IMPORT_FAILED_MESSAGE}</StatusNotice> : null}
      <div>
        <Button variant="secondary" disabled={!hasRawData} onClick={handleImport}>
          입력값 채우기
        </Button>
      </div>
    </div>
  );
}
