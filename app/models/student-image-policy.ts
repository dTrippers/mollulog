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
  if (!uid) return { kind: "neutral" };
  // The in-game placeholder icon is not character artwork, so halo mode shows it as is.
  if (uid === "unlisted") return { kind: "collection", src: studentImageUrl(uid) };
  const src = studentImageUrl(imageUid ?? uid);
  if (!haloMode) return { kind: "collection", src };
  const portraitKey = imageUid ?? uid;
  return {
    kind: "concealed",
    src: `${HALO_PORTRAIT_ASSET_BASE_URL}/${encodeURIComponent(portraitKey)}.webp`,
    haloSrc: `${HALO_ASSET_BASE_URL}/${encodeURIComponent(uid)}.webp`,
  };
}
