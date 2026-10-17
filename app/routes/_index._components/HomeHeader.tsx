import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { CalendarDaysIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";

// The page title and the link to the full schedule sit above both the main column and the aside.
export function HomeHeader() {
  return (
    <header className="flex items-start justify-between gap-4">
      <h1 className="min-w-0 text-xl font-bold text-v2-fg md:text-2xl">진행 중인 컨텐츠</h1>
      <Link
        to="/futures"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:text-v2-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
      >
        <CalendarDaysIcon aria-hidden="true" className="size-4" />
        전체 일정 (미래시)
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </Link>
    </header>
  );
}

// Shown under the header after leaving the service. The copy is the approved 탈퇴 안내: a check, the title, and the body on
// a second line, on a subtle success background.
export function HomeAccountLeftNotice() {
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg bg-v2-success-subtle px-v2-block-p py-2.5">
      <CheckCircleIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-v2-success" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-semibold text-v2-fg">탈퇴가 완료됐어요</p>
        <p className="text-sm text-v2-fg-secondary">그동안 이용해주셔서 감사드려요. 언제든지 다시 찾아와주세요!</p>
      </div>
    </div>
  );
}
