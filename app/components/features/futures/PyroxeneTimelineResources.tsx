import type dayjs from "dayjs";
import { Button } from "~/components/primitives";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import { ResourceTypeEnum } from "~/graphql/graphql";
import PyroxeneResourceChip from "./PyroxeneResourceChip";

type PyroxeneTimelineResourcesProps = {
  date: dayjs.Dayjs;
  description: string;
  resources: PickupResources;
  itemUid?: string;
  onDeleteItem?: (itemUid: string) => void;
  collectedSourceKey?: string;
  collectable?: boolean;
  collected?: boolean;
  onCollectedSourceChange?: (sourceKey: string, collected: boolean) => void;
};

export default function PyroxeneTimelineResources({
  date,
  description,
  resources,
  itemUid,
  onDeleteItem,
  collectedSourceKey,
  collectable = false,
  collected = false,
  onCollectedSourceChange,
}: PyroxeneTimelineResourcesProps) {
  const handleDeleteClick = () => {
    if (!itemUid || !onDeleteItem) {
      return;
    }

    if (window.confirm("정말 삭제할까요?")) {
      onDeleteItem(itemUid);
    }
  };

  const formatResourceDelta = (value: number) =>
    value > 0 ? value.toLocaleString() : `-${Math.abs(value).toLocaleString()}`;
  const resourceTone = (value: number) => {
    if (collected) {
      return "muted";
    }
    return value < 0 ? "negative" : "neutral";
  };
  const showCollectedAction = collectable && collectedSourceKey && onCollectedSourceChange;

  return (
    <div className="my-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 transition-opacity dark:border-neutral-700">
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <p className="shrink-0 text-xs font-semibold sm:text-sm">
            {date.format("YYYY-MM-DD")}({date.format("ddd")})
          </p>
          <TimelineResourceDescription description={description} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {resources.pyroxene !== 0 && (
            <PyroxeneResourceChip
              resourceType={ResourceTypeEnum.Currency}
              itemUid={PYROXENE_RESOURCE_UIDS.pyroxene}
              value={formatResourceDelta(resources.pyroxene)}
              tone={resourceTone(resources.pyroxene)}
              variant="plain"
              className={collected ? "opacity-60" : undefined}
            />
          )}
          {resources.oneTimeTicket !== 0 && (
            <PyroxeneResourceChip
              resourceType={ResourceTypeEnum.Item}
              itemUid={PYROXENE_RESOURCE_UIDS.oneTimeTicket}
              value={formatResourceDelta(resources.oneTimeTicket)}
              tone={resourceTone(resources.oneTimeTicket)}
              variant="plain"
              className={collected ? "opacity-60" : undefined}
            />
          )}
          {resources.tenTimeTicket !== 0 && (
            <PyroxeneResourceChip
              resourceType={ResourceTypeEnum.Item}
              itemUid={PYROXENE_RESOURCE_UIDS.tenTimeTicket}
              value={formatResourceDelta(resources.tenTimeTicket)}
              tone={resourceTone(resources.tenTimeTicket)}
              variant="plain"
              className={collected ? "opacity-60" : undefined}
            />
          )}
        </div>
        {showCollectedAction && (
          <div className="flex justify-end">
            <Button
              variant={collected ? "secondary" : "primary"}
              size="xs"
              onClick={() => onCollectedSourceChange(collectedSourceKey, !collected)}
              className="group"
            >
              {collected ? (
                <>
                  <span className="group-hover:hidden">수급 완료</span>
                  <span className="hidden group-hover:inline">되돌리기</span>
                </>
              ) : (
                "수급 완료"
              )}
            </Button>
          </div>
        )}
        {itemUid && onDeleteItem && (
          <div className="flex justify-end">
            <Button text="삭제" variant="danger-subtle" size="xs" onClick={handleDeleteClick} />
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineResourceDescription({ description }: { description: string }) {
  let offset = 0;
  const lines = description.split("\n").map((line) => {
    const key = `${offset}:${line}`;
    offset += line.length + 1;
    return { key, line };
  });

  return (
    <div className="min-w-0 text-xs leading-snug text-neutral-500 dark:text-neutral-400 sm:text-sm">
      {lines.map(({ key, line }) => (
        <span key={key} className="block truncate">
          {line}
        </span>
      ))}
    </div>
  );
}
