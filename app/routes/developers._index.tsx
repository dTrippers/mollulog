import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChartBarIcon,
  CodeBracketIcon,
  PencilSquareIcon,
  RectangleGroupIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import type { ElementType } from "react";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, SectionCard } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { getPersonalApiKeys } from "~/models/mollulog-api";
import { DeveloperPage, formatDate } from "./developers._components/DeveloperPage";

export const meta: MetaFunction = () => [{ title: "몰루로그 API" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return { isSignedIn: false as const };

  try {
    const keys = await getPersonalApiKeys(env, sensei.id, { ctx });
    const activeKeys = keys.filter((key) => key.revokedAt === null && key.expiresAt.getTime() > Date.now());
    const earliestExpiry = activeKeys.reduce<Date | null>(
      (earliest, key) => (earliest === null || key.expiresAt < earliest ? key.expiresAt : earliest),
      null,
    );
    return data(
      {
        isSignedIn: true as const,
        keySummary: {
          totalCount: keys.length,
          activeCount: activeKeys.length,
          earliestExpiry: earliestExpiry?.toISOString() ?? null,
        },
        keySummaryError: false as const,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("[developers] failed to load personal API key summary", error);
    return data(
      { isSignedIn: true as const, keySummary: null, keySummaryError: true as const },
      { headers: privateHeaders },
    );
  }
}

const useCases = [
  {
    title: "데이터 활용",
    description: "필요한 데이터를 가져와 원하는 형태로 정리할 수 있어요.",
    Icon: TableCellsIcon,
  },
  {
    title: "작업 자동화",
    description: "외부 도구와 연동해 반복적인 조회와 업데이트를 자동화할 수 있어요.",
    Icon: PencilSquareIcon,
  },
  {
    title: "함께 쓰는 도구",
    description: "내가 만든 도구에 API 연동 기능을 추가하면 다른 사람도 이용할 수 있어요.",
    Icon: RectangleGroupIcon,
  },
];

export default function DevelopersIndex() {
  const loaderData = useLoaderData<typeof loader>();
  const { showSignIn } = useSignIn();

  return (
    <DeveloperPage>
      <div className="@container space-y-12 pb-8 pt-6 sm:space-y-16 sm:pt-10">
        <section aria-labelledby="api-introduction" className="text-center">
          <h2
            id="api-introduction"
            className="break-keep text-3xl font-bold leading-tight tracking-tight @xl:text-4xl @3xl:text-5xl"
          >
            몰루로그 데이터를
            <span className="mt-2 block text-primary">다른 도구와 연결해요.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl break-keep text-base leading-relaxed text-muted-foreground @3xl:text-lg">
            개인용 도구부터 여러 사람이 함께 쓰는 서비스까지, <br className="hidden @xl:block" />
            API로 몰루로그의 데이터를 조회하고 수정할 수 있어요.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="primary"
              className="gap-3 px-5 py-3"
              to={loaderData.isSignedIn ? "/developers/keys" : undefined}
              onClick={loaderData.isSignedIn ? undefined : showSignIn}
            >
              {loaderData.isSignedIn ? "API 키 만들기" : "로그인하고 키 발급하기"}
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" className="gap-3 px-5 py-3" to="/developers/docs">
              API 문서 보기
              <ArrowUpRightIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {loaderData.isSignedIn ? (
            <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">
              {loaderData.keySummaryError ? (
                "API 키 정보를 불러오지 못했어요. 새로고침 후 다시 확인해 주세요."
              ) : loaderData.keySummary?.activeCount ? (
                <>
                  사용 중인 키 {loaderData.keySummary.activeCount}개 · 가장 빠른 만료{" "}
                  {loaderData.keySummary.earliestExpiry
                    ? formatDate(loaderData.keySummary.earliestExpiry)
                    : "확인할 수 없어요"}
                </>
              ) : loaderData.keySummary?.totalCount ? (
                "사용 중인 키가 없어요"
              ) : (
                "아직 발급한 키가 없어요"
              )}
            </p>
          ) : null}
        </section>

        <ApiConnections />

        <section aria-labelledby="api-use-cases">
          <h2 id="api-use-cases" className="text-lg font-semibold @xl:text-xl">
            이렇게 활용할 수 있어요
          </h2>
          <ul className="mt-6 grid gap-4 @2xl:grid-cols-3">
            {useCases.map(({ title, description, Icon }) => (
              <li key={title}>
                <SectionCard className="flex h-full items-start gap-4 space-y-0 p-5 md:p-6 @2xl:flex-col">
                  <Icon className="size-7 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-semibold">{title}</h3>
                    <p className="mt-2 break-keep text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </SectionCard>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="api-usage-notice" className="space-y-3">
          <h2 id="api-usage-notice" className="text-base font-semibold">
            이용 안내
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>몰루로그 API는 블루 아카이브의 공식 API가 아니며 게임 개발/운영사와는 무관합니다.</li>
            <li>
              몰루로그에 기록한 개인 데이터를 조회, 관리하기 위해서만 사용되며 인게임 데이터 제공을 목적으로 하지
              않습니다.
            </li>
            <li>과도한 요청 등 서비스 운영에 지장을 줄 수 있는 요청은 제한될 수 있습니다.</li>
            <li>다른 유틸리티나 서비스에서도 자유롭게 사용할 수 있습니다. 마음껏 사용해주세요.</li>
            <li>
              기능 추가 등의 의견은{" "}
              <a
                href="https://mollulog.net/contact"
                className="rounded-sm text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                제안/문의
              </a>{" "}
              페이지를 통해 알려주세요.
            </li>
          </ul>
        </section>
      </div>
    </DeveloperPage>
  );
}

function ApiConnections() {
  return (
    <figure aria-label="몰루로그 API로 연결할 수 있는 도구 예시">
      <div className="relative isolate mx-auto grid max-w-4xl justify-items-center gap-4 @2xl:grid-cols-3 @2xl:items-center @2xl:gap-x-4 @2xl:gap-y-5">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 hidden h-64 w-full text-primary/25 @2xl:block"
          viewBox="0 0 900 256"
          preserveAspectRatio="none"
        >
          <path
            d="M 150 112 C 210 90, 270 90, 330 112 M 570 112 C 630 90, 690 90, 750 112 M 450 224 L 450 256"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex size-48 flex-col items-center justify-center gap-4 rounded-full bg-primary/5 @2xl:col-start-2 @2xl:row-start-1 @2xl:size-56">
          <div className="flex size-20 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <CodeBracketIcon className="size-10" aria-hidden="true" />
          </div>
          <p className="text-base font-semibold">몰루로그 API</p>
        </div>
        <ConnectionExample
          Icon={TableCellsIcon}
          title="스프레드시트"
          description="데이터 정리"
          className="@2xl:col-start-1 @2xl:row-start-1"
        />
        <ConnectionExample
          Icon={ChartBarIcon}
          title="개인 대시보드"
          description="원하는 형태로 보기"
          className="@2xl:col-start-3 @2xl:row-start-1"
        />
        <ConnectionExample
          Icon={RectangleGroupIcon}
          title="함께 쓰는 도구"
          description="각자의 API 키로 연결"
          className="@2xl:col-start-2 @2xl:row-start-2"
        />
      </div>
    </figure>
  );
}

function ConnectionExample({
  Icon,
  title,
  description,
  className,
}: {
  Icon: ElementType;
  title: string;
  description: string;
  className: string;
}) {
  return (
    <div
      className={`flex w-full max-w-64 items-center gap-3 rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 ${className}`}
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="break-keep text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 break-keep text-sm font-semibold">{title}</p>
      </div>
    </div>
  );
}
