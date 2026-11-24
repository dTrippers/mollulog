import { cn } from "~/lib/utils";
import { AronaGradientMark } from "./AronaMark";

// The mark of a student a recruit recommendation goal recommends, on 모집 추천 tiles and under 미래시 thumbnails.
// "sm" fits a thumbnail caption.
export function AiRecommendedMark({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold whitespace-nowrap",
        size === "sm" ? "gap-0.5 text-[0.6875rem] leading-4" : "gap-1 text-xs",
        className,
      )}
    >
      <AronaGradientMark size="xs" className="size-3" />
      <span className="bg-v2-ai-gradient bg-clip-text text-transparent">AI 추천</span>
    </span>
  );
}
