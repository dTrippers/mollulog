import { cn } from "~/lib/utils";
import { useSourceImageState } from "~/components/media/use-source-image-state";

export default function StudentHalo({
  src,
  className,
  aboveBand = false,
  scale = "80%",
}: {
  src: string;
  className?: string;
  aboveBand?: boolean;
  scale?: "72%" | "80%";
}) {
  const image = useSourceImageState(src);

  return (
    <>
      <span aria-hidden="true" className="halo-contrast-scrim absolute inset-0 z-0" />
      <span
        className={cn(
          "absolute top-0 right-0 left-0 z-10 flex items-center justify-center",
          aboveBand ? "bottom-4" : "bottom-0",
          className,
        )}
      >
        <img
          key={src}
          ref={image.ref}
          src={src}
          alt=""
          aria-hidden="true"
          className={cn(
            "relative z-10 aspect-square object-contain transition-opacity duration-v2-fast",
            image.loaded ? "opacity-100" : "opacity-0",
            scale === "72%" ? "w-[72%]" : "w-[80%]",
          )}
          loading="lazy"
          onLoad={image.onLoad}
          onError={image.onError}
        />
      </span>
    </>
  );
}
