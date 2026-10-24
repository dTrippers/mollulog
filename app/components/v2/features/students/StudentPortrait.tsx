import { cn } from "~/lib/utils";
import { getStudentPortraitPresentation } from "~/models/student-image-policy";
import { useHaloMode } from "~/contexts/HaloModeContext";
import { useSourceImageState } from "../../../media/use-source-image-state";
import StudentHalo from "./StudentHalo";

type StudentPortraitProps = {
  uid: string | null;
  imageUid?: string | null;
  alt?: string;
  className: string;
  haloAboveBand?: boolean;
  haloScale?: "72%" | "80%";
  loading?: "eager" | "lazy";
};

export default function StudentPortrait({
  uid,
  imageUid,
  alt = "",
  className,
  haloAboveBand = false,
  haloScale = "80%",
  loading = "lazy",
}: StudentPortraitProps) {
  const { haloMode } = useHaloMode();
  const presentation = getStudentPortraitPresentation(uid, haloMode, imageUid ?? null);
  const image = useSourceImageState(
    presentation.kind === "collection" || presentation.kind === "concealed" ? presentation.src : null,
  );
  if (presentation.kind === "collection") {
    return image.failed ? null : (
      <img
        ref={image.ref}
        src={presentation.src}
        alt={alt}
        className={className}
        loading={loading}
        decoding="async"
        onLoad={image.onLoad}
        onError={image.onError}
      />
    );
  }

  return (
    <span
      className={cn(
        "relative isolate aspect-[200/226] items-center justify-center overflow-hidden bg-v2-inset",
        className,
        "flex",
      )}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {presentation.kind === "concealed" ? (
        <>
          {!image.failed ? (
            <img
              key={presentation.src}
              ref={image.ref}
              src={presentation.src}
              alt=""
              aria-hidden="true"
              className={cn(
                "absolute inset-0 size-full object-cover transition-opacity duration-v2-fast",
                image.loaded ? "opacity-100" : "opacity-0",
              )}
              loading={loading}
              decoding="async"
              draggable={false}
              onLoad={image.onLoad}
              onError={image.onError}
            />
          ) : null}
          <StudentHalo src={presentation.haloSrc} aboveBand={haloAboveBand} scale={haloScale} />
        </>
      ) : null}
    </span>
  );
}
