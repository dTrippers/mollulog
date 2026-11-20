import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import type { RaidRecordFormActionData } from "~/components/v2/features/raid-records/RaidRecordForm";
import { RaidRecordForm } from "~/components/v2/features/raid-records/RaidRecordForm";
import { formatRaidScore } from "~/components/v2/features/raid-records/raid-record-format";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { getRaidRecordRankStatus, getRaidRecordTotalScore } from "~/domain/raid-record";
import { routeError } from "~/lib/http-errors";
import { getRaidRecord } from "~/models/raid-record";
import { loadRaidRecordFormData } from "~/views/raid-records";
import { handleRaidRecordFormAction, raidRecordListPath } from "./$username.raids._components/raid-record-form.server";
import { requireRaidRecordOwner } from "./$username.raids._components/raid-record-owner.server";
import { RaidRecordPageError } from "./$username.raids._components/RaidRecordPageError";

export const meta: MetaFunction = () => [{ title: "총력전·대결전 기록 수정 | 몰루로그" }];

async function loadOwnRecord(env: Env, userId: number, uid: string | undefined, ctx: ExecutionContext) {
  const record = uid ? await getRaidRecord(env, userId, uid, { ctx }) : null;
  if (!record) throw routeError(404, "raid_record.not_found", "기록을 찾을 수 없어요");
  return record;
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await requireRaidRecordOwner(env, ctx, request, params, `raids/${params.id ?? ""}/edit`);
  const record = await loadOwnRecord(env, sensei.id, params.id, ctx);
  const form = await loadRaidRecordFormData(env, sensei.id, [record.server], ctx);
  const season = form.seasonsByServer[record.server].find(
    (option) => option.raidType === record.raidType && option.seasonIndex === record.seasonIndex,
  );
  const seasonDefenseTypes = new Set(season?.scoreDefenseTypes.map(({ defenseType }) => defenseType));
  // A record whose season BAQL no longer lists, or lists with other defense types, cannot be edited truthfully.
  if (!season || record.scores.some((entry) => !seasonDefenseTypes.has(entry.defenseType))) {
    throw routeError(500, "raid_record.season_unavailable");
  }
  return {
    username: sensei.username,
    season,
    record: {
      uid: record.uid,
      scores: record.scores,
      rank: record.rank,
      rankStatus: getRaidRecordRankStatus(record, season.rankConfirmAt),
      memo: record.memo,
      parties: record.parties,
    },
    listTo: raidRecordListPath(sensei.username, record),
    students: form.students,
    recruited: form.recruited,
    now: form.now,
  };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await requireRaidRecordOwner(env, ctx, request, params, `raids/${params.id ?? ""}/edit`);
  const record = await loadOwnRecord(env, sensei.id, params.id, ctx);
  return handleRaidRecordFormAction({ env, ctx, request, userId: sensei.id, username: sensei.username, existing: record });
};

export function ErrorBoundary() {
  return <RaidRecordPageError title="기록 수정" />;
}

export default function EditRaidRecord() {
  const { season, record, listTo, students, recruited, now } = useLoaderData<typeof loader>();
  const timeZone = useDisplayTimeZone();
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <V2Page width="reading">
      <PageHeader
        back={{ title: "총력전·대결전 기록", to: listTo }}
        title="기록 수정"
        trailing={
          <Button variant="danger-subtle" onClick={() => setDeleteOpen(true)}>
            기록 삭제
          </Button>
        }
        trailingInline
      />
      <PageMain>
        <RaidRecordForm
          mode={{ kind: "edit", season, record }}
          students={students}
          recruited={recruited}
          now={now}
          timeZone={timeZone}
          cancelTo={listTo}
        />
      </PageMain>
      <DeleteRecordDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        summary={`#${season.seasonIndex} ${season.boss.name} · ${formatRaidScore(getRaidRecordTotalScore(record.scores))}점`}
      />
    </V2Page>
  );
}

function DeleteRecordDialog({ open, onClose, summary }: { open: boolean; onClose: () => void; summary: string }) {
  const fetcher = useFetcher<RaidRecordFormActionData>();
  const deleting = fetcher.state !== "idle";
  const error = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok ? fetcher.data.error.message : null;
  return (
    <Dialog open={open} onClose={deleting ? () => {} : onClose} title="기록 삭제" size="sm">
      <div className="flex flex-col gap-v2-block-gap">
        <p className="text-sm text-v2-fg">
          {summary} 기록을 삭제할까요? 점수·순위·메모·편성이 모두 사라지고 되돌릴 수 없어요.
        </p>
        {error ? <StatusNotice tone="danger">{error}</StatusNotice> : null}
        <div className="flex justify-end gap-2">
          <Button variant="text" onClick={onClose} disabled={deleting}>
            취소
          </Button>
          <Button
            variant="danger"
            disabled={deleting}
            onClick={() => fetcher.submit({ intent: "delete" }, { method: "post", encType: "application/json" })}
          >
            {deleting ? "삭제 중…" : "삭제"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
