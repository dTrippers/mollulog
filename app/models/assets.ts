export function bossImageUrl(boss: string): string {
  return `https://assets.mollulog.net/assets/images/boss/${boss}`;
}

export function bossBannerUrl(boss: string): string {
  return `https://assets.mollulog.net/assets/images/boss-banner/${boss}`;
}

export function studentImageUrl(uid: string): string {
  if (uid === "unlisted") {
    return "https://assets.mollulog.net/assets/images/students/-1";
  }
  return `https://assets.baql.net/images/students/collection/${uid}.webp`;
}

export function studentStandingImageUrl(uid: string): string {
  return `https://assets.baql.net/images/students/standing/${uid}.webp`;
}

export function eventIconImageUrl(contentUid: string | null, locale: "kr" | "jp" = "kr"): string | null {
  if (!contentUid) return null;
  return `https://assets.baql.net/images/events/icon/${encodeURIComponent(contentUid)}_${locale}.webp`;
}

export function eventCardImageUrl(cardGroupUid: string): string {
  return `https://assets.baql.net/images/events/cards/${encodeURIComponent(cardGroupUid)}.webp`;
}

const RESOURCE_IMAGE_DIRECTORIES = {
  item: "items",
  currency: "currencies",
  equipment: "equipments",
  furniture: "furnitures",
} as const;

export type ResourceImageType = keyof typeof RESOURCE_IMAGE_DIRECTORIES;

export function resourceImageUrl(resourceType: ResourceImageType, uid: string): string {
  return `https://assets.baql.net/images/resources/${RESOURCE_IMAGE_DIRECTORIES[resourceType]}/${uid}.webp`;
}

export function itemImageUrl(item: string): string {
  return resourceImageUrl("item", item);
}

export function equipmentImageUrl(equipment: string): string {
  return resourceImageUrl("equipment", equipment);
}

export function terrainAdaptationIconUrl(rank: "D" | "C" | "B" | "A" | "S" | "SS"): string {
  return `https://assets.mollulog.net/assets/images/ui/terrain-${rank}.png`;
}

// Event, pickup, timeline, and coupon images are stored as uploaded (often 1920px wide or larger), so they go
// through Cloudflare Image Transformations on the apex zone. CloudFront caches each result per normalized Accept
// (see deploy/cdn).
const RESIZABLE_UPLOADED_IMAGE_PREFIXES = [
  "https://assets.mollulog.net/assets/images/events/",
  "https://assets.mollulog.net/assets/images/pickups/",
  "https://assets.mollulog.net/assets/images/timeline/",
  "https://assets.mollulog.net/assets/images/coupons/",
];
const IMAGE_TRANSFORM_BASE_URL = "https://mollulog.net/cdn-cgi/image";

// Keep this list short: every width is a separate cache entry per format.
const UPLOADED_IMAGE_WIDTHS = [192, 640, 1280, 1920] as const;

export type UploadedImageWidth = (typeof UPLOADED_IMAGE_WIDTHS)[number];

export type ResponsiveImageProps = { src: string; srcSet?: string; sizes?: string };

function isResizableUploadedImage(url: string): boolean {
  return (
    RESIZABLE_UPLOADED_IMAGE_PREFIXES.some((prefix) => url.startsWith(prefix)) &&
    !/[?#]/.test(url) &&
    !url.toLowerCase().endsWith(".gif")
  );
}

// Returns the URL unchanged for anything that is not a resizable upload (GIFs, other hosts, external URLs).
export function uploadedImageUrl(url: string, width: UploadedImageWidth): string {
  if (!isResizableUploadedImage(url)) return url;
  return `${IMAGE_TRANSFORM_BASE_URL}/width=${width},fit=scale-down,format=webp,onerror=redirect/${url}`;
}

// `sizes` is the rendered CSS width of the image; the browser picks the smallest listed width that covers it at
// the device pixel ratio. Non-resizable URLs come back as a plain `src`.
export function uploadedImageProps(url: string, sizes: string): ResponsiveImageProps {
  if (!isResizableUploadedImage(url)) return { src: url };
  return {
    src: uploadedImageUrl(url, 640),
    srcSet: UPLOADED_IMAGE_WIDTHS.map((width) => `${uploadedImageUrl(url, width)} ${width}w`).join(", "),
    sizes,
  };
}
