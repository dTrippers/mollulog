import { useId } from "react";
import { SectionCard } from "~/components/primitives";

type StudentAiSummaryCardProps = {
  summary: string;
};

export default function StudentAiSummaryCard({ summary }: StudentAiSummaryCardProps) {
  const gradientId = useId();
  return (
    <SectionCard className="mt-3 space-y-2 p-2.5 md:mt-4 md:p-4">
      <h3 className="w-fit flex items-center gap-1.5 bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-sm font-semibold text-transparent">
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 16 16">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="8" x2="68" y2="8" gradientUnits="userSpaceOnUse">
              {/* 68px = icon (16px) + flex gap (6px) + estimated label width, so the icon samples
                  the 0–16px slice of the same ramp the label glyphs clip against. */}
              <stop offset="0" style={{ stopColor: "var(--color-primary)" }} />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5 4a.75.75 0 0 1 .738.616l.252 1.388A1.25 1.25 0 0 0 6.996 7.01l1.388.252a.75.75 0 0 1 0 1.476l-1.388.252A1.25 1.25 0 0 0 5.99 9.996l-.252 1.388a.75.75 0 0 1-1.476 0L4.01 9.996A1.25 1.25 0 0 0 3.004 8.99l-1.388-.252a.75.75 0 0 1 0-1.476l1.388-.252A1.25 1.25 0 0 0 4.01 6.004l.252-1.388A.75.75 0 0 1 5 4ZM12 1a.75.75 0 0 1 .721.544l.195.682c.118.415.443.74.858.858l.682.195a.75.75 0 0 1 0 1.442l-.682.195a1.25 1.25 0 0 0-.858.858l-.195.682a.75.75 0 0 1-1.442 0l-.195-.682a1.25 1.25 0 0 0-.858-.858l-.682-.195a.75.75 0 0 1 0-1.442l.682-.195a1.25 1.25 0 0 0 .858-.858l.195-.682A.75.75 0 0 1 12 1ZM10 11a.75.75 0 0 1 .728.568.968.968 0 0 0 .704.704.75.75 0 0 1 0 1.456.968.968 0 0 0-.704.704.75.75 0 0 1-1.456 0 .968.968 0 0 0-.704-.704.75.75 0 0 1 0-1.456.968.968 0 0 0 .704-.704A.75.75 0 0 1 10 11Z"
            fill={`url(#${gradientId})`}
          />
        </svg>
        AI 요약
      </h3>
      <p className="text-sm text-foreground">{summary}</p>
      <p className="text-xs text-muted-foreground">AI가 생성한 결과로 내용이 부정확할 수 있어요</p>
    </SectionCard>
  );
}
