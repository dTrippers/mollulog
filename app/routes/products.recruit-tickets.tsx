import { TicketIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useLocation, useRevalidator, useRouteError } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import { PageHeader, PageMain, PageToolbar, ScreenTabs, V2Page } from "~/components/v2/layout";
import { Checkbox } from "~/components/v2/primitives/Checkbox";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { nowUtcIso } from "~/lib/date-time";
import { captureClientError } from "~/lib/observability.client";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink, socialMeta } from "~/lib/seo";
import { getRecruitTicketsView } from "~/views/recruit-tickets";
import { RecruitTicketCard } from "./products.recruit-tickets._components/RecruitTicketCard";

const PAGE_TITLE = "상품 / 패키지";
const RECRUIT_TICKETS_PATH = "/products/recruit-tickets";

export const meta: MetaFunction = ({ location }) => {
  const title = `모집권 - ${PAGE_TITLE}`;
  const description = "블루 아카이브 모집권으로 모집할 수 있는 학생 목록";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
    canonicalLink(location.pathname),
  ];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  const { cards, problems } = await getRecruitTicketsView(env, sensei?.id ?? null, ctx);
  if (problems.length > 0) {
    getLogger(env, ctx, { route: "products.recruit-tickets" }).warn("Chosen recruitment ticket cards cannot be shown", {
      problems,
    });
  }
  return { cards, signedIn: sensei !== null, now: nowUtcIso() };
}

function ProductsToolbar() {
  return (
    <PageToolbar>
      <ScreenTabs
        items={[{ key: "recruit-tickets", text: "모집권", Icon: TicketIcon, link: RECRUIT_TICKETS_PATH, active: true }]}
      />
    </PageToolbar>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const revalidator = useRevalidator();

  useEffect(() => {
    captureClientError(error, { source: "products.recruit-tickets.error_boundary", location: location.pathname });
  }, [error, location.pathname]);

  return (
    <V2Page width="reading">
      <PageHeader title={PAGE_TITLE} />
      <ProductsToolbar />
      <PageMain>
        <LoadFailureState title="모집권 목록을 불러오지 못했어요" onRetry={() => revalidator.revalidate()} />
      </PageMain>
    </V2Page>
  );
}

export default function RecruitTickets() {
  const { cards, signedIn, now } = useLoaderData<typeof loader>();
  const timeZone = useDisplayTimeZone();
  const [unrecruitedOnly, setUnrecruitedOnly] = useState(false);
  const shown =
    signedIn && unrecruitedOnly ? cards.filter((card) => card.students.some((student) => student.unrecruited)) : cards;

  return (
    <V2Page width="reading">
      <PageHeader title={PAGE_TITLE} />
      <ProductsToolbar />
      <PageMain>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {signedIn ? (
            <Checkbox
              id="recruit-tickets-unrecruited-only"
              checked={unrecruitedOnly}
              onCheckedChange={setUnrecruitedOnly}
            >
              모집하지 않은 학생이 있는 모집권만 보기
            </Checkbox>
          ) : null}
          <span className="text-[0.8125rem] text-v2-fg-secondary tabular-nums">모집권 {shown.length}개</span>
        </div>
        {shown.length === 0 ? (
          <div className="mt-3 rounded-lg bg-v2-surface px-4 py-10 text-center">
            {cards.length === 0 ? (
              <p className="text-base font-semibold text-v2-fg">지금 볼 수 있는 모집권이 없어요</p>
            ) : (
              <>
                <p className="text-base font-semibold text-v2-fg">모집하지 않은 학생이 있는 모집권이 없어요</p>
                <p className="mt-1 text-sm text-v2-fg-secondary">필터를 끄면 모든 모집권을 볼 수 있어요.</p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {shown.map((card) => (
              <RecruitTicketCard key={card.key} card={card} timeZone={timeZone} now={now} />
            ))}
          </div>
        )}
      </PageMain>
    </V2Page>
  );
}
