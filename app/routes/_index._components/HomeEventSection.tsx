import { ChevronRightIcon } from "@heroicons/react/16/solid";
import {
  CalendarDaysIcon,
  RectangleStackIcon,
  ShoppingCartIcon,
  SparklesIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { getFutureMediaTypeLabel } from "~/components/v2/features/futures/labels";
import { getHomeEntryPoints, getHomeOngoingChip, getHomeUpcomingChip, type HomeEntryPoint } from "~/domain/home-portal";
import type { UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import type { TimelineContent } from "~/models/timeline-content";
import type { HomeEventsSource, HomeSourceResult } from "~/views/home";
import { HomeEmpty, HomeRetryButton, HomeSection, HomeTile, HomeTimeChip } from "./HomePrimitives";

const minigameLabel: Record<string, string> = { card_flip: "카드 뒤집기", treasure_hunt: "보물찾기" };

const entryIcon = {
  shop: ShoppingCartIcon,
  simulator: SparklesIcon,
  "card-flip": RectangleStackIcon,
  "treasure-hunt": Squares2X2Icon,
} as const;

// The time chip of one event: ongoing shows the remaining time, upcoming the wait.
function eventChip(content: TimelineContent, now: UtcIsoString, timeZone: string, ongoing: boolean) {
  if (ongoing && content.endAt) {
    return getHomeOngoingChip(content.endAt, now, timeZone);
  }
  return getHomeUpcomingChip(content.startAt, now, timeZone);
}

// The kind line: the event type, then the minigame with its icon, as in the reference.
function EventKindLine({ content, minigameType }: { content: TimelineContent; minigameType: string | null }) {
  const kind = getFutureMediaTypeLabel(content);
  const minigame = minigameType ? minigameLabel[minigameType] : undefined;
  const MinigameIcon = minigameType === "treasure_hunt" ? Squares2X2Icon : RectangleStackIcon;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span>{kind}</span>
      {minigame ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <MinigameIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {minigame}
          </span>
        </>
      ) : null}
    </span>
  );
}

// The entry buttons share one row on a 390px screen. They take their content width and share the remaining space, and the
// labels stay on one line. Each button is 32px high below md, and at least the row height from md up. The control
// background is the same in light and dark.
function EntryPoints({ points, className }: { points: HomeEntryPoint[]; className?: string }) {
  if (points.length === 0) {
    return null;
  }
  return (
    <ul className={cn("flex gap-1.5", className)}>
      {points.map((point) => {
        const Icon = entryIcon[point.key];
        return (
          <li key={point.key} className="flex min-w-0 flex-auto">
            <Link
              to={point.href}
              className="inline-flex h-8 w-full cursor-pointer md:h-auto md:min-h-v2-row-min items-center justify-center gap-1 rounded-md bg-v2-inset px-1.5 text-[0.8125rem] font-medium whitespace-nowrap text-v2-fg transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-filled-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none md:flex-none md:w-auto md:gap-1.5 md:px-3 md:text-sm"
            >
              <Icon aria-hidden="true" className="size-3.5 shrink-0 md:size-4" />
              <span>{point.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function EventHero({
  content,
  ongoing,
  minigameType,
  now,
  timeZone,
}: {
  content: TimelineContent;
  ongoing: boolean;
  minigameType: string | null;
  now: UtcIsoString;
  timeZone: string;
}) {
  const chip = eventChip(content, now, timeZone, ongoing);
  const points = getHomeEntryPoints(content, minigameType);
  // On mobile one card holds the banner and the entry buttons. The banner runs to the card's top and side edges, and the
  // card's radius clips it. On desktop the buttons overlay the banner's bottom band, with no card around the banner.
  return (
    <article className="relative overflow-hidden rounded-lg bg-v2-surface md:overflow-visible md:rounded-none md:bg-transparent">
      <div className="relative aspect-[2/1] overflow-hidden bg-v2-inset md:rounded-lg">
        {content.imageUrl ? (
          <img src={content.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <CalendarDaysIcon aria-hidden="true" className="size-10 text-v2-fg-disabled" />
          </div>
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-v2-scrim via-v2-scrim/30 to-transparent"
        />
        <div className="absolute top-2.5 right-2.5 md:top-3 md:right-3">
          <HomeTimeChip chip={chip} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col gap-1 p-3 md:max-w-[60%] md:p-4">
          <p className="text-sm text-v2-on-media">
            <EventKindLine content={content} minigameType={minigameType} />
          </p>
          <h3 className="text-xl font-semibold break-keep text-v2-on-media md:text-2xl">
            <Link
              to={`/events/${content.uid}`}
              className="inline-flex items-center gap-1 rounded-sm underline decoration-transparent underline-offset-4 transition-colors duration-v2-fast ease-v2-standard hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
            >
              <span className="whitespace-pre-line">{content.name}</span>
              <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </h3>
        </div>
      </div>
      {points.length > 0 ? (
        <div className="p-2 md:absolute md:right-4 md:bottom-4 md:p-0">
          <EntryPoints points={points} />
        </div>
      ) : null}
    </article>
  );
}

function TogetherTile({ content, now, timeZone }: { content: TimelineContent; now: UtcIsoString; timeZone: string }) {
  const chip = eventChip(content, now, timeZone, true);
  return (
    <Link
      to={`/events/${content.uid}`}
      className="flex min-w-0 gap-v2-media-gap rounded-lg bg-v2-surface p-2 transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none md:p-2.5"
    >
      <div className="aspect-[3/2] w-20 shrink-0 overflow-hidden rounded-md bg-v2-inset md:w-24">
        {content.imageUrl ? (
          <img src={content.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <CalendarDaysIcon aria-hidden="true" className="size-6 text-v2-fg-disabled" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-v2-fg-tertiary">{getFutureMediaTypeLabel(content)}</p>
          <HomeTimeChip chip={chip} />
        </div>
        <p className="text-lg font-semibold break-keep text-v2-fg">
          <span className="whitespace-pre-line">{content.name}</span>
          <ChevronRightIcon
            aria-hidden="true"
            className="ml-1 inline-block size-4 shrink-0 align-middle text-v2-fg-tertiary"
          />
        </p>
      </div>
    </Link>
  );
}

export function HomeEventSection({
  events,
  now,
  timeZone,
  onRetry,
}: {
  events: HomeSourceResult<HomeEventsSource>;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  return (
    <HomeSection id="home-events" title="이벤트">
      {events.status === "error" ? (
        <HomeTile label="이벤트" name="일정을 불러오지 못했어요" detail={<HomeRetryButton onClick={onRetry} />} />
      ) : events.data.main ? (
        <>
          <EventHero
            content={events.data.main}
            ongoing
            minigameType={events.data.minigameType}
            now={now}
            timeZone={timeZone}
          />
          {events.data.together.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {events.data.together.map((content) => (
                <TogetherTile key={content.uid} content={content} now={now} timeZone={timeZone} />
              ))}
            </div>
          ) : null}
        </>
      ) : events.data.upcoming ? (
        <EventHero
          content={events.data.upcoming}
          ongoing={false}
          minigameType={events.data.minigameType}
          now={now}
          timeZone={timeZone}
        />
      ) : (
        <HomeEmpty>현재 진행중인 이벤트가 없어요</HomeEmpty>
      )}
    </HomeSection>
  );
}
