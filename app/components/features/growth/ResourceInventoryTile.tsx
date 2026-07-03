import type { ReactNode } from "react";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import {
  HoverTooltip,
  ResourceCard,
  NumberInput,
  type NumberInputFlowNavigationInputProps,
} from "~/components/primitives";

export type ResourceInventoryTileMetric = {
  key?: string;
  label?: string;
  value: ReactNode;
  valueClassName?: string;
  tooltip?: ReactNode;
  dimmed?: boolean;
  /** Renders invisible while still reserving its row height, to avoid layout shift when the value becomes empty. */
  hidden?: boolean;
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
  className?: string;
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
  className,
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
        "flex w-20 flex-col items-center gap-1 rounded-md px-0.5 py-1.5",
        changed && "bg-blue-50/70 dark:bg-blue-950/20",
        className,
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
        <div className="px-0.5 w-full space-y-px text-xs leading-tight">
          {metrics.map((metric, index) => (
            <MetricRow
              key={metric.key ?? `${metric.label ?? "metric"}-${index}`}
              label={metric.label}
              value={metric.value}
              valueClassName={metric.valueClassName}
              tooltip={metric.tooltip}
              dimmed={metric.dimmed}
              hidden={metric.hidden}
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
  tooltip,
  dimmed,
  hidden,
}: {
  label?: string;
  value: ReactNode;
  valueClassName?: string;
  tooltip?: ReactNode;
  dimmed?: boolean;
  hidden?: boolean;
}) {
  if (!label) {
    return (
      <div className={cn("text-center", dimmed && "opacity-40", hidden && "invisible")}>
        <span className={cn("whitespace-nowrap font-bold tabular-nums text-foreground", valueClassName)}>
          {value}
        </span>
      </div>
    );
  }

  const row = (
    <div className={cn("flex items-center justify-between gap-1", dimmed && "opacity-40", hidden && "invisible")}>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap leading-tight text-muted-foreground/70",
          tooltip && "underline decoration-dotted underline-offset-2",
        )}
      >
        {label}
      </span>
      <span className={cn("whitespace-nowrap font-bold tabular-nums text-foreground", valueClassName)}>{value}</span>
    </div>
  );

  if (!tooltip) {
    return row;
  }

  return (
    <HoverTooltip
      as="div"
      content={tooltip}
      focusable
      className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      contentClassName="px-3 py-2"
    >
      {row}
    </HoverTooltip>
  );
}
