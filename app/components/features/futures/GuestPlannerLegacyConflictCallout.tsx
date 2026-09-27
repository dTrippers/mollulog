import { ExclamationCircleIcon } from "@heroicons/react/20/solid";
import { Button, Callout } from "~/components/primitives";

export default function GuestPlannerLegacyConflictCallout({ to, className }: { to?: string; className?: string }) {
  return (
    <Callout
      tone="warning"
      Icon={ExclamationCircleIcon}
      title="이전 버전 화면에서 저장한 계획이 있어요"
      description="이전 화면과 이 화면에서 같은 항목을 다르게 바꿨어요. 덮어쓰지 않았으니 내용을 확인하고 사용할 값을 선택해주세요."
      className={className}
    >
      {to && (
        <div className="mt-2">
          <Button text="내용 확인" to={to} size="sm" variant="primary" />
        </div>
      )}
    </Callout>
  );
}
