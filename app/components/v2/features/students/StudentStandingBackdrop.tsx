import { useImageFailure } from "~/components/v2/primitives/use-image-failure";
import { cn } from "~/lib/utils";
import { studentStandingImageUrl } from "~/models/assets";

// The standing illustration beside the profile facts, cropped below the knees and fading toward the text and the panel below.
// It is decorative, so a failed image is simply left out.
export function StudentStandingBackdrop({ uid, className }: { uid: string; className?: string }) {
  const src = studentStandingImageUrl(uid);
  const image = useImageFailure(src);
  if (image.failed) return null;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none flex justify-center overflow-hidden mask-l-from-55% mask-b-from-75%", className)}>
      <img ref={image.ref} src={src} alt="" onError={image.onError} className="mt-2 h-[150%] w-auto max-w-none shrink-0" />
    </div>
  );
}
