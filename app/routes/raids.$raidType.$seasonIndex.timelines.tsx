import { PlusIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { WalkthroughTimelineList } from "~/components/features/walkthrough-timeline";
import Button from "~/components/primitives/Button";
import { listPostgresPublicWalkthroughTimelinesByBoss } from "~/db/postgres/walkthrough-timelines";
import { raidTypeFromParam } from "~/domain/raid";
import { WALKTHROUGH_TIMELINE_DEFENSE_TYPES, type WalkthroughTimelineDefenseType } from "~/domain/walkthrough-timeline";
import { routeError } from "~/lib/http-errors";
import { getRaidDefenseTypeSetKey, getRaidScheduleByTypeAndSeason } from "~/models/raid";
import { getSenseisById } from "~/models/sensei";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const raidType = params.raidType ? raidTypeFromParam(params.raidType) : null;
  const seasonIndex = Number.parseInt(params.seasonIndex ?? "", 10);
  if (!raidType || Number.isNaN(seasonIndex)) throw routeError(404, "raid.not_found", "레이드 정보를 찾을 수 없어요.");
  const raid = await getRaidScheduleByTypeAndSeason(context.cloudflare.env, raidType, seasonIndex);
  if (!raid) throw routeError(404, "raid.not_found", "레이드 정보를 찾을 수 없어요.");
  const searchParams = new URL(request.url).searchParams;
  const requestedDefenseType = searchParams.get("defenseType");
  const requestedSetKey = searchParams.get("defenseTypeSet");
  const defenseTypeSet =
    raid.defenseTypeSets.find((set) => getRaidDefenseTypeSetKey(set) === requestedSetKey) ??
    raid.defenseTypeSets.find((set) => set.primaryDefenseType === requestedDefenseType) ??
    raid.defenseTypeSets[0];
  const defenseType = WALKTHROUGH_TIMELINE_DEFENSE_TYPES.includes(
    defenseTypeSet?.primaryDefenseType as WalkthroughTimelineDefenseType,
  )
    ? (defenseTypeSet?.primaryDefenseType as WalkthroughTimelineDefenseType)
    : undefined;
  const timelines = await listPostgresPublicWalkthroughTimelinesByBoss(
    context.cloudflare.env,
    {
      bossUid: raid.raidBoss.uid,
      defenseType,
    },
    { ctx: context.cloudflare.ctx },
  );
  const authors = await getSenseisById(
    context.cloudflare.env,
    timelines.map((timeline) => timeline.userId),
  );
  return {
    timelines,
    authorsById: Object.fromEntries(authors.map((author) => [author.id, author.username])),
  };
};

export default function RaidWalkthroughTimelinesPage() {
  const { timelines, authorsById } = useLoaderData<typeof loader>();
  const { currentRaid, signedIn } = useOutletContext<RaidPageContext>();
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">선택한 방어 타입의 공개 공략을 최신 수정순으로 확인합니다.</p>
        {signedIn && (
          <Button
            to={`/timelines/new?raidType=${encodeURIComponent(currentRaid.raidType)}&seasonIndex=${currentRaid.seasonIndex}`}
            icon={PlusIcon}
            text="공략 작성"
            variant="primary"
          />
        )}
      </div>
      <WalkthroughTimelineList timelines={timelines} authorsById={authorsById} />
    </div>
  );
}
