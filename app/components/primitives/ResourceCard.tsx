import { memo, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { sanitizeClassName } from "~/prophandlers";

type ResourceCardProps = {
  resourceType?: ResourceTypeEnum;
  rarity?: number;
  favoriteLevel?: number;
  label?: number | string;
  labelColor?: "white" | "yellow" | "red";
  labelBgColor?: "black" | "red";
  name?: string;
  size?: "md" | "lg";
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

function ResourceCard({
  resourceType,
  rarity = 1,
  favoriteLevel,
  itemUid,
  imageUrl: imageUrlProp,
  label,
  labelColor = "white",
  labelBgColor = "black",
  name,
  size = "md",
}: ResourceCardProps) {
  let imageUrl = imageUrlProp;
  if (itemUid) {
    if (resourceType === "furniture") {
      imageUrl = furnitureImageUrl(itemUid);
    } else if (resourceType === "equipment") {
      imageUrl = equipmentImageUrl(itemUid);
    } else if (resourceType === "currency") {
      imageUrl = currencyImageUrl(itemUid);
    } else {
      imageUrl = itemImageUrl(itemUid);
    }
  }

  let sizeClass = "size-10";
  let imageSizeClass = "size-8";
  if (size === "lg") {
    sizeClass = "size-12 md:size-14";
    imageSizeClass = "size-10";
  }

  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  } | null>(null);

  const showTooltip = () => {
    if (!name || typeof window === "undefined") {
      return;
    }

    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setTooltip({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
      placement: "top",
    });
  };

  const hideTooltip = () => setTooltip(null);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current || !cardRef.current || typeof window === "undefined") {
      return;
    }

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const minLeft = viewportPadding + tooltipRect.width / 2;
    const maxLeft = window.innerWidth - viewportPadding - tooltipRect.width / 2;
    const nextLeft = Math.min(Math.max(cardRect.left + cardRect.width / 2, minLeft), maxLeft);
    const placement = cardRect.top - tooltipRect.height - viewportPadding < viewportPadding ? "bottom" : "top";
    const nextTop = placement === "top" ? cardRect.top - viewportPadding : cardRect.bottom + viewportPadding;

    if (tooltip.left !== nextLeft || tooltip.top !== nextTop || tooltip.placement !== placement) {
      setTooltip({
        top: nextTop,
        left: nextLeft,
        placement,
      });
    }
  }, [tooltip]);

  return (
    <div
      ref={cardRef}
      className="relative group"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      <div
        className={`shrink-0 ${sizeClass} rounded-lg border border-neutral-200 dark:border-neutral-700 ${rarityBgClass(rarity)} flex items-center justify-center overflow-hidden`}
      >
        <img
          alt="아이템 이미지"
          src={imageUrl}
          className={`${imageUrlProp ? imageSizeClass : "w-full h-full"} scale-110 object-contain`}
          loading="lazy"
        />
        {label && (
          <div
            className={sanitizeClassName(`
              flex items-center justify-center px-1 absolute -bottom-1 -right-1 ${labelBadgeBgClass(labelBgColor)} rounded
              border-2 border-white dark:border-neutral-800 ${labelTextColorClass(labelColor)} text-xs font-medium tracking-tighter
            `)}
          >
            {label}
          </div>
        )}
      </div>
      {favoriteLevel && (
        <img
          src={favoriteLevelImageUrl(favoriteLevel)}
          alt={`호감 레벨 ${favoriteLevel}`}
          className="absolute -bottom-1 -right-1 w-6 h-6 object-contain"
          loading="lazy"
        />
      )}
      {name &&
        tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            className={sanitizeClassName(`
              pointer-events-none fixed z-layer-navigation max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg
              dark:border-neutral-600 dark:bg-neutral-800
              ${tooltip.placement === "top" ? "-translate-y-full" : ""}
            `)}
            style={{ top: tooltip.top, left: tooltip.left }}
          >
            {name}
            <div
              className={sanitizeClassName(`
                absolute left-1/2 -translate-x-1/2 border-4 border-transparent
                ${
                  tooltip.placement === "top"
                    ? "top-full border-t-neutral-900 dark:border-t-neutral-800"
                    : "bottom-full border-b-neutral-900 dark:border-b-neutral-800"
                }
              `)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

export default memo(ResourceCard);

function labelBadgeBgClass(labelBgColor: "black" | "red"): string {
  if (labelBgColor === "red") {
    return "bg-red-600/80 dark:bg-red-500/80";
  }
  return "bg-neutral-900/80";
}

function labelTextColorClass(labelColor: "white" | "yellow" | "red"): string {
  if (labelColor === "red") {
    return "text-red-300 dark:text-red-200";
  }
  if (labelColor === "yellow") {
    return "text-orange-300";
  }
  return "text-white";
}

function rarityBgClass(rarity: number | null | undefined): string {
  switch (rarity) {
    case 4:
      return "bg-purple-200 dark:bg-purple-300";
    case 3:
      return "bg-orange-200 dark:bg-orange-300";
    case 2:
      return "bg-blue-200 dark:bg-blue-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-500";
  }
}

function itemImageUrl(itemUid: string): string {
  return `https://baql-assets.mollulog.net/images/items/${itemUid}`;
}

function furnitureImageUrl(furnitureUid: string): string {
  return `https://baql-assets.mollulog.net/images/furnitures/${furnitureUid}`;
}

function equipmentImageUrl(equipmentUid: string): string {
  return `https://baql-assets.mollulog.net/images/equipments/${equipmentUid}`;
}

function currencyImageUrl(currencyUid: string): string {
  return `https://baql-assets.mollulog.net/images/currencies/${currencyUid}`;
}

function favoriteLevelImageUrl(favoriteLevel: number): string {
  return `https://assets.mollulog.net/assets/images/ui/gift-reaction-${favoriteLevel}.png`;
}
