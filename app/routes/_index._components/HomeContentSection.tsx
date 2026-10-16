import { BookOpenIcon, ChevronRightIcon, MegaphoneIcon, ViewfinderCircleIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { RaidSummary } from "~/components/v2/features/futures/FutureTimeline";
import { selectHomeCampaigns, selectHomeJointFiringDrill, selectHomeMainStory } from "~/domain/home-content";
import {
  getHomeOngoingChip,
  getHomePublishChip,
  getHomeUpcomingChip,
  type HomeTimeChip as HomeTimeChipValue,
} from "~/domain/home-portal";
import type { UtcIsoString } from "~/lib/date-time";
import type { HomeOverviewSources, HomeSourceResult } from "~/views/home";
import { HomeRetryButton, HomeSection, HomeTile } from "./HomePrimitives";

function FailureTile({ label, icon, onRetry }: { label: string; icon: ReactNode; onRetry: () => void }) {
  return (
    <HomeTile
      dense
      label={label}
      icon={icon}
      name="일정을 불러오지 못했어요"
      detail={<HomeRetryButton onClick={onRetry} />}
    />
  );
}

function iconFor(Icon: typeof MegaphoneIcon) {
  return <Icon aria-hidden="true" className="size-4 shrink-0" />;
}

function JointFiringDrillTile({
  result,
  now,
  timeZone,
  onRetry,
}: {
  result: HomeSourceResult<Parameters<typeof selectHomeJointFiringDrill>[0]>;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  const label = "종합전술시험";
  const icon = iconFor(ViewfinderCircleIcon);
  if (result.status === "error") {
    return <FailureTile label={label} icon={icon} onRetry={onRetry} />;
  }
  const selection = selectHomeJointFiringDrill(result.data, now);
  if (selection.kind === "error") {
    return <FailureTile label={label} icon={icon} onRetry={onRetry} />;
  }
  if (selection.kind === "none") {
    return <HomeTile dense label={label} icon={icon} name="예정된 시즌이 없어요" />;
  }
  const chip: HomeTimeChipValue =
    selection.kind === "ongoing"
      ? getHomeOngoingChip(selection.endAt, now, timeZone)
      : getHomeUpcomingChip(selection.startAt, now, timeZone);
  return (
    <HomeTile
      dense
      label={label}
      icon={icon}
      chip={chip}
      name={`${selection.season}차 ${selection.drillTypeLabel}시험`}
      detail={
        <RaidSummary
          raid={{
            terrain: selection.terrain,
            attackType: null,
            defenseTypes: [{ defenseType: selection.defenseType, difficulty: null }],
          }}
        />
      }
    />
  );
}

function CampaignTile({
  result,
  now,
  timeZone,
  onRetry,
}: {
  result: HomeSourceResult<Parameters<typeof selectHomeCampaigns>[0]>;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  const label = "캠페인";
  const icon = iconFor(MegaphoneIcon);
  if (result.status === "error") {
    return <FailureTile label={label} icon={icon} onRetry={onRetry} />;
  }
  const selection = selectHomeCampaigns(result.data, now);
  if (selection.status === "error") {
    return <FailureTile label={label} icon={icon} onRetry={onRetry} />;
  }
  const [first] = selection.campaigns;
  if (!first) {
    return <HomeTile dense label={label} icon={icon} name="예정된 캠페인이 없어요" />;
  }
  return (
    <HomeTile
      dense
      label={label}
      icon={icon}
      chip={getHomeOngoingChip(first.endAt, now, timeZone)}
      name={selection.campaigns.map((campaign) => (
        <span key={campaign.uid} className="block">
          {campaign.categoryLabel} {campaign.multiplier}배
        </span>
      ))}
    />
  );
}

function MainStoryTile({
  result,
  now,
  timeZone,
  onRetry,
}: {
  result: HomeSourceResult<Parameters<typeof selectHomeMainStory>[0]>;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  const label = "메인 스토리";
  const icon = iconFor(BookOpenIcon);
  if (result.status === "error") {
    return <FailureTile label={label} icon={icon} onRetry={onRetry} />;
  }
  const story = selectHomeMainStory(result.data, now);
  if (!story) {
    return <HomeTile dense label={label} icon={icon} name="공개된 메인 스토리가 없어요" />;
  }
  return (
    <HomeTile
      dense
      label={label}
      icon={icon}
      chip={getHomePublishChip(story.startAt, timeZone)}
      name={
        <Link
          to="/mainstory"
          className="whitespace-pre-line rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
        >
          {story.name}
          <ChevronRightIcon
            aria-hidden="true"
            className="ml-1 inline-block size-3.5 shrink-0 align-middle text-v2-fg-tertiary md:size-4"
          />
        </Link>
      }
    />
  );
}

// Other contents: each source is its own tile, so one failure leaves the other tiles as they are.
export function HomeContentSection({
  overview,
  now,
  timeZone,
  onRetry,
}: {
  overview: HomeOverviewSources;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  return (
    <HomeSection id="home-content" title="그 외 컨텐츠">
      <div className="grid gap-2 md:grid-cols-3">
        <JointFiringDrillTile result={overview.jointFiringDrills} now={now} timeZone={timeZone} onRetry={onRetry} />
        <CampaignTile result={overview.campaigns} now={now} timeZone={timeZone} onRetry={onRetry} />
        <MainStoryTile result={overview.mainStoryContent} now={now} timeZone={timeZone} onRetry={onRetry} />
      </div>
    </HomeSection>
  );
}
