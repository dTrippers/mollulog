import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { StatusNotice } from "../../primitives/StatusNotice";

export function StudentPreparingState({ compact = false }: { compact?: boolean }) {
  const notice = (
    <StatusNotice tone="neutral" className="[&>svg]:hidden">
      <span className="relative block pl-6 leading-[1.43]"><InformationCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-fg-secondary" aria-hidden="true" />학생 기본 정보를 준비하고 있어요</span>
    </StatusNotice>
  );
  return compact ? notice : <div className="rounded-lg bg-v2-surface p-v2-block-p">{notice}</div>;
}
