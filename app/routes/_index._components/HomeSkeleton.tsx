import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { HomeSection } from "./HomePrimitives";

// The loading state keeps the page's structure, as the reference: each section title is real, and its blocks are placeholders
// of the same shapes as the loaded blocks. The whole state is hidden from assistive technology.

// The event card: a 2:1 banner, with two entry-button placeholders at its bottom right on desktop, or in a row below the
// banner on mobile. The entry placeholders take the surface tone, so they read as buttons on the inset banner.
function EventSkeleton() {
  return (
    <article className="relative overflow-hidden rounded-lg bg-v2-surface md:overflow-visible md:rounded-none md:bg-transparent">
      <Skeleton className="aspect-[2/1] w-full rounded-none md:rounded-lg" />
      <div className="flex gap-1.5 p-2 md:absolute md:right-4 md:bottom-4 md:p-0">
        <Skeleton className="h-8 flex-auto bg-v2-surface md:h-9 md:w-24 md:flex-none" />
        <Skeleton className="h-8 flex-auto bg-v2-surface md:h-9 md:w-24 md:flex-none" />
      </div>
    </article>
  );
}

// The recruitment surface: one group, with its kind line and chip, then two portraits, each with a name.
function RecruitmentSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg bg-v2-surface">
      <div className="flex flex-col gap-2 px-v2-block-p py-3 md:gap-3 md:py-v2-block-p">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="mt-1 h-4 w-40 rounded-sm" />
          <Skeleton className="h-5 w-16 rounded-full md:h-6" />
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-4">
          {[0, 1].map((index) => (
            <li key={index} className="flex w-[4.375rem] flex-col items-center md:w-[5.5rem]">
              <Skeleton className="aspect-[5/6] w-full rounded-md" />
              <Skeleton className="mt-0.5 h-3 w-14 rounded-sm md:mt-1" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// A raid tile: the image block on the left, then the label and chip, the name, and the detail line.
function RaidTileSkeleton() {
  return (
    <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg bg-v2-surface">
      <Skeleton className="w-24 shrink-0 rounded-none" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="mt-1 h-3.5 w-24 rounded-sm" />
          <Skeleton className="h-5 w-14 rounded-full md:h-6" />
        </div>
        <Skeleton className="h-5 w-3/4 rounded-sm md:h-6" />
        <Skeleton className="h-3.5 w-1/2 rounded-sm" />
      </div>
    </div>
  );
}

// A text tile of the other contents: the label and chip, the name, and the detail line, as the loaded tile.
function TileSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-v2-surface px-v2-block-p py-3 md:gap-1.5 md:py-v2-block-p">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="mt-1 h-3.5 w-20 rounded-sm" />
        <Skeleton className="h-5 w-14 rounded-full md:h-6" />
      </div>
      <Skeleton className="h-5 w-3/4 rounded-sm md:h-6" />
      <Skeleton className="h-3.5 w-1/2 rounded-sm" />
    </div>
  );
}

// Five birthday entries: a portrait, the name, the date, and the days left, in the loaded grid.
function BirthdaySkeleton() {
  return (
    <div className="grid grid-cols-5 rounded-lg bg-v2-surface p-v2-block-p">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex min-w-0 flex-col items-center gap-1">
          <Skeleton className="size-14 rounded-full md:size-16" />
          <Skeleton className="h-3 w-full rounded-sm" />
          <Skeleton className="h-4 w-12 rounded-sm" />
          <Skeleton className="h-3 w-10 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// Three news rows: a title on the left and the date on the right, on one surface with dividers.
function NewsSkeleton() {
  return (
    <div className="divide-y divide-v2-control-border rounded-lg bg-v2-surface px-v2-block-p">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center justify-between gap-3 py-3">
          <Skeleton className="h-3.5 w-3/4 rounded-sm" />
          <Skeleton className="h-3.5 w-10 shrink-0 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

// The main column in section order, as the loaded column: events, recruitment, raids, other contents, then the bottom pair.
export function HomeMainSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-5 md:gap-7">
      <HomeSection id="home-skeleton-events" title="이벤트">
        <EventSkeleton />
      </HomeSection>
      <HomeSection id="home-skeleton-recruitment" title="학생 모집">
        <RecruitmentSkeleton />
      </HomeSection>
      <HomeSection id="home-skeleton-raids" title="레이드">
        <div className="grid gap-2 md:grid-cols-2">
          <RaidTileSkeleton />
          <RaidTileSkeleton />
        </div>
      </HomeSection>
      <HomeSection id="home-skeleton-content" title="그 외 컨텐츠">
        <div className="grid gap-2 md:grid-cols-3">
          <TileSkeleton />
          <TileSkeleton />
          <TileSkeleton />
        </div>
      </HomeSection>
      <HomeBottomSkeleton />
    </div>
  );
}

// The birthdays and news pair: side by side on desktop, stacked on mobile, with the real section titles.
export function HomeBottomSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-6 md:grid-cols-2 md:items-start">
      <HomeSection id="home-skeleton-birthdays" title="다가오는 생일">
        <BirthdaySkeleton />
      </HomeSection>
      <HomeSection id="home-skeleton-news" title="몰루로그 소식">
        <NewsSkeleton />
      </HomeSection>
    </div>
  );
}

// The feed card's rows: an avatar with the author name on the first row, then the title.
function FeedRowsSkeleton() {
  return (
    <ul className="divide-y divide-v2-control-border">
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex flex-col gap-1 px-v2-block-p py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-28 rounded-sm" />
          </div>
          <Skeleton className="mt-1 h-4 w-full rounded-sm" />
        </li>
      ))}
    </ul>
  );
}

// The video card's rows: a thumbnail, then two text lines.
function VideoRowsSkeleton() {
  return (
    <ul className="divide-y divide-v2-control-border">
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex gap-3 px-v2-block-p py-3">
          <Skeleton className="aspect-video w-28 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
            <Skeleton className="h-4 w-full rounded-sm" />
            <Skeleton className="h-3.5 w-2/3 rounded-sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// An aside card in its loaded form: the header with a divider under it, then the rows of the feed or the video card.
export function HomeAsideSkeleton({ title, variant }: { title: string; variant: "feed" | "video" }) {
  return (
    <section aria-hidden="true" className="overflow-hidden rounded-lg bg-v2-surface">
      <div className="border-b border-v2-control-border px-v2-block-p py-3">
        <p className="text-base font-semibold text-v2-fg">{title}</p>
      </div>
      {variant === "feed" ? <FeedRowsSkeleton /> : <VideoRowsSkeleton />}
    </section>
  );
}
