import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { V2Page } from "~/components/v2/layout/V2Page";
import type { TimelineContent } from "~/domain/timeline-content";
import { Defense, Terrain } from "~/graphql/graphql";
import { HomeAccountLeftNotice } from "~/routes/_index._components/HomeHeader";
import { HomeBottomSection } from "~/routes/_index._components/HomeBottomSection";
import { HomeContentSection } from "~/routes/_index._components/HomeContentSection";
import { HomeEventSection } from "~/routes/_index._components/HomeEventSection";
import { HomeChannelLinks, HomeFeedBlock, HomeYoutubeBlock } from "~/routes/_index._components/HomeAside";
import { HomeRaidSection } from "~/routes/_index._components/HomeRaidSection";
import { HomeRecruitmentSection } from "~/routes/_index._components/HomeRecruitmentSection";
import { HomeMainSkeleton } from "~/routes/_index._components/HomeSkeleton";
import type { HomeViewerState } from "~/routes/_index._components/home-viewer-state";
import type { EnrichedCommunityFeedPost } from "~/views/community";
import type { TimelineRaidContent } from "~/views/raid-content";
import type { HomeRecruitmentGroup } from "~/views/home";

afterEach(() => {
  jest.useRealTimers();
});

const NOW = "2026-10-16T03:00:00.000Z";
const TZ = "Asia/Seoul";
const noop = () => {};

function event(overrides: Partial<TimelineContent> & Pick<TimelineContent, "uid">): TimelineContent {
  return {
    name: overrides.uid,
    nameI18n: {},
    startAt: "2026-10-13T02:00:00.000Z",
    endAt: "2026-10-27T02:00:00.000Z",
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "event",
    runType: "first",
    occurrence: null,
    contentUid: "content-1",
    shopContentUid: null,
    recruitmentGroupUid: null,
    recruitmentStudentUids: null,
    confirmed: true,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    syncedAt: null,
    ...overrides,
  };
}

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <V2Page width="full">{node}</V2Page>
    </MemoryRouter>,
  );
}

const viewer = {
  status: "ready",
  signedIn: false,
  isFavorited: () => false,
  favoriteCount: () => 0,
  isCompleted: () => false,
  toggleFavorite: noop,
  toggleComplete: noop,
} as unknown as HomeViewerState;

