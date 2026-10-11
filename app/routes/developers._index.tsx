import {
  ArrowDownIcon,
  CheckIcon,
  ClockIcon,
  CodeBracketIcon,
  EyeIcon,
  MinusCircleIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import PageLink from "~/components/features/layout/PageLink";
import { Button, ProfileImage, SectionCard } from "~/components/primitives";
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

const capabilities = [
  { title: "학생 읽기", items: ["학생 찾기", "모집 학생 현재 상태 조회"], Icon: EyeIcon },
  { title: "학생 쓰기", items: ["모집 학생 등록", "성장도·인연 수정", "현재 상태 삭제"], Icon: PencilSquareIcon },
];

export default function DevelopersIndex() {
  const loaderData = useLoaderData<typeof loader>();
  const { showSignIn } = useSignIn();

  return (
    <DeveloperPage>
      <div className="space-y-6">
        <SectionCard>
          <div className="grid items-center gap-6 xl:grid-cols-[minmax(0,1fr)_14rem] xl:gap-6">
            <div className="min-w-0">
              <p className="font-mono text-sm tracking-widest text-primary">MOLLULOG API · v1</p>
              <h2 className="mt-3 text-2xl font-bold leading-tight">내 도구에서 모집 학생 데이터를 읽고 바꿔요</h2>
              <p className="mt-3 text-sm text-muted-foreground md:text-base">
                API 키 하나로 성장도와 인연을 가져오고, 바꾼 값을 몰루로그에 바로 반영해요
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  to={loaderData.isSignedIn ? "/developers/keys" : undefined}
                  onClick={loaderData.isSignedIn ? undefined : showSignIn}
                >
                  {loaderData.isSignedIn ? "새 API 키 발급" : "로그인하고 키 발급하기"}
                </Button>
                <Button variant="secondary" to="/developers/docs">
                  API 문서 보기
                </Button>
              </div>
              {loaderData.isSignedIn ? (
                <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
                  {loaderData.keySummaryError ? (
                    "API 키 정보를 불러오지 못했어요. 새로고침 후 다시 확인해주세요."
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
            </div>

            <div
              role="img"
              aria-label="정적 예시: 외부 도구가 보낸 수정 요청이 몰루로그의 모집 학생 데이터에 반영되고 변경 기록에 남는 흐름"
              className="min-w-0"
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <CodeBracketIcon className="size-4" aria-hidden="true" /> 내 도구
              </div>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-5">
                PATCH /v1/me/students/10000{"\n"}
                {'{"level": 90}'}
              </pre>
              <div className="flex justify-center py-2">
                <ArrowDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <ClockIcon className="size-4" aria-hidden="true" /> 몰루로그 변경 기록
              </div>
              <div className="flex gap-3 rounded-md bg-muted p-3">
                <ProfileImage studentUid={null} imageSize={8} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">예시 학생</p>
                  <p className="text-xs text-muted-foreground">API · 내 도구</p>
                  <p className="mt-1 text-sm">
                    학생 Lv <span className="text-muted-foreground">80</span> → 90
                  </p>
                </div>
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">정적 예시예요 · 실제 데이터가 아니에요</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="할 수 있는 일">
          <div className="grid gap-3 md:grid-cols-2">
            {capabilities.map(({ title, items, Icon }) => (
              <div key={title} className="rounded-md bg-muted p-4">
                <div className="flex items-center gap-2">
                  <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">{title}</h3>
                </div>
                <ul className="mt-3 space-y-2">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MinusCircleIcon className="size-4 shrink-0" aria-hidden="true" /> 육성 목표·선물 계획은 API로 바꿀 수
            없어요
          </p>
        </SectionCard>

        <SectionCard title="처음이어도 간단해요">
          <ul className="grid gap-5 md:grid-cols-3 md:gap-6">
            <StepItem
              Icon={UserIcon}
              title="한 번에 학생 한 명"
              description="요청마다 학생 한 명만 다뤄서 결과를 알기 쉬워요"
            />
            <StepItem
              Icon={ShieldCheckIcon}
              title="필요한 권한만"
              description="읽기와 쓰기를 따로 골라 키를 만들어요"
            />
            <StepItem
              Icon={ClockIcon}
              title="바뀐 내용은 기록으로"
              description="어떤 키가 무엇을 바꿨는지 최근 1년 동안 볼 수 있어요"
            />
          </ul>
        </SectionCard>

        <section>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">시작하기</p>
          <div className="grid gap-3 xl:grid-cols-3">
            <PageLink
              Icon={numberIcon("1")}
              title="API 키 발급"
              description="키는 한 번만 보여요"
              to="/developers/keys"
              onClick={loaderData.isSignedIn ? undefined : showSignIn}
            />
            <PageLink
              Icon={numberIcon("2")}
              title="문서 보고 요청하기"
              description="주소, 인증, 요청 형식"
              to="/developers/docs"
            />
            <PageLink
              Icon={numberIcon("3")}
              title="변경 기록 확인"
              description="어떤 키가 무엇을 바꿨는지"
              to="/developers/history"
              onClick={loaderData.isSignedIn ? undefined : showSignIn}
            />
          </div>
        </section>
      </div>
    </DeveloperPage>
  );
}

function StepItem({ Icon, title, description }: { Icon: React.ElementType; title: string; description: string }) {
  return (
    <li className="flex gap-3 md:flex-col">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}

function numberIcon(value: string) {
  return function NumberIcon({ className = "" }: { className?: string }) {
    return <span className={`${className} flex items-center justify-center text-sm font-bold`}>{value}</span>;
  };
}
