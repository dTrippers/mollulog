import type dayjs from "dayjs";
import { useState } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import type { PickupResources } from "~/models/pyroxene-timeline";
import { ResourceCard } from "~/components/primitives";

type PyroxeneTimelineResourcesProps = {
  date: dayjs.Dayjs;
  description: string;
  resources: PickupResources;
  itemUid?: string;
  onDeleteItem?: (itemUid: string) => void;
};

export default function PyroxeneTimelineResources({
  date,
  description,
  resources,
  itemUid,
  onDeleteItem,
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
    <div className="my-3 flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {date.format("YYYY-MM-DD")}({date.format("ddd")})
        </p>
        <p className="line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-1.5">
        {resources.pyroxene !== 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Currency}
            itemUid="2"
            label={formatResourceDelta(resources.pyroxene)}
            labelColor={labelColor(resources.pyroxene)}
          />
        )}
        {resources.oneTimeTicket !== 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Item}
            itemUid="6998"
            label={formatResourceDelta(resources.oneTimeTicket)}
            labelColor={labelColor(resources.oneTimeTicket)}
          />
        )}
        {resources.tenTimeTicket !== 0 && (
          <ResourceCard
            resourceType={ResourceTypeEnum.Item}
            itemUid="6999"
            label={formatResourceDelta(resources.tenTimeTicket)}
            labelColor={labelColor(resources.tenTimeTicket)}
          />
        )}
      </div>
      {itemUid && onDeleteItem && (
        <button
          type="button"
          onClick={handleDeleteClick}
          className={`ml-2 shrink-0 whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-medium transition ${
            confirmingDelete
              ? "animate-pulse border-red-300 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300"
              : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
          }`}
        >
          {confirmingDelete ? "정말 삭제할까요?" : "삭제"}
        </button>
      )}
    </div>
  );
}
