import { memo } from "react";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { sanitizeClassName } from "~/prophandlers";
import HoverTooltip from "./HoverTooltip";

type ResourceCardProps = {
  resourceType?: ResourceTypeEnum;
  rarity?: number;
  favoriteLevel?: number;
  label?: number | string;
  labelColor?: "white" | "yellow" | "red";
  labelBgColor?: "black" | "red";
  name?: string;
  size?: "sm" | "md" | "lg";
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
  if (size === "sm") {
    sizeClass = "size-6";
    imageSizeClass = "size-5";
  } else if (size === "lg") {
    sizeClass = "size-12 md:size-14";
    imageSizeClass = "size-10";
  }

  return (
    <HoverTooltip
      as="div"
      className="relative group"
      content={name}
      disabled={!name}
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
    </HoverTooltip>
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
