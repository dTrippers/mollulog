import type dayjs from "dayjs";
import { useState } from "react";
import { Button, ResourceCard } from "~/components/primitives";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import type { PickupResources } from "~/models/pyroxene-timeline";
import { PYROXENE_RESOURCE_UIDS } from "~/models/pyroxene-planner-source-config";

type PyroxeneTimelineResourcesProps = {
  date: dayjs.Dayjs;
  description: string;
  resources: PickupResources;
  itemUid?: string;
  onDeleteItem?: (itemUid: string) => void;
  collectedSourceKey?: string;
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
  collected = false,
  onCollectedSourceChange,
}: PyroxeneTimelineResourcesProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDeleteClick = () => {
    if (!itemUid || !onDeleteItem) {
      return;
    }

    if (confirmingDelete) {
      onDeleteItem(itemUid);
      return;
    }

    setConfirmingDelete(true);
    setTimeout(() => setConfirmingDelete(false), 3000);
  };

  const formatResourceDelta = (value: number) => (value > 0 ? value.toLocaleString() : `-${Math.abs(value).toLocaleString()}`);
  const labelColor = (value: number) => (value < 0 ? "red" : "white");

  return (
    <div
      className={cn(
        "my-3 flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 transition-opacity dark:border-neutral-700",
        collected && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {date.format("YYYY-MM-DD")}({date.format("ddd")})
        </p>
        <p className="line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
        {(collectedSourceKey || (itemUid && onDeleteItem)) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {collectedSourceKey && onCollectedSourceChange && (
              <Button
                text={collected ? "되돌리기" : "수급 완료"}
                variant={collected ? "tint" : "tint-blue"}
                size="xs"
                onClick={() => onCollectedSourceChange(collectedSourceKey, !collected)}
              />
            )}
            {itemUid && onDeleteItem && (
              <button
                type="button"
                onClick={handleDeleteClick}
                className={`cursor-pointer whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-medium transition ${
                  confirmingDelete
                    ? "animate-pulse border-red-300 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300"
                    : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                }`}
              >
                {confirmingDelete ? "정말 삭제할까요?" : "삭제"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
        {resources.pyroxene !== 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Currency}
            itemUid={PYROXENE_RESOURCE_UIDS.pyroxene}
            label={formatResourceDelta(resources.pyroxene)}
            labelColor={labelColor(resources.pyroxene)}
          />
        )}
        {resources.oneTimeTicket !== 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Item}
            itemUid={PYROXENE_RESOURCE_UIDS.oneTimeTicket}
            label={formatResourceDelta(resources.oneTimeTicket)}
            labelColor={labelColor(resources.oneTimeTicket)}
          />
        )}
        {resources.tenTimeTicket !== 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Item}
            itemUid={PYROXENE_RESOURCE_UIDS.tenTimeTicket}
            label={formatResourceDelta(resources.tenTimeTicket)}
            labelColor={labelColor(resources.tenTimeTicket)}
          />
        )}
      </div>
    </div>
  );
}
