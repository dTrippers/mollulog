import { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import { type ResourceImageType, resourceImageUrl } from "~/models/assets";

export type ResourceThumbSize = "sm" | "md" | "lg";

export type ResourceThumbProps = {
  itemUid: string;
  resourceType?: ResourceTypeEnum;
  name?: string;
  size?: ResourceThumbSize;
};

const sizeClassName = {
  sm: "size-6",
  md: "size-10",
  lg: "size-12 md:size-14",
} as const;

// Item image thumbnail. Without a known image type or image, a labeled neutral placeholder is shown instead of a guess.
export function ResourceThumb({
  itemUid,
  resourceType = ResourceTypeEnum.Item,
  name,
  size = "md",
}: ResourceThumbProps) {
  const imageType = getResourceImageType(resourceType);
  const src = imageType ? resourceImageUrl(imageType, itemUid) : null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-v2-inset",
        sizeClassName[size],
      )}
    >
      {src ? (
        <img alt={name ?? ""} src={src} loading="lazy" className="size-full object-contain" />
      ) : (
        <span
          role="img"
          aria-label={`${name ?? "아이템"} 이미지 없음`}
          className="px-1 text-center text-[8px] leading-tight text-v2-fg-tertiary"
        >
          이미지 없음
        </span>
      )}
    </span>
  );
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
