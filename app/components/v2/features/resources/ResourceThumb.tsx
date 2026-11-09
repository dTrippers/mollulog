import { type ReactNode, useId, useRef, useState } from "react";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { resourceCountLabel } from "~/domain/event-shop/utils";
import { cn } from "~/lib/utils";
import { type ResourceImageType, resourceImageUrl } from "~/models/assets";

// drop (32px) and tile (48px) are the shop calculator's stage drop and item tile sizes.
export type ResourceThumbSize = "sm" | "drop" | "md" | "tile" | "lg";

export type ResourceThumbProps = {
  itemUid: string;
  resourceType?: ResourceTypeEnum;
  name?: string;
  size?: ResourceThumbSize;
  imageUrl?: string;
  label?: ReactNode;
  // Listed quantity. Rendered as the chip with K·M abbreviation; the exact count goes into the name tooltip.
  quantity?: number;
  rarity?: number | null;
  bare?: boolean;
  tooltip?: boolean;
  nameTooltip?: boolean;
  // "inset" draws the label inside the image's bottom-right corner, for dense rows of small thumbnails.
  labelPlacement?: "corner" | "inset";
};

const sizeClassName = {
  sm: "size-6",
  drop: "size-8",
  md: "size-10",
  tile: "size-12",
  lg: "size-12 md:size-14",
} as const;

// Item image thumbnail. Without a known image type or image, a labeled neutral placeholder is shown instead of a guess.
export function ResourceThumb({
  itemUid,
  resourceType = ResourceTypeEnum.Item,
  name,
  size = "md",
  imageUrl,
  label: labelProp,
  quantity,
  rarity,
  bare = false,
  tooltip = false,
  nameTooltip = false,
  labelPlacement = "corner",
}: ResourceThumbProps) {
  const [nameTooltipOpen, setNameTooltipOpen] = useState(false);
  const lastPointerType = useRef<string | null>(null);
  const nameTooltipId = useId();
  const src = resourceThumbImageSrc(itemUid, resourceType, imageUrl);
  const rarityClassName = rarityClass(rarity);
  const label = labelProp ?? (quantity == null ? undefined : resourceCountLabel(quantity));
  const exactQuantity = quantity == null ? null : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const tooltipText =
    name && exactQuantity && labelProp == null && exactQuantity !== label ? `${name} ×${exactQuantity}` : name;
  const image = src ? (
    <img alt={name ?? ""} src={src} loading="lazy" className="size-full object-contain" />
  ) : (
    <span
      role="img"
      aria-label={`${name ?? "아이템"} 이미지 없음`}
      className="px-1 text-center text-[8px] leading-tight text-v2-fg-tertiary"
    >
      이미지 없음
    </span>
  );
  const inset = labelPlacement === "inset";
  const labelBadge =
    label == null ? null : inset ? (
      <span className="absolute right-0 bottom-0 rounded-tl-[5px] bg-v2-scrim px-[3px] text-[0.625rem] leading-[0.8125rem] font-semibold tabular-nums text-v2-on-media">
        {label}
      </span>
    ) : (
      <span className="absolute -right-1 -bottom-1 flex items-center justify-center rounded border-2 border-v2-surface bg-v2-scrim px-1 text-xs font-medium tabular-nums text-v2-on-media">
        {label}
      </span>
    );

  // Keep existing ResourceThumb callers byte-for-byte equivalent unless an opt-in shop feature is used.
  if (!bare && label == null && rarity == null && !tooltip && !nameTooltip && imageUrl === undefined) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-v2-inset",
          sizeClassName[size],
        )}
      >
        {image}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0",
        inset && "overflow-hidden rounded-md",
        label != null && !bare && !inset && (!nameTooltip || !name) && "pr-1 pb-1",
      )}
    >
      {nameTooltip && name ? (
        <button
          type="button"
          aria-label={`${name} 이름 표시`}
          aria-expanded={nameTooltipOpen}
          aria-describedby={nameTooltipOpen ? nameTooltipId : undefined}
          title={tooltip ? tooltipText : undefined}
          onClick={() => {
            lastPointerType.current = null;
            setNameTooltipOpen((open) => !open);
          }}
          onTouchStart={() => {
            lastPointerType.current = "touch";
          }}
          onPointerDown={(event) => {
            lastPointerType.current = event.pointerType;
          }}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") setNameTooltipOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") setNameTooltipOpen(false);
          }}
          onFocus={() => {
            if (lastPointerType.current !== "touch") setNameTooltipOpen(true);
          }}
          onBlur={() => setNameTooltipOpen(false)}
          className={cn(
            "relative flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-inherit",
            label != null && !bare && !inset && "pr-1 pb-1",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center overflow-hidden",
              !bare && "rounded-md",
              !bare && (rarityClassName ?? "bg-v2-inset"),
              sizeClassName[size],
            )}
          >
            {image}
          </span>
          {labelBadge}
          {nameTooltipOpen ? (
            <span
              id={nameTooltipId}
              role="tooltip"
              className="absolute bottom-full left-0 z-10 mb-2 w-max max-w-[calc(100vw-2rem)] break-words whitespace-normal rounded-md bg-v2-scrim px-2 py-1 text-xs font-normal text-v2-on-media shadow-md"
            >
              {tooltipText}
            </span>
          ) : null}
        </button>
      ) : (
        <span
          title={tooltip ? tooltipText : undefined}
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden",
            !bare && "rounded-md",
            !bare && (rarityClassName ?? "bg-v2-inset"),
            sizeClassName[size],
          )}
        >
          {image}
        </span>
      )}
      {!nameTooltip || !name ? labelBadge : null}
    </span>
  );
}

// The image a ResourceThumb shows, or null when the resource type has no known image path.
export function resourceThumbImageSrc(
  itemUid: string,
  resourceType: ResourceTypeEnum = ResourceTypeEnum.Item,
  imageUrl?: string | null,
): string | null {
  const imageType = getResourceImageType(resourceType);
  return imageUrl ?? (imageType ? resourceImageUrl(imageType, itemUid) : null);
}

function rarityClass(rarity: number | null | undefined): string | undefined {
  switch (rarity) {
    case 1:
      return "bg-v2-item-rarity-1";
    case 2:
      return "bg-v2-item-rarity-2";
    case 3:
      return "bg-v2-item-rarity-3";
    case 4:
      return "bg-v2-item-rarity-4";
    default:
      return undefined;
  }
}

function getResourceImageType(resourceType: ResourceTypeEnum): ResourceImageType | undefined {
  switch (resourceType) {
    case ResourceTypeEnum.Item:
      return "item";
    case ResourceTypeEnum.Currency:
      return "currency";
    case ResourceTypeEnum.Equipment:
      return "equipment";
    case ResourceTypeEnum.Furniture:
      return "furniture";
    default:
      return undefined;
  }
}