describe("home event section", () => {
  it("shows a failed event source in the tile's place with a retry button", () => {
    const markup = render(
      <HomeEventSection events={{ status: "error" }} now={NOW} timeZone={TZ} onRetry={noop} />,
    );
    expect(markup).toContain("일정을 불러오지 못했어요");
    expect(markup).toContain("다시 시도");
  });

  it("shows the ongoing event with its remaining time and only the entry points it can use", () => {
    const markup = render(
      <HomeEventSection
        events={{
          status: "success",
          data: {
            main: event({ uid: "ev-1", name: "람과천청", recruitmentGroupUid: "group-1" }),
            together: [],
            upcoming: null,
            minigameType: "card_flip",
          },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup).toContain("진행 중, ");
    expect(markup).toContain("11일 남음");
    expect(markup).toContain('href="/events/ev-1/shop"');
    expect(markup).toContain('href="/events/ev-1/recruitment-simulator"');
    expect(markup).toContain('href="/events/ev-1/shop/card-flip"');
    expect(markup).not.toContain("/treasure-hunt");
    expect(markup).toContain('href="/events/ev-1"');
  });

  it("shows the next event as upcoming, and the explicit empty copy when nothing exists", () => {
    const upcoming = render(
      <HomeEventSection
        events={{ status: "success", data: { main: null, together: [], upcoming: event({ uid: "next", startAt: "2026-10-20T02:00:00.000Z" }), minigameType: null } }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(upcoming).toContain("4일 후 시작");
    expect(upcoming).not.toContain("진행 중, ");

    const empty = render(
      <HomeEventSection events={{ status: "success", data: { main: null, together: [], upcoming: null, minigameType: null } }} now={NOW} timeZone={TZ} onRetry={noop} />,
    );
    expect(empty).toContain("현재 진행중인 이벤트가 없어요");
  });
});

describe("home raid and other content sections", () => {
  it("shows a failed raid slot beside the other slot's explicit none state and the schedule link", () => {
    const markup = render(
      <HomeRaidSection
        raids={{
          status: "success",
          data: {
            total: { ongoing: [], upcoming: null },
            unlimit: { ongoing: [], upcoming: null },
          },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup).toContain("예정된 시즌이 없어요");
    expect(markup).toContain('href="/futures"');

    const failed = render(<HomeRaidSection raids={{ status: "error" }} now={NOW} timeZone={TZ} onRetry={noop} />);
    expect(failed.match(/일정을 불러오지 못했어요/g)).toHaveLength(2);
  });

  it("keeps each other-content tile separate when one source fails", () => {
    const markup = render(
      <HomeContentSection
        overview={{
          campaigns: { status: "error" },
          jointFiringDrills: { status: "success", data: [] },
          mainStoryContent: { status: "success", data: null },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup).toContain("일정을 불러오지 못했어요");
    expect(markup).toContain("예정된 시즌이 없어요");
    expect(markup).toContain("공개된 메인 스토리가 없어요");
  });
});

// The chevron is the solid Heroicon ChevronRight path. Each test looks for it inside the link it marks.
const CHEVRON = 'd="M6.22 4.22';
const countChevrons = (markup: string) => markup.split(CHEVRON).length - 1;
const linkWith = (markup: string, href: string) =>
  markup.match(new RegExp(`<a [^>]*href="${href}"[^>]*>[\\s\\S]*?</a>`))?.[0] ?? "";

describe("home clickable tiles", () => {
  it("puts a chevron inside each link tile, after the name", () => {
    const raid = {
      uid: "raid-content-1",
      name: "그레고리오",
      startAt: "2026-10-10T00:00:00.000Z",
      endAt: "2026-10-30T00:00:00.000Z",
      raidSchedule: {
        raidType: "total_assault",
        seasonIndex: 87,
        terrain: "street",
        attackType: null,
        defenseTypes: [],
        raidBoss: { uid: "gregorio", name: "그레고리오" },
      },
    } as unknown as TimelineRaidContent;

    const raids = render(
      <HomeRaidSection
        raids={{ status: "success", data: { total: { ongoing: [raid], upcoming: null }, unlimit: { ongoing: [], upcoming: null } } }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    const raidTile = raids.match(/<a [^>]*href="\/raids\/[^"]+"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(raidTile).toContain("그레고리오");
    expect(raidTile.indexOf(CHEVRON)).toBeGreaterThan(raidTile.indexOf("그레고리오"));
    // The empty column's text link keeps its label, with the chevron after it and no "›" character.
    const futuresLink = linkWith(raids, "/futures");
    expect(futuresLink).toContain("미래시에서 보기");
    expect(futuresLink).toContain(CHEVRON);
    expect(raids).not.toContain("›");

    const together = render(
      <HomeEventSection
        events={{
          status: "success",
          data: {
            main: event({ uid: "ev-1", name: "람과천청" }),
            together: [event({ uid: "t-1", name: "함께 이벤트" })],
            upcoming: null,
            minigameType: null,
          },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(linkWith(together, "/events/t-1")).toContain(CHEVRON);

    const story = render(
      <HomeContentSection
        overview={{
          campaigns: { status: "success", data: [] },
          jointFiringDrills: { status: "success", data: [] },
          mainStoryContent: { status: "success", data: event({ uid: "story", name: "2부 Ex.", startAt: "2026-09-15T00:00:00.000Z" }) },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(linkWith(story, "/mainstory")).toContain(CHEVRON);
    // Only the main story tile is a link here, so it is the only chevron in the section.
    expect(countChevrons(story)).toBe(1);
  });

  it("gives no chevron to non-link tiles: the failure, empty, and none states", () => {
    const content = render(
      <HomeContentSection
        overview={{
          campaigns: { status: "error" },
          jointFiringDrills: { status: "success", data: [] },
          mainStoryContent: { status: "success", data: null },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(countChevrons(content)).toBe(0);
  });
});

describe("home bottom and aside", () => {
  it("shows birthday and news failures with retry, and the news empty copy", () => {
    const markup = render(
      <HomeBottomSection
        birthdays={{ status: "error" }}
        news={{ status: "success", data: [] }}
        timeZone={TZ}
        onRetryBirthdays={noop}
        onRetryNews={noop}
      />,
    );
    expect(markup).toContain("일정을 불러오지 못했어요");
    expect(markup).toContain("등록된 소식이 없어요");
    expect(markup).toContain('href="/news"');
  });

  it("links each news row to its post detail and keeps the MM/DD date", () => {
    const markup = render(
      <HomeBottomSection
        birthdays={{ status: "success", data: [] }}
        news={{
          status: "success",
          data: [
            {
              uid: "post-1",
              title: "9/8 업데이트 안내",
              content: "본문",
              board: "news",
              timelineContentUid: null,
              thumbnailImageUrl: null,
              createdAt: "2026-09-08T00:00:00.000Z",
              updatedAt: "2026-09-08T00:00:00.000Z",
            },
          ],
        }}
        timeZone={TZ}
        onRetryBirthdays={noop}
        onRetryNews={noop}
      />,
    );
    expect(markup).toContain('href="/posts/post-1"');
    expect(markup).toContain("9/8 업데이트 안내");
    expect(markup).toContain(">09/08</time>");
  });

  it("spreads five birthdays across five columns, and keeps a shorter list left-aligned", () => {
    const birthday = (uid: string, daysUntil: number) => ({ uid, name: `학생${uid}`, monthDay: "10-20", daysUntil });
    const five = render(
      <HomeBottomSection
        birthdays={{ status: "success", data: [1, 2, 3, 4, 5].map((n) => birthday(`s${n}`, n)) }}
        news={{ status: "success", data: [] }}
        timeZone={TZ}
        onRetryBirthdays={noop}
        onRetryNews={noop}
      />,
    );
    expect(five).not.toContain("오늘부터 30일");
    expect(five.match(/<li class="min-w-0">/g)).toHaveLength(5);
    expect(five).toContain("grid grid-cols-5");
    expect(five).not.toContain("flex flex-wrap");

    const three = render(
      <HomeBottomSection
        birthdays={{ status: "success", data: [1, 2, 3].map((n) => birthday(`t${n}`, n)) }}
        news={{ status: "success", data: [] }}
        timeZone={TZ}
        onRetryBirthdays={noop}
        onRetryNews={noop}
      />,
    );
    expect(three).not.toContain("grid-cols-5");
    expect(three).toContain("flex flex-wrap");
  });

  it("shows the 30-day empty copy when no birthday falls in the window", () => {
    const markup = render(
      <HomeBottomSection
        birthdays={{ status: "success", data: [] }}
        news={{ status: "success", data: [] }}
        timeZone={TZ}
        onRetryBirthdays={noop}
        onRetryNews={noop}
      />,
    );
    expect(markup).toContain("30일 안에 생일인 학생이 없어요");
  });

  it("separates a failed feed from an empty YouTube result, and links each channel in a new window", () => {
    const feed = render(<HomeFeedBlock feed={{ status: "error" }} timeZone={TZ} onRetry={noop} />);
    expect(feed).toContain("최근 피드를 불러오지 못했어요");
    expect(feed).toContain("일시적인 문제일 수 있어요.");
    expect(feed).not.toContain('href="/community"');

    const youtube = render(
      <HomeYoutubeBlock
        youtube={{
          status: "success",
          sections: [
            {
              channelKey: "kr",
              channelName: "블루 아카이브 한국 공식 채널",
              channelUrl: "https://www.youtube.com/@bluearchive_kr",
              videos: [],
            } as never,
          ],
        }}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(youtube).toContain("최근 영상이 없어요");
    // The channel links render through HomeChannelLinks, so they do not depend on this result.
    expect(youtube).not.toContain('target="_blank"');
  });

  it("places the YouTube title above a flush card with dividers between videos", () => {
    const video = (id: string, title: string) => ({
      id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: "2026-10-15T00:00:00.000Z",
      isShorts: false,
    });
    const markup = renderToStaticMarkup(
      <HomeYoutubeBlock
        youtube={{
          status: "success",
          sections: [
            {
              channelKey: "kr",
              channelName: "블루 아카이브 한국 공식 채널",
              channelUrl: "https://www.youtube.com/@bluearchive_kr",
              videos: [video("a1", "첫 영상"), video("a2", "둘째 영상")],
            } as never,
          ],
        }}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup.indexOf("공식 유튜브 최근 영상")).toBeLessThan(
      markup.indexOf("overflow-hidden rounded-lg bg-v2-surface"),
    );
    expect(markup).toContain("divide-y divide-v2-divider");
    expect(markup.match(/<li>/g)?.length).toBe(2);
    expect(markup).toContain("divide-v2-divider/60 px-v2-block-p");
    expect(markup).toContain("gap-3 py-3");
  });

  it("puts the YouTube empty and failure states below the section title", () => {
    const empty = renderToStaticMarkup(
      <HomeYoutubeBlock youtube={{ status: "success", sections: [] }} timeZone={TZ} onRetry={noop} />,
    );
    expect(empty.indexOf("공식 유튜브 최근 영상")).toBeLessThan(empty.indexOf("최근 영상이 없어요"));

    const failed = renderToStaticMarkup(
      <HomeYoutubeBlock youtube={{ status: "error" }} timeZone={TZ} onRetry={noop} />,
    );
    expect(failed.indexOf("공식 유튜브 최근 영상")).toBeLessThan(failed.indexOf("최근 영상을 불러오지 못했어요"));
    expect(failed).toContain("다시 시도");
  });
});

describe("home loading skeleton", () => {
  it("gives the event entry placeholders a shade distinct from the banner placeholder", () => {
    const markup = renderToStaticMarkup(<HomeMainSkeleton />);
    const pills = markup.match(/class="[^"]*md:flex-none[^"]*"/g) ?? [];
    expect(pills).toHaveLength(2);
    for (const pill of pills) {
      expect(pill).toContain("bg-v2-surface");
      expect(pill).not.toContain("bg-v2-inset");
    }
  });
});

describe("home recruitment section", () => {
  const group = {
    groupUid: "group-1",
    eventUid: "ev-1",
    eventName: "하이랜더 철도 폭주 사건",
    eventImageUrl: null,
    kindLabel: "복각 픽업 모집",
    since: "2026-10-16T00:00:00.000Z",
    until: "2026-10-27T00:00:00.000Z",
    recruitments: [],
  };

  it("names a group without students as a banner row with its kind and event", () => {
    const markup = render(
      <HomeRecruitmentSection
        groups={{ status: "success", data: [group] }}
        upcomingGroups={[]}
        viewer={viewer}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup).toContain("복각 픽업 모집 · 하이랜더 철도 폭주 사건");
    expect(markup).toContain("11일 남음");
  });

  it("reports a failed recruitment source and a failed own-state read explicitly", () => {
    const failed = render(
      <HomeRecruitmentSection
        groups={{ status: "error" }}
        upcomingGroups={[]}
        viewer={viewer}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(failed).toContain("일정을 불러오지 못했어요");

    const ownStateFailed = render(
      <HomeRecruitmentSection
        groups={{ status: "success", data: [group] }}
        upcomingGroups={[]}
        viewer={{ ...viewer, status: "failed" } as HomeViewerState}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(ownStateFailed).toContain("관심 학생과 모집 기록을 불러오지 못했어요");
  });

  it("keeps the students when the favorited counts fail, with no count shown and no failure tile", () => {
    const withStudent = {
      ...group,
      recruitments: [
        {
          student: { uid: "kayoko", name: "카요코", attackType: "explode", defenseType: "pierce", role: "striker" },
          favoriteKey: "kayoko",
          contentUid: "ev-1",
          recruitmentType: "usual",
          pickup: true,
          rerun: false,
          since: "2026-10-16T00:00:00.000Z",
          until: "2026-10-27T00:00:00.000Z",
          studentName: "카요코",
        },
      ],
    } as unknown as HomeRecruitmentGroup;
    // A favorited viewer whose counts are hidden: the viewer's own mark still shows, without a number.
    const favoritedViewer = {
      ...viewer,
      signedIn: true,
      isFavorited: () => true,
      favoriteCount: () => null,
    } as unknown as HomeViewerState;

    const markup = render(
      <HomeRecruitmentSection
        groups={{ status: "success", data: [withStudent] }}
        upcomingGroups={[]}
        viewer={favoritedViewer}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup).toContain("카요코");
    expect(markup).toContain("복각 픽업 모집");
    expect(markup).not.toContain("일정을 불러오지 못했어요");
    // The viewer's own favorite still shows, labelled without a number.
    expect(markup).toContain('aria-label="관심 학생, 내 관심 등록"');
    expect(markup).not.toMatch(/관심 학생 \d/);
    expect(markup).not.toContain("명 등록");
  });
});

describe("home account notice", () => {
  it("states the completed withdrawal under the header", () => {
    expect(render(<HomeAccountLeftNotice />)).toContain("탈퇴가 완료됐어요");
  });
});

describe("home joint firing drill and channel links", () => {
  it("names a joint firing drill with its terrain and armor line", () => {
    const markup = render(
      <HomeContentSection
        overview={{
          campaigns: { status: "success", data: [] },
          jointFiringDrills: {
            status: "success",
            data: [
              {
                season: 53,
                drillType: "assault",
                terrain: Terrain.Outdoor,
                defenseType: Defense.Elastic,
                schedules: [{ region: "gl", startAt: "2026-10-27T02:00:00.000Z", endAt: null }],
              },
            ],
          },
          mainStoryContent: { status: "success", data: null },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup).toContain("53차 돌파시험");
    expect(markup).toContain("야외");
    expect(markup).toContain("탄력장갑");
  });

  it("links both official channels in a new window, from the static channel list", () => {
    const markup = render(
      <HomeChannelLinks
        channels={[
          { key: "kr", url: "https://www.youtube.com/@bluearchive_kr" },
          { key: "jp", url: "https://www.youtube.com/@BlueArchive_JP" },
        ]}
      />,
    );
    expect(markup).toContain(">한국 공식 채널<");
    expect(markup).toContain(">일본 공식 채널<");
    expect(markup).toContain('href="https://www.youtube.com/@bluearchive_kr"');
    expect(markup).toContain('href="https://www.youtube.com/@BlueArchive_JP"');
    expect(markup.match(/target="_blank"/g)).toHaveLength(2);
    expect(markup.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(markup.match(/<span class="sr-only">새 창<\/span>/g)).toHaveLength(2);
    expect(markup).not.toContain("youtube.com · 새 창");
  });
});

describe("home feed items", () => {
  it("shows the author, type and date line, the subject context, the body, and a link to the subject", () => {
    const post = {
      uid: "post-1",
      postType: "event_opinion",
      title: null,
      displayAt: "2026-10-15T03:00:00.000Z",
      author: { username: "hellodhlyn", profileStudentId: null, labels: [] },
      subjectContentUid: "ev-1",
      subjectContentName: "람과천청",
      subjectStudentName: null,
      pickupStudents: [
        { uid: "kisaki", name: "키사키(수영복)" },
        { uid: "shun", name: "슌(수영복)" },
      ],
      blocks: [{ type: "plaintext", text: "안녕하세요" }],
    } as unknown as EnrichedCommunityFeedPost;

    const markup = render(<HomeFeedBlock feed={{ status: "success", posts: [post] }} timeZone={TZ} onRetry={noop} />);
    expect(markup).toContain("@hellodhlyn");
    expect(markup).toContain("이벤트 의견");
    expect(markup).toContain(">10/15</time>");
    expect(markup).toContain("람과천청");
    expect(markup).toContain("픽업");
    expect(markup).toContain('aria-label="키사키(수영복) 정보"');
    expect(markup).toContain('aria-label="슌(수영복) 정보"');
    expect(markup).toContain("안녕하세요");
    expect(markup).toContain('href="/events/ev-1"');
  });
});

describe("home feed item links and reference meta", () => {
  const author = { username: "hellodhlyn", profileStudentId: null, labels: [] };

  it("renders a student review body, a named link, and inline meta", () => {
    const post = {
      uid: "review-1",
      postType: "student_review",
      title: null,
      displayAt: "2026-09-27T03:00:00.000Z",
      author,
      subjectStudentUid: "kayoko",
      subjectStudentName: "카요코",
      blocks: [],
      tags: ["love"],
    } as unknown as EnrichedCommunityFeedPost;

    const markup = render(<HomeFeedBlock feed={{ status: "success", posts: [post] }} timeZone={TZ} onRetry={noop} />);
    expect(markup).toContain("카요코");
    expect(markup).toContain("애정해요");
    expect(markup).toContain('href="/students/kayoko"');
    expect(markup).toContain("학생 평가");
    expect(markup).toContain(">09/27</time>");
  });

  it("joins the grading tag names in display order when a student review has no text block", () => {
    const post = {
      uid: "review-3",
      postType: "student_review",
      title: null,
      displayAt: "2026-09-27T03:00:00.000Z",
      author,
      subjectStudentUid: "kayoko",
      subjectStudentName: "카요코",
      blocks: [],
      tags: ["love", "performance"],
    } as unknown as EnrichedCommunityFeedPost;

    const markup = render(<HomeFeedBlock feed={{ status: "success", posts: [post] }} timeZone={TZ} onRetry={noop} />);
    expect(markup).toContain("성능이 강해요 · 애정해요");
    expect(markup).toContain('href="/students/kayoko"');
  });

  it("prefers a student review's text block over its grading tags", () => {
    const post = {
      uid: "review-4",
      postType: "student_review",
      title: null,
      displayAt: "2026-09-27T03:00:00.000Z",
      author,
      subjectStudentUid: "kayoko",
      subjectStudentName: "카요코",
      blocks: [{ type: "plaintext", text: "좋아요" }],
      tags: ["love"],
    } as unknown as EnrichedCommunityFeedPost;

    const markup = render(<HomeFeedBlock feed={{ status: "success", posts: [post] }} timeZone={TZ} onRetry={noop} />);
    expect(markup).toContain("좋아요");
    expect(markup).not.toContain("애정해요");
  });

  it("names every link, including image-only links for the avatar and subject", () => {
    const posts = [
      {
        uid: "review-2",
        postType: "student_review",
        title: null,
        displayAt: "2026-09-27T03:00:00.000Z",
        author,
        subjectStudentUid: "kayoko",
        subjectStudentName: "카요코",
        blocks: [{ type: "plaintext", text: "좋아요" }],
      },
      {
        uid: "event-1",
        postType: "event_opinion",
        title: null,
        displayAt: "2026-10-15T03:00:00.000Z",
        author,
        subjectContentUid: "ev-1",
        subjectContentName: "람과천청",
        pickupStudents: [],
        blocks: [],
      },
    ] as unknown as EnrichedCommunityFeedPost[];

    const markup = render(<HomeFeedBlock feed={{ status: "success", posts }} timeZone={TZ} onRetry={noop} />);
    const anchors = [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)];
    expect(anchors.length).toBeGreaterThan(0);
    for (const [, attributes, inner] of anchors) {
      const hasAccessibleName = attributes.includes("aria-label=") || inner.replace(/<[^>]+>/g, "").trim().length > 0;
      expect(hasAccessibleName).toBe(true);
    }
    expect(markup).toContain('href="/events/ev-1"');
  });

  it("adds the walkthrough context line as the existing feed does", () => {
    const post = {
      uid: "walk-1",
      postType: "walkthrough_timeline",
      title: "공략",
      displayAt: "2026-09-25T03:00:00.000Z",
      author,
      subjectContentUid: null,
      blocks: [
        {
          type: "walkthrough_timeline",
          timelineUid: "tl-1",
          bossUid: "boss",
          terrain: "outdoor",
          defenseType: "light",
          maxDifficulty: "torment",
          partyCount: 2,
          usedStudentUids: Array.from({ length: 10 }, (_, index) => `student-${index}`),
        },
      ],
    } as unknown as EnrichedCommunityFeedPost;

    const markup = render(<HomeFeedBlock feed={{ status: "success", posts: [post] }} timeZone={TZ} onRetry={noop} />);
    expect(markup).toContain("야외 · 경장갑 토먼트 · 학생 10명");
    expect(markup).toContain('href="/timelines/tl-1"');
  });
});

describe("home event entry row", () => {
  it("keeps every entry label on one line inside a 44px control on the inset token", () => {
    const markup = render(
      <HomeEventSection
        events={{
          status: "success",
          data: {
            main: event({ uid: "ev-2", name: "람과천청", recruitmentGroupUid: "group-2" }),
            together: [],
            upcoming: null,
            minigameType: "card_flip",
          },
        }}
        now={NOW}
        timeZone={TZ}
        onRetry={noop}
      />,
    );
    expect(markup.match(/whitespace-nowrap/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup).toContain("min-h-v2-row-min");
    expect(markup).toContain("bg-v2-inset");
    expect(markup).not.toContain("bg-v2-elevated");
  });
});
