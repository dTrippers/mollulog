import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { AronaMark } from "../ai/AronaMark";

// The 미래시 Aside's link to 모집 추천. It wears the AI glow by an approved exception (see `shadow-v2-ai-banner`), and
// looks the same whether or not the Sensei has picked a goal.
export function RecruitRecommendationBanner() {
  return (
    <Link
      to="/ai/recruit"
      prefetch="intent"
      className={cn(
        "relative flex items-center gap-3 rounded-lg bg-v2-surface p-3 shadow-v2-ai-banner",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-lg before:content-[''] hover:before:bg-v2-hover before:v2-interaction-transition",
        v2FocusRing,
      )}
      {...getV2LinkTransitionProps("forward")}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-v2-ai-gradient text-v2-on-accent-solid">
        {/* Raised a little: the mark's weight sits low, so it looks centered in the round badge this way. */}
        <AronaMark className="relative bottom-[0.75px] size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-v2-fg">모집 추천 (β)</span>
        <span className="block text-xs text-v2-fg-tertiary">목표별 픽업 학생 우선순위</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
    </Link>
  );
}
