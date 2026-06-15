import type { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import { ResourceCard, NumberInput, type NumberInputFlowNavigationInputProps } from "~/components/primitives";

export type ResourceInventoryTileMetric = {
  label?: string;
  value: string;
  valueClassName?: string;
};

type ResourceInventoryTileResource = {
  resourceType?: ResourceTypeEnum;
  rarity?: number;
  favoriteLevel?: number;
  label?: number | string;
  name?: string;
} & (
  | {
      itemUid: string;
      imageUrl?: undefined;
    }
  | {
      itemUid?: undefined;
      imageUrl: string;
    }
);

type ResourceInventoryTileProps = {
  resource: ResourceInventoryTileResource;
  currentQuantity?: number;
  draftQuantity?: number;
  quantityLabel?: string;
  showQuantityInput?: boolean;
  showName?: boolean;
  inputProps?: NumberInputFlowNavigationInputProps;
  metrics?: ResourceInventoryTileMetric[];
  onQuantityChange?: (quantity: number) => void;
};

export default function ResourceInventoryTile({
  resource,
  currentQuantity,
  draftQuantity = 0,
  quantityLabel = "보유",
  showName = false,
  inputProps,
  metrics,
  onQuantityChange,
  showQuantityInput = Boolean(onQuantityChange),
}: ResourceInventoryTileProps) {
  const changed = currentQuantity !== undefined && draftQuantity !== currentQuantity;

  return (
    <div
      title={resource.name}
      className={cn(
        "flex w-20 flex-col items-center gap-1.5 rounded-md px-1 py-2",
        changed && "bg-blue-50/70 dark:bg-blue-950/20",
      )}
    >
      {resource.itemUid ? (
        <ResourceCard
          itemUid={resource.itemUid}
          resourceType={resource.resourceType}
          rarity={resource.rarity}
          favoriteLevel={resource.favoriteLevel}
          name={resource.name}
          label={resource.label}
          size="lg"
        />
      ) : (
        <ResourceCard
          imageUrl={resource.imageUrl ?? ""}
          resourceType={resource.resourceType}
          rarity={resource.rarity}
          favoriteLevel={resource.favoriteLevel}
          name={resource.name}
          label={resource.label}
          size="lg"
        />
      )}
      {showName && resource.name ? (
        <p className="w-full truncate text-center text-xs leading-tight text-foreground">{resource.name}</p>
      ) : null}
      {showQuantityInput && onQuantityChange ? (
        <div className="w-full">
          <p className="mb-0.5 text-left text-xs font-medium leading-tight text-muted-foreground">{quantityLabel}</p>
          <NumberInput
            minValue={0}
            showDecrease={false}
            showIncrease={false}
            size="sm"
            value={draftQuantity}
            inputProps={inputProps}
            onChange={onQuantityChange}
          />
        </div>
      ) : null}
      {metrics && metrics.length > 0 ? (
        <div className="w-full space-y-px text-xs leading-tight">
          {metrics.map((metric) => (
            <MetricRow
              key={`${metric.label}-${metric.value}`}
              label={metric.label}
              value={metric.value}
              valueClassName={metric.valueClassName}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricRow({
  label,
  value,
  valueClassName,
}: {
  label?: string;
  value: string;
  valueClassName?: string;
}) {
  if (!label) {
    return (
      <div className="text-center">
        <span className={cn("font-semibold tabular-nums text-foreground", valueClassName)}>{value}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-0.5">
      <span className="leading-tight text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums text-foreground", valueClassName)}>{value}</span>
    </div>
  );
}
