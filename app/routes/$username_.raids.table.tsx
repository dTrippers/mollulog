import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { RaidRecordTable } from "~/components/v2/features/raid-records/RaidRecordTable";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { loadRaidRecordTable } from "~/views/raid-records";
import { parseRaidRecordListQuery } from "./$username.raids._components/raid-record-list-query";
import { requireRaidRecordOwner } from "./$username.raids._components/raid-record-owner.server";
import { handleRaidRecordTableAction } from "./$username.raids._components/raid-record-table.server";
import { RaidRecordPageError } from "./$username.raids._components/RaidRecordPageError";

export const meta: MetaFunction = () => [{ title: "총력전·대결전 기록 표로 입력 | 몰루로그" }];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const url = new URL(request.url);
  const sensei = await requireRaidRecordOwner(env, ctx, request, params, `raids/table${url.search}`);
  const { server, raidType } = parseRaidRecordListQuery(url.searchParams);
  const table = await loadRaidRecordTable(env, sensei.id, server, raidType, ctx);
  return { username: sensei.username, table };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await requireRaidRecordOwner(env, ctx, request, params, "raids/table");
  return handleRaidRecordTableAction({ env, ctx, request, userId: sensei.id, username: sensei.username });
};

export function ErrorBoundary() {
  return <RaidRecordPageError title="표로 입력" />;
}

export default function RaidRecordTablePage() {
  const { username, table } = useLoaderData<typeof loader>();
  const listTo = `/@${username}/raids?server=${table.server}&type=${table.raidType}`;
  return (
    <V2Page width="wide">
      <PageHeader
        back={{ title: "총력전·대결전 기록", to: listTo }}
        title="표로 입력"
        description="여러 시즌의 점수와 순위를 한 번에 입력해요. 메모와 편성은 저장한 후 각 행의 ‘상세’에서 입력할 수 있어요."
      />
      <PageMain>
        {/* A new scope starts from what is saved, so drafts of the previous scope never carry over. */}
        <RaidRecordTable key={`${table.server}:${table.raidType}`} view={table} username={username} listTo={listTo} />
      </PageMain>
    </V2Page>
  );
}
