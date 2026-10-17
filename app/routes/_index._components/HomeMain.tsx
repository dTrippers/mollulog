import { Suspense } from "react";
import { Await } from "react-router";
import type { HomeBirthday } from "~/domain/home-portal";
import type { UtcIsoString } from "~/lib/date-time";
import type { HomeIndexContents, HomeSourceResult } from "~/views/home";
import { HomeBottomSection } from "./HomeBottomSection";
import { HomeContentSection } from "./HomeContentSection";
import { HomeEventSection } from "./HomeEventSection";
import { HomeRaidSection } from "./HomeRaidSection";
import { HomeRecruitmentSection } from "./HomeRecruitmentSection";
import { HomeBottomSkeleton } from "./HomeSkeleton";
import type { HomeViewerState } from "./home-viewer-state";

// The main column in section order: events, recruitment, raids, other contents, then birthdays and news.
export function HomeMain({
  contents,
  birthdays,
  viewer,
  now,
  timeZone,
  onRetry,
}: {
  contents: HomeIndexContents;
  birthdays: Promise<HomeSourceResult<HomeBirthday[]>>;
  viewer: HomeViewerState;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5 md:gap-7">
      <HomeEventSection events={contents.events} now={now} timeZone={timeZone} onRetry={onRetry} />
      <HomeRecruitmentSection
        groups={contents.recruitmentGroups}
        upcomingGroups={contents.upcomingRecruitmentGroups}
        viewer={viewer}
        now={now}
        timeZone={timeZone}
        onRetry={onRetry}
      />
      <HomeRaidSection raids={contents.raids} now={now} timeZone={timeZone} onRetry={onRetry} />
      <HomeContentSection overview={contents.overview} now={now} timeZone={timeZone} onRetry={onRetry} />
      <Suspense fallback={<HomeBottomSkeleton />}>
        {/* A birthday load that never settles fails on its own: the birthday tile fails, and the news still shows. */}
        <Await
          resolve={birthdays}
          errorElement={
            <HomeBottomSection
              birthdays={{ status: "error" }}
              news={contents.news}
              timeZone={timeZone}
              onRetryBirthdays={onRetry}
              onRetryNews={onRetry}
            />
          }
        >
          {(birthdayResult) => (
            <HomeBottomSection
              birthdays={birthdayResult}
              news={contents.news}
              timeZone={timeZone}
              onRetryBirthdays={onRetry}
              onRetryNews={onRetry}
            />
          )}
        </Await>
      </Suspense>
    </div>
  );
}
