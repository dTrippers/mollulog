import { ClockIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useFetcher, useLoaderData, useNavigate, useNavigation, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button } from "~/components/v2/primitives/Button";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { API_AUDIT_HISTORY_FILTERS, type ApiAuditHistoryFilter } from "~/domain/api-audit-history";
import type { ApiScope } from "~/domain/mollulog-api-spec";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import type { ApiAuditEvent } from "~/models/mollulog-api";
import { getDataHistoryView } from "~/views/data-history.server";
import { ConnectStateMessage } from "./connect._components/ConnectStateMessage";
import { ConnectScreenLayout } from "./connect._components/connect-navigation";
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
    console.error("[data-history] failed to load personal data history", sanitizeErrorForLogging(error));
    return data(
      {
        events: [] as ApiAuditEvent[],
        nextCursor: null,
        filter,
        studentsByUid: {} as Record<string, string>,
        itemNamesByUid: {} as Record<string, string>,
        apiKeysByUid: {} as Record<
          string,
          { scopes: ApiScope[]; createdAt: string; expiresAt: string; revokedAt: string | null }
        >,
        loadError: true,
      },
      { headers: privateHeaders },
    );
  }
}

type HistoryKeyMetadata = {
  scopes: ApiScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export default function DataHistory() {
  const { filter } = useLoaderData<typeof loader>();
  return (
    <ConnectScreenLayout current="history" title="데이터 변경 이력" description="최근 1년간의 이력을 확인할 수 있어요.">
      {/* Keyed by the filter, so the pages loaded for one filter never carry over to another. */}
      <HistoryContent key={filter} />
    </ConnectScreenLayout>
  );
}

function HistoryContent() {
  const first = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof loader>();
  const [olderPages, setOlderPages] = useState<Array<typeof first>>([]);
  const lastPage = olderPages[olderPages.length - 1] ?? first;
  const nextCursor = lastPage.nextCursor;
  const filter = first.filter;
  const switchingFilter =
    navigation.state === "loading" && navigation.location?.pathname === "/data-history" && !navigation.formData;

  // The fetcher returns the page that follows the last one shown. It is added once, and a failed page is not added.
  useEffect(() => {
    const page = fetcher.data;
    if (fetcher.state !== "idle" || !page || page.loadError) return;
    setOlderPages((pages) =>
      pages.some((entry) => entry.nextCursor === page.nextCursor && entry.events[0]?.id === page.events[0]?.id)
        ? pages
        : [...pages, page],
    );
  }, [fetcher.data, fetcher.state]);

  const loadingOlder = fetcher.state !== "idle";
  const olderFailed = fetcher.state === "idle" && Boolean(fetcher.data?.loadError);
  const loadOlder = () => {
    if (!nextCursor) return;
    fetcher.load(`/data-history?${new URLSearchParams({ filter, cursor: nextCursor })}`);
  };

  const pages = [first, ...olderPages];
  const events = pages.flatMap((page) => page.events);
  const studentsByUid = Object.assign({}, ...pages.map((page) => page.studentsByUid)) as Record<string, string>;
  const itemNamesByUid = Object.assign({}, ...pages.map((page) => page.itemNamesByUid)) as Record<string, string>;
  const apiKeysByUid = Object.assign({}, ...pages.map((page) => page.apiKeysByUid)) as Record<
    string,
    HistoryKeyMetadata
  >;

  return (
    <div className="flex flex-col gap-v2-block-gap">
      <fieldset className="m-0 min-w-0 border-0 p-0 flex flex-wrap items-center gap-1.5" aria-label="변경 경로">
        {historyFilters.map((value) => (
          <ToggleChip
            key={value}
            pressed={filter === value}
            onPressedChange={() => {
              if (filter !== value) navigate(`/data-history?filter=${value}`);
            }}
          >
            {filterLabels[value]}
          </ToggleChip>
        ))}
      </fieldset>
      {switchingFilter ? (
        <HistorySkeleton />
      ) : first.loadError ? (
        <div className="rounded-lg bg-v2-surface">
          <ConnectStateMessage
            Icon={ExclamationCircleIcon}
            role="alert"
            title="데이터 변경 이력을 불러오지 못했어요"
            description="잠시 후 다시 시도해주세요."
            action={
              <Button
                type="button"
                variant="secondary"
                disabled={revalidator.state !== "idle"}
                onClick={() => revalidator.revalidate()}
              >
                {revalidator.state === "idle" ? "다시 시도" : "불러오는 중…"}
              </Button>
            }
          />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg bg-v2-surface">
          <ConnectStateMessage
            Icon={ClockIcon}
            title="표시할 데이터 변경 이력이 없어요"
            description="최근 1년간 선택한 경로로 변경한 내역이 없어요."
          />
        </div>
      ) : (
        <>
          <HistoryList
            events={events}
            studentsByUid={studentsByUid}
            itemNamesByUid={itemNamesByUid}
            apiKeysByUid={apiKeysByUid}
          />
          {olderFailed ? (
            <div role="alert">
              <StatusNotice
                tone="danger"
                boxed
                action={
                  <Button type="button" size="sm" onClick={loadOlder}>
                    다시 시도
                  </Button>
                }
              >
                이전 이력을 불러오지 못했어요.
              </StatusNotice>
            </div>
          ) : null}
          {nextCursor && !olderFailed ? (
            <div className="flex justify-center">
              <Button type="button" variant="secondary" disabled={loadingOlder} onClick={loadOlder}>
                {loadingOlder ? "불러오는 중…" : "이전 이력 보기"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div role="status" aria-label="데이터 변경 이력을 불러오는 중" className="flex flex-col gap-v2-block-gap">
      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-1">
          <Skeleton className="h-4 w-20" />
          <div className="flex flex-col gap-3 rounded-lg bg-v2-surface p-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="size-8" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
