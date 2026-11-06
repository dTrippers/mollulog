import { UserIcon } from "@heroicons/react/24/outline";
import { cn } from "~/lib/utils";
import { useImageFailure } from "../../primitives/use-image-failure";
import StudentPortrait from "./StudentPortrait";

export type RoundStudentImageProps = {
  studentUid: string | null;
  imageUrl?: string;
  alt?: string;
  size?: "sm" | "md" | "lg" | 6 | 8 | 10 | 12 | 16;
  className?: string;
};

const sizeClassName = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
  6: "size-6",
  8: "size-8",
  10: "size-10",
  12: "size-10 md:size-12",
  16: "size-16",
} as const;

const fallbackIconSizeClassName = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
  6: "size-4",
  8: "size-6",
  10: "size-8",
  12: "size-8 md:size-10",
  16: "size-12",
} as const;

export function RoundStudentImage({ studentUid, imageUrl, alt = "", size = "md", className }: RoundStudentImageProps) {
  const src = imageUrl ?? null;
  const image = useImageFailure(src);
  // A student portrait goes through the portrait policy, so halo mode can conceal it.
  if (!imageUrl && studentUid) {
    return (
      <span
        className={cn(sizeClassName[size], "relative inline-block shrink-0 overflow-hidden rounded-full bg-v2-inset", className)}
        {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
      >
        <StudentPortrait uid={studentUid} className="size-full object-cover" />
      </span>
    );
  }
  return src && !image.failed ? (
    <img
      ref={image.ref}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={image.onError}
      className={cn(sizeClassName[size], "inline shrink-0 rounded-full bg-v2-inset object-cover", className)}
    />
  ) : alt ? (
    <span
      className={cn(sizeClassName[size], "inline-flex shrink-0 items-center justify-center rounded-full bg-v2-inset text-v2-fg-tertiary", className)}
      role="img"
      aria-label={alt}
    >
      <UserIcon className={fallbackIconSizeClassName[size]} aria-hidden="true" />
    </span>
  ) : (
    <span
      className={cn(sizeClassName[size], "inline-flex shrink-0 items-center justify-center rounded-full bg-v2-inset text-v2-fg-tertiary", className)}
      aria-hidden="true"
    >
      <UserIcon className={fallbackIconSizeClassName[size]} aria-hidden="true" />
    </span>
  );
}
