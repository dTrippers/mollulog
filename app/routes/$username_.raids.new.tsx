import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { RaidRecordForm } from "~/components/v2/features/raid-records/RaidRecordForm";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { loadRaidRecordFormData } from "~/views/raid-records";
import { parseRaidRecordListQuery, raidRecordListTo } from "./$username.raids._components/raid-record-list-query";
import { handleRaidRecordFormAction } from "./$username.raids._components/raid-record-form.server";
import { requireRaidRecordOwner } from "./$username.raids._components/raid-record-owner.server";
import { RaidRecordPageError } from "./$username.raids._components/RaidRecordPageError";

export const meta: MetaFunction = () => [{ title: "총력전·대결전 기록 추가 | 몰루로그" }];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const url = new URL(request.url);
  const sensei = await requireRaidRecordOwner(env, ctx, request, params, `raids/new${url.search}`);
  const query = parseRaidRecordListQuery(url.searchParams);
  const form = await loadRaidRecordFormData(env, sensei.id, undefined, ctx);
  return { username: sensei.username, ...query, ...form };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await requireRaidRecordOwner(env, ctx, request, params, "raids/new");
  return handleRaidRecordFormAction({ env, ctx, request, userId: sensei.id, username: sensei.username, existing: null });
};

export function ErrorBoundary() {
  return <RaidRecordPageError title="기록 추가" />;
}

export default function NewRaidRecord() {
  const { username, server, raidType, seasonsByServer, students, recruited, now } = useLoaderData<typeof loader>();
  const timeZone = useDisplayTimeZone();
  const listTo = raidRecordListTo(username, server);
  return (
    <V2Page width="wide">
      <PageHeader back={{ title: "총력전·대결전 기록", to: listTo }} title="기록 추가" />
      <PageMain>
        <RaidRecordForm
          mode={{ kind: "new", seasonsByServer, initialServer: server, initialRaidType: raidType }}
          students={students}
          recruited={recruited}
          now={now}
          timeZone={timeZone}
          cancelTo={listTo}
        />
      </PageMain>
    </V2Page>
  );
}
