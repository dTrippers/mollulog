import { CheckIcon } from "@heroicons/react/16/solid";
import { Button } from "~/components/primitives";
import PyroxeneResourceChip from "~/components/features/futures/PyroxeneResourceChip";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import { ResourceTypeEnum } from "~/graphql/graphql";
import dayjs from "~/lib/dayjs";
import type { ApRefillSuggestion } from "~/domain/ap-planner";
import ApChip from "./ApChip";

const KST = "Asia/Seoul";

function formatSuggestionTitle(suggestion: ApRefillSuggestion) {
  if (suggestion.kind === "event-period") {
    const start = dayjs.tz(`${suggestion.startDate}T12:00:00`, KST).format("M/D");
    const end = dayjs.tz(`${suggestion.endDate}T12:00:00`, KST).format("M/D");
    return `${start}~${end} 매일 AP 충전 ${suggestion.fromCount} → ${suggestion.toCount}회`;
  }
  return `${dayjs.tz(`${suggestion.startDate}T12:00:00`, KST).format("M/D(ddd)")} AP 충전 ${suggestion.toCount}회`;
}

export default function ApRefillTile({
  suggestion,
  requiredAp,
  applied,
  disabled,
  applyVariant,
  onApply,
  onUndo,
}: {
  suggestion: ApRefillSuggestion;
  requiredAp: number;
  applied: boolean;
  disabled: boolean;
  applyVariant: "primary" | "secondary";
  onApply: () => void;
  onUndo: () => void;
}) {
  const resultAfter = suggestion.resultAp - requiredAp;
  const isShort = resultAfter < 0;
  const responsiveActionSize = "md:px-2 md:py-1 md:rounded-sm md:text-xs md:shadow-none";
  return (
    <div
      className={`min-w-0 space-y-0 rounded-md p-3 md:space-y-0 ${applied ? "bg-primary/10 dark:bg-primary/15" : "bg-muted"}`}
    >
      <p className="text-sm font-medium break-keep">{formatSuggestionTitle(suggestion)}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ApChip value={`+${suggestion.additionalAp.toLocaleString()}`} />
        <PyroxeneResourceChip
          resourceType={ResourceTypeEnum.Currency}
          itemUid={PYROXENE_RESOURCE_UIDS.pyroxene}
          value={`−${suggestion.pyroxeneCost.toLocaleString()}`}
          tone="negative"
          variant="plain"
          className="font-semibold text-red-700 dark:text-red-300"
        />
      </div>
      {applied ? (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
            <CheckIcon aria-hidden="true" className="size-4 text-green-700 dark:text-green-400" /> 적용됨
          </span>
          <Button
            text="되돌리기"
            size="sm"
            className={responsiveActionSize}
            variant="secondary"
            disabled={disabled}
            onClick={onUndo}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p
            className={`min-w-0 text-sm font-medium break-keep ${isShort ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-400"}`}
          >
            적용하면 {Math.abs(resultAfter).toLocaleString()} AP {isShort ? "부족" : "여유"}
          </p>
          <Button
            text="적용"
            size="sm"
            className={`${responsiveActionSize} ${applyVariant === "secondary" ? "bg-background hover:bg-muted dark:bg-muted-foreground/25 dark:hover:bg-muted-foreground/35" : ""}`}
            variant={applyVariant}
            disabled={disabled}
            onClick={onApply}
          />
        </div>
      )}
    </div>
  );
}
