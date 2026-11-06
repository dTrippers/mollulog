import { ArrowLeftIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { useRevalidator, useRouteError } from "react-router";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import { PageMain, V2Page } from "~/components/v2/layout";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2FocusRing } from "~/components/v2/layout/styles";

export function StudentDetailErrorBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : 500;

  return (
    <V2Page width="reading">
      <div className="v2-header max-md:-mt-1.5 md:-translate-y-6 md:-mb-[21px] min-w-0 pb-v2-group-gap">
        <Link to="/students" className={`mb-2 inline-flex min-h-v2-row-min cursor-pointer items-center gap-1 rounded-md text-sm leading-[1.43] text-v2-fg-secondary hover:text-v2-fg ${v2FocusRing}`} {...getV2LinkTransitionProps("reverse")}>
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          <span>학생 목록</span>
        </Link>
        <h1 className="sr-only">학생부</h1>
      </div>
      <PageMain>
        {status === 404 ? (
          <div className="flex justify-center pb-16 max-md:pt-[66px] md:pt-[63px]">
            <section className="w-full max-w-xl rounded-lg bg-v2-surface p-v2-block-p" role="status">
              <p className="text-base leading-[1.4] font-semibold text-v2-fg">해당하는 학생 정보가 없어요</p>
            </section>
          </div>
        ) : (
          <LoadFailureState title="학생 정보를 불러오지 못했어요" onRetry={() => revalidator.revalidate()} />
        )}
      </PageMain>
    </V2Page>
  );
}
