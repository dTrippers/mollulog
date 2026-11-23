import { SparklesIcon } from "@heroicons/react/24/outline";
import { useId } from "react";
import { cn } from "~/lib/utils";

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
      <SparklesIcon
        className="size-3 shrink-0 text-v2-accent"
        strokeWidth={size === "sm" ? 2 : undefined}
        aria-hidden="true"
      />
      <span className="bg-v2-ai-gradient bg-clip-text text-transparent">AI 추천</span>
    </span>
  );
}

// The solid sparkles filled with the AI gradient, for a row icon that marks an AI feature.
export function AiSparklesIcon({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--v2-ai-from)" />
          <stop offset="1" stopColor="var(--v2-ai-to)" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z"
      />
    </svg>
  );
}
