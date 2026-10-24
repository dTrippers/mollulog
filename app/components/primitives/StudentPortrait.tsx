import { cn } from "~/lib/utils";
import { getStudentPortraitPresentation } from "~/models/student-image-policy";
import { useHaloMode } from "~/contexts/HaloModeContext";
import StudentHalo from "~/components/primitives/StudentHalo";
import { useSourceImageState } from "~/components/media/use-source-image-state";

type StudentPortraitProps = {
  uid: string | null;
  imageUid?: string | null;
  alt?: string;
  className: string;
  haloAboveBand?: boolean;
  haloScale?: "72%" | "80%";
  loading?: "eager" | "lazy";
  onError?: React.ReactEventHandler<HTMLImageElement>;
};

export default function StudentPortrait({
  uid,
  imageUid,
  alt = "",
  className,
  haloAboveBand = false,
  haloScale = "80%",
  loading = "lazy",
  onError,
}: StudentPortraitProps) {
  const { haloMode } = useHaloMode();
  const presentation = getStudentPortraitPresentation(uid, haloMode, imageUid ?? null);
  const concealedSrc = presentation.kind === "concealed" ? presentation.src : null;
  const portraitImage = useSourceImageState(concealedSrc);

  if (presentation.kind === "collection") {
    return <img src={presentation.src} alt={alt} className={className} loading={loading} onError={onError} />;
  }

  return (
    <span
      className={cn(
        "relative isolate aspect-[200/226] items-center justify-center overflow-hidden bg-muted",
        className,
        "flex",
      )}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {presentation.kind === "concealed" ? (
        <>
          {!portraitImage.failed ? (
            <img
              key={presentation.src}
              ref={portraitImage.ref}
              src={presentation.src}
              alt=""
              aria-hidden="true"
              className={cn(
                "absolute inset-0 size-full object-cover transition-opacity duration-v2-fast",
                portraitImage.loaded ? "opacity-100" : "opacity-0",
              )}
              loading={loading}
              draggable={false}
              onLoad={portraitImage.onLoad}
              onError={portraitImage.onError}
            />
          ) : null}
          <StudentHalo src={presentation.haloSrc} aboveBand={haloAboveBand} scale={haloScale} />
        </>
      ) : null}
    </span>
  );
}
