import { ChevronDownIcon } from "@heroicons/react/16/solid";
import {
  ChatBubbleLeftRightIcon,
  PlayCircleIcon,
  SparklesIcon,
  Squares2X2Icon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { type ElementType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { CommunityInfiniteFeed } from "~/components/features/community";
import { Page } from "~/components/features/layout";
import { canonicalLink } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { getCommunityFeedPage } from "~/models/community";
import { isCommunityEngagementActionResult } from "~/models/community-engagement";
import { COMMUNITY_FEED_PAGE_SIZE, COMMUNITY_VISIBLE_POST_TYPES, enrichCommunityFeedPosts } from "~/views/community";

type CommunityVisiblePostType = (typeof COMMUNITY_VISIBLE_POST_TYPES)[number];

const COMMUNITY_POST_TYPE_FILTERS: {
  type: CommunityVisiblePostType;
  label: string;
  Icon: ElementType;
}[] = [
  {
    type: "student_review",
    label: "학생 평가",
    Icon: UsersIcon,
  },
  {
    type: "event_opinion",
    label: "이벤트 의견",
    Icon: ChatBubbleLeftRightIcon,
  },
  {
    type: "youtube_video",
    label: "영상 컨텐츠",
    Icon: PlayCircleIcon,
  },
  {
    type: "recruitment_result",
    label: "모집 결과",
    Icon: SparklesIcon,
  },
];

function isCommunityVisiblePostType(type: string): type is CommunityVisiblePostType {
  return COMMUNITY_VISIBLE_POST_TYPES.includes(type as CommunityVisiblePostType);
}

function parseCommunityPostTypes(request: Request): CommunityVisiblePostType[] {
  const url = new URL(request.url);
  const types = url.searchParams.getAll("type").filter(isCommunityVisiblePostType);

  if (types.length > 0) {
    return Array.from(new Set(types));
  }

  return [...COMMUNITY_VISIBLE_POST_TYPES];
}

function parsePage(request: Request) {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  const postTypes = parseCommunityPostTypes(request);
  const page = parsePage(request);

  const feedPage = await getCommunityFeedPage(env, {
    currentUserId: currentUser?.id,
    postTypes,
    youtubeChannelKey: "kr",
    page,
    pageSize: COMMUNITY_FEED_PAGE_SIZE,
    ctx,
  });
  const enrichedFeed = await enrichCommunityFeedPosts(env, feedPage.items);

  return {
    postTypes,
    page: feedPage.page,
    totalPages: feedPage.totalPages,
    signedIn: currentUser !== null,
    studentsByUid: enrichedFeed.studentsByUid,
    posts: enrichedFeed.posts,
  };
};

export const shouldRevalidate: ShouldRevalidateFunction = ({ actionResult, defaultShouldRevalidate }) => {
  if (isCommunityEngagementActionResult(actionResult)) {
    return false;
  }

  return defaultShouldRevalidate;
};

export const meta: MetaFunction = ({ location }) => {
  const title = "평가/의견 | 몰루로그";
  const description = "블루 아카이브의 학생 평가와 이벤트 의견을 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export default function CommunityPage() {
  const { posts, signedIn, studentsByUid, postTypes, page, totalPages } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const getPageUrl = useCallback(
    (nextPage: number) => {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("page", String(nextPage));

      const query = nextSearchParams.toString();
      return query ? `/community?${query}` : "/community";
    },
    [searchParams],
  );

  return (
    <Page
      title="평가/의견"
      description="선생님들의 학생 평가와 이벤트 의견을 한곳에서 확인해보세요"
      belowTitle={<CommunityPostTypeFilter selectedPostTypes={postTypes} />}
      layout="vertical"
    >
      <CommunityInfiniteFeed
        posts={posts}
        signedIn={signedIn}
        studentsByUid={studentsByUid}
        page={page}
        totalPages={totalPages}
        emptyText="아직 표시할 커뮤니티 게시물이 없어요"
        resetKey={postTypes.join(",")}
        getPageUrl={getPageUrl}
      />
    </Page>
  );
}

function CommunityPostTypeFilter({ selectedPostTypes }: { selectedPostTypes: CommunityVisiblePostType[] }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selectedPostTypes), [selectedPostTypes]);
  const selectedCount = selectedPostTypes.length;
  const allSelected = selectedCount === COMMUNITY_VISIBLE_POST_TYPES.length;
  const label = allSelected ? "모든 컨텐츠" : `${selectedCount}개 컨텐츠`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const getNextUrl = (type: CommunityVisiblePostType, active: boolean) => {
    const nextTypes = active
      ? selectedPostTypes.filter((selectedType) => selectedType !== type)
      : [...selectedPostTypes, type];
    const normalizedTypes = COMMUNITY_VISIBLE_POST_TYPES.filter((visibleType) => nextTypes.includes(visibleType));
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("type");
    nextSearchParams.delete("page");

    if (normalizedTypes.length < COMMUNITY_VISIBLE_POST_TYPES.length) {
      for (const selectedType of normalizedTypes) {
        nextSearchParams.append("type", selectedType);
      }
    }

    const query = nextSearchParams.toString();
    return query ? `/community?${query}` : "/community";
  };

  return (
    <div ref={rootRef} className="relative z-50 w-fit">
      <button
        type="button"
        className="inline-flex min-h-8 items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="inline-flex items-center gap-1.5">
          <Squares2X2Icon className="size-3.5 text-muted-foreground" />
          {label}
        </span>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 z-20 mt-2 w-64 overflow-hidden rounded-md bg-popover py-1 text-xs text-popover-foreground shadow-lg">
          {COMMUNITY_POST_TYPE_FILTERS.map(({ type, label, Icon }) => {
            const active = selectedSet.has(type);
            const disabled = active && selectedCount <= 1;
            return (
              <button
                key={type}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-foreground transition-colors hover:bg-muted",
                  disabled && "cursor-not-allowed opacity-60",
                )}
                role="menuitemcheckbox"
                aria-checked={active}
                disabled={disabled}
                onClick={() => navigate(getNextUrl(type, active))}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{label}</span>
                </span>
                <input
                  type="checkbox"
                  className="size-4 shrink-0 rounded-sm border-input bg-background text-primary focus:ring-2 focus:ring-ring/30"
                  checked={active}
                  disabled={disabled}
                  readOnly
                  tabIndex={-1}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
