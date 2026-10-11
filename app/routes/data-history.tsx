import { ClockIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import Page from "~/components/features/layout/Page";
import { Button, EmptyView, FilterButtons, SectionCard } from "~/components/primitives";
import { API_AUDIT_HISTORY_FILTERS, type ApiAuditHistoryFilter } from "~/domain/api-audit-history";
import type { ApiAuditEvent } from "~/models/mollulog-api";
import { getDataHistoryView } from "~/views/data-history.server";

import HistoryList from "./data-history._components/HistoryList";

export const meta: MetaFunction = () => [{ title: "데이터 변경 이력 | 몰루로그" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

const filterLabels: Record<ApiAuditHistoryFilter, string> = {
  all: "전체",
  direct: "웹에서 수정",
  data: "데이터 반영",
  recruitment: "모집 결과 기록",
  api: "API",
};
const historyFilters = API_AUDIT_HISTORY_FILTERS;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized", { headers: privateHeaders });

  const url = new URL(request.url);
  const requestedFilter = url.searchParams.get("filter");
  const filter = historyFilters.includes(requestedFilter as ApiAuditHistoryFilter)
    ? (requestedFilter as ApiAuditHistoryFilter)
    : "all";
  try {
    const history = await getDataHistoryView(env, sensei.id, {
      cursor: url.searchParams.get("cursor"),
      filter,
      ctx,
    });
    return data({ ...history, loadError: false }, { headers: privateHeaders });
  } catch (error) {
    console.error("[data-history] failed to load personal data history", error);
    return data(
      {
        events: [] as ApiAuditEvent[],
        nextCursor: null,
        filter,
        studentsByUid: {} as Record<string, string>,
        itemNamesByUid: {} as Record<string, string>,
        apiKeysByUid: {} as Record<
          string,
          { readScope: boolean; writeScope: boolean; createdAt: string; expiresAt: string; revokedAt: string | null }
        >,
        loadError: true,
      },
      { headers: privateHeaders },
    );
  }
}

export default function DataHistory() {
  const { events, nextCursor, filter, studentsByUid, itemNamesByUid, apiKeysByUid, loadError } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const nextPage = nextCursor ? `/data-history?${new URLSearchParams({ filter, cursor: nextCursor })}` : null;

  return (
    <Page
      title="데이터 변경 이력"
      description="최근 1년간의 이력을 확인할 수 있어요."
      backward={{ title: "프로필 편집", to: "/edit" }}
      layout="vertical"
      maxWidth="wide"
      contentWidth="full"
    >
      <FilterButtons
        buttonProps={historyFilters.map((value) => ({
          text: filterLabels[value],
          active: filter === value,
          onToggle: (active: boolean) => {
            if (active) navigate(`/data-history?filter=${value}`);
          },
        }))}
        exclusive
        atLeastOne
        surface="page"
        className="my-0 mb-5"
        buttonGroupClassName="gap-x-1.5"
      />
      {loadError ? (
        <SectionCard>
          <div className="flex flex-col items-center py-12 text-center">
            <ExclamationCircleIcon className="size-12 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold">데이터 변경 이력을 불러오지 못했어요</p>
            <p className="mt-1 text-sm text-muted-foreground">잠시 후 다시 시도해주세요.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-4"
              disabled={revalidator.state !== "idle"}
              onClick={() => revalidator.revalidate()}
            >
              {revalidator.state === "idle" ? "다시 시도" : "불러오는 중..."}
            </Button>
          </div>
        </SectionCard>
      ) : events.length === 0 ? (
        <SectionCard>
          <EmptyView
            Icon={ClockIcon}
            text="표시할 데이터 변경 이력이 없어요"
            description="최근 1년간 선택한 경로로 변경한 내역이 없어요."
            className="my-8"
          />
        </SectionCard>
      ) : (
        <HistoryList
          events={events}
          studentsByUid={studentsByUid}
          itemNamesByUid={itemNamesByUid}
          apiKeysByUid={apiKeysByUid}
        />
      )}
      {nextPage && !loadError ? (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" to={nextPage}>
            이전 이력 보기
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
