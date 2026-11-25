import { ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { useImageFailure } from "~/components/v2/primitives/use-image-failure";
import { cn } from "~/lib/utils";
import { studentStandingImageUrl } from "~/models/assets";

export type StudentStandingImage = ReturnType<typeof useStudentStandingImage>;

// One load state for the backdrop and its expand button, so a failed illustration leaves out both.
export function useStudentStandingImage(uid: string | null) {
  const src = uid ? studentStandingImageUrl(uid) : null;
  return { src, ...useImageFailure(src) };
}

// The standing illustration beside the profile facts, cropped below the knees and fading toward the text and the panel below.
// It is decorative, so a failed image is simply left out.
export function StudentStandingBackdrop({ image, className }: { image: StudentStandingImage; className?: string }) {
  if (!image.src || image.failed) return null;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none flex justify-center overflow-hidden mask-l-from-55% mask-b-from-75%", className)}>
      <img ref={image.ref} src={image.src} alt="" onError={image.onError} className="mt-2 h-[150%] w-auto max-w-none shrink-0" />
    </div>
  );
}

// Opens the whole illustration in a dialog. It floats over the backdrop on a faint surface, so the illustration shows through it.
export function StudentStandingExpandButton({ image, name, className }: { image: StudentStandingImage; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!image.src || image.failed) return null;
  return (
    <>
      <IconButton
        icon={ArrowsPointingOutIcon}
        label="일러스트 크게 보기"
        onClick={() => setOpen(true)}
        className={cn("bg-v2-surface/40 text-v2-fg-secondary backdrop-blur-sm hover:bg-v2-surface/70 hover:text-v2-fg", className)}
      />
      <Dialog open={open} title={`${name} 일러스트`} onClose={() => setOpen(false)} size="sm" titleHidden>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md bg-v2-inset">
          <img src={image.src} alt={`${name} 스탠딩 일러스트`} className="max-h-[calc(100dvh-4.5rem)] w-auto max-w-full object-contain" />
        </div>
      </Dialog>
    </>
  );
}
