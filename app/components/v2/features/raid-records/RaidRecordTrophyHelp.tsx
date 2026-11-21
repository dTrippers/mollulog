import { QuestionMarkCircleIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Sheet } from "../../primitives/Sheet";

const STEPS = [
  "제조 › 물질합성에서 필터를 가구로 바꾸고, 목록 아래쪽에 있는 트로피 진열장을 만들어요. 진열장 등급은 상관없어요.",
  "카페에 트로피 진열장을 배치해요.",
  "배치한 진열장을 선택한 뒤 돋보기 아이콘을 눌러 트로피 리스트를 열어요.",
  "원하는 보스의 트로피를 선택한 뒤 돋보기 아이콘을 누르면 참여 정보가 열려요.",
];

// The game keeps past 총력전 and 대결전 results only in the trophy cabinet, a cafe furniture, and the way there is long.
// The table screen opens it as help on demand instead of keeping it on the page.
export function RaidRecordTrophyHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <QuestionMarkCircleIcon className="size-4" aria-hidden="true" />
        지난 기록 찾는 법
      </Button>
      <Sheet open={open} title="게임에서 지난 기록 찾기" Icon={QuestionMarkCircleIcon} onClose={() => setOpen(false)}>
        <div className="space-y-v2-block-gap text-sm leading-relaxed text-v2-fg">
          <p>지난 총력전·대결전 기록은 카페의 트로피 진열장에서 볼 수 있어요.</p>
          <ol className="list-decimal space-y-2 pl-5 marker:text-v2-fg-tertiary">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>참여 정보에는 선택한 트로피의 시즌별 번호, 날짜, 순위, 점수가 나와요.</p>
          <ul className="list-disc space-y-1 pl-5 text-v2-fg-secondary marker:text-v2-fg-tertiary">
            <li>진열장을 만들려면 트로피가 재료로 필요해요.</li>
            <li>높은 등급 트로피에서는 해당 등급 이상을 달성한 시즌만 보여요. 브론즈 트로피에서는 모든 시즌을 볼 수 있어요.</li>
          </ul>
        </div>
      </Sheet>
    </>
  );
}
