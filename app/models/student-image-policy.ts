import { studentImageUrl } from "~/models/assets";

export const HALO_ASSET_BASE_URL = "https://assets.mollulog.net/assets/images/halos";
export const HALO_PORTRAIT_ASSET_BASE_URL = "https://assets.mollulog.net/assets/images/halo-portraits";

export type StudentPortraitPresentation =
  | { kind: "collection"; src: string }
  | { kind: "concealed"; src: string; haloSrc: string }
  | { kind: "neutral" };

export function getStudentPortraitPresentation(
  uid: string | null,
  haloMode: boolean,
  imageUid: string | null = null,
): StudentPortraitPresentation {
  if (!uid || uid === "unlisted") return { kind: "neutral" };
  const src = studentImageUrl(imageUid ?? uid);
  if (!haloMode) return { kind: "collection", src };
  const portraitKey = imageUid ?? uid;
  return {
    kind: "concealed",
    src: `${HALO_PORTRAIT_ASSET_BASE_URL}/${encodeURIComponent(portraitKey)}.webp`,
    haloSrc: `${HALO_ASSET_BASE_URL}/${encodeURIComponent(uid)}.webp`,
  };
}
