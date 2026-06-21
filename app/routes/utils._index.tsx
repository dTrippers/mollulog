import { ChevronRightIcon } from "@heroicons/react/16/solid";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { Page } from "~/components/features/layout";
import { getNavigationSections } from "~/components/features/layout/navigation-menu";
import { getNavigationBarContents } from "~/models/content";
import { sanitizeClassName } from "~/prophandlers";

export const meta: MetaFunction = () => {
  const title = "유틸리티 | 몰루로그";
  const description = "블루 아카이브 플레이 계획에 필요한 계산기와 플래너를 사용해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const navigationBarContents = await getNavigationBarContents(context.cloudflare.env);
  return {
    upcomingEvent: navigationBarContents.upcomingEvent,
  };
};

export default function UtilsIndexPage() {
  const { upcomingEvent } = useLoaderData<typeof loader>();
  const utilSection = getNavigationSections({
    pathname: "/utils",
    upcomingEvent,
    hasUnconsumedCoupons: false,
  }).find((section) => section.name === "플래너 & 계산기");

  return (
    <Page
      title="유틸리티"
      description="계산기와 플래너로 모집, 성장, 이벤트 계획을 정리해보세요"
      layout="vertical"
      contentArea="4xl"
    >
      <div className="grid grid-cols-1 gap-2">
        {utilSection?.items.map((item) => (
          <UtilityLinkItem key={item.name} {...item} />
        ))}
      </div>
    </Page>
  );
}

function UtilityLinkItem({
  to,
  name,
  description,
  OutlineIcon,
  disabled,
  showRedDot,
}: {
  to: string;
  name: string;
  description?: string;
  OutlineIcon: React.ComponentType<React.ComponentProps<"svg">>;
  disabled?: boolean;
  showRedDot?: boolean;
}) {
  const tone = utilityTone(name);
  const content = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className={`relative flex size-10 shrink-0 items-center justify-center rounded-md ${tone.icon}`}>
        <OutlineIcon className="size-5" strokeWidth={2} />
        {showRedDot && <div className="absolute right-1 top-1 size-1.5 rounded-full bg-red-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{name}</p>
        {description && <p className="mt-0.5 text-sm leading-snug text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
    </div>
  );

  if (disabled) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 opacity-50 dark:border-neutral-700 dark:bg-neutral-900">
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className={sanitizeClassName(`
        group flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 transition-colors
        hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/10 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/70
      `)}
    >
      {content}
      <ChevronRightIcon
        className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function utilityTone(name: string) {
  if (name.includes("청휘석")) {
    return {
      icon: "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
    };
  }
  if (name.includes("성장")) {
    return {
      icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    };
  }
  if (name.includes("이벤트")) {
    return {
      icon: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    };
  }
  if (name.includes("인연")) {
    return {
      icon: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    };
  }
  return {
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
  };
}
