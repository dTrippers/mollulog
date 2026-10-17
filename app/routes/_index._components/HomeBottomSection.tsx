import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { HOME_BIRTHDAY_LIMIT, type HomeBirthday } from "~/domain/home-portal";
import { formatInstant, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";
import type { Post } from "~/models/post";
import type { HomeSourceResult } from "~/views/home";
import { HomeEmpty, HomeRetryButton, HomeSection, HomeTile } from "./HomePrimitives";

function birthdayDateLabel(monthDay: string) {
  return monthDay.replace("-", "/");
}

export function HomeBirthdaysBlock({
  birthdays,
  onRetry,
}: {
  birthdays: HomeSourceResult<HomeBirthday[]>;
  onRetry: () => void;
}) {
  if (birthdays.status === "error") {
    return (
      <HomeTile
        dense
        label="다가오는 생일"
        name="일정을 불러오지 못했어요"
        detail={<HomeRetryButton onClick={onRetry} />}
      />
    );
  }
  if (birthdays.data.length === 0) {
    return <HomeEmpty>30일 안에 생일인 학생이 없어요</HomeEmpty>;
  }
  // A full list of HOME_BIRTHDAY_LIMIT entries spreads across the block width, one column each. A shorter list stays
  // left-aligned at its fixed item width.
  const spread = birthdays.data.length === HOME_BIRTHDAY_LIMIT;
  return (
    <ul
      className={cn(
        "rounded-lg bg-v2-surface p-v2-block-p",
        spread ? "grid grid-cols-5" : "flex flex-wrap gap-x-5 gap-y-4",
      )}
    >
      {birthdays.data.map((birthday) => (
        <li key={birthday.uid} className={cn(spread && "min-w-0")}>
          <Link
            to={`/students/${birthday.uid}`}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md text-center transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none",
              spread ? "w-full min-w-0" : "w-20",
            )}
          >
            <img
              src={studentImageUrl(birthday.uid)}
              alt=""
              loading="lazy"
              className="size-14 rounded-full bg-v2-inset object-cover md:size-16"
            />
            <span className="w-full truncate text-xs text-v2-fg md:text-sm">
              {birthday.name.replace(/\(.*\)$/, "")}
            </span>
            <span className="text-sm font-semibold text-v2-fg tabular-nums md:text-base">
              {birthdayDateLabel(birthday.monthDay)}
            </span>
            <span className="text-[0.6875rem] text-v2-fg-tertiary tabular-nums md:text-xs">
              {birthday.daysUntil === 0 ? "오늘" : `${birthday.daysUntil}일 후`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HomeNewsBlock({
  news,
  timeZone,
  onRetry,
}: {
  news: HomeSourceResult<Post[]>;
  timeZone: string;
  onRetry: () => void;
}) {
  if (news.status === "error") {
    return (
      <HomeTile label="몰루로그 소식" name="일정을 불러오지 못했어요" detail={<HomeRetryButton onClick={onRetry} />} />
    );
  }
  if (news.data.length === 0) {
    return <HomeEmpty>등록된 소식이 없어요</HomeEmpty>;
  }
  return (
    <ul className="divide-y divide-v2-divider rounded-lg bg-v2-surface px-v2-block-p">
      {news.data.map((post) => (
        <li key={post.uid}>
          <Link
            to={`/posts/${post.uid}`}
            prefetch="intent"
            {...getV2LinkTransitionProps("forward")}
            className={`relative isolate -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-3 text-sm text-v2-fg before:absolute before:inset-x-0 before:inset-y-1 before:-z-10 before:rounded-md before:content-[''] hover:before:bg-v2-hover focus-visible:before:bg-v2-hover ${v2FocusRing}`}
          >
            <span className="min-w-0 truncate">{post.title}</span>
            <time dateTime={post.createdAt} className="shrink-0 text-sm text-v2-fg-tertiary tabular-nums">
              {formatInstant(post.createdAt as UtcIsoString, { timeZone, format: "MM/DD" })}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Birthdays and news sit side by side on desktop and stack on mobile.
export function HomeBottomSection({
  birthdays,
  news,
  timeZone,
  onRetryBirthdays,
  onRetryNews,
}: {
  birthdays: HomeSourceResult<HomeBirthday[]>;
  news: HomeSourceResult<Post[]>;
  timeZone: string;
  onRetryBirthdays: () => void;
  onRetryNews: () => void;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 md:items-start">
      <HomeSection id="home-birthdays" title="다가오는 생일">
        <HomeBirthdaysBlock birthdays={birthdays} onRetry={onRetryBirthdays} />
      </HomeSection>
      <HomeSection
        id="home-news"
        title="몰루로그 소식"
        action={
          <Link
            to="/news"
            className="-my-3 inline-flex min-h-11 items-center gap-0.5 text-sm text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:text-v2-fg motion-reduce:transition-none"
          >
            모두 보기
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </Link>
        }
      >
        <HomeNewsBlock news={news} timeZone={timeZone} onRetry={onRetryNews} />
      </HomeSection>
    </div>
  );
}
