import { UserMinusIcon } from "@heroicons/react/24/outline";

export default function AccountLeaveNotice() {
  return (
    <div className="flex flex-col items-center px-4 pt-3 text-center sm:pt-5">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <UserMinusIcon className="size-8" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-bold text-foreground">회원 탈퇴를 진행할까요?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        탈퇴하면 모든 데이터에 접근할 수 없고 복구할 수 없어요. 정말 진행할까요?
      </p>
    </div>
  );
}
