import { useCallback, useEffect, useRef, useState } from "react";
import BlurhashPlaceholder from "~/components/primitives/BlurhashPlaceholder";
import HaloModeNotice from "~/components/primitives/HaloModeNotice";
import { useHaloMode } from "~/contexts/HaloModeContext";

type Props = {
  imageUrl?: string | null;
  imageBlurhash?: string | null;
  imageIsTimeline?: boolean;
  fallbackImageUrl?: string | null;
  recoverPreloadedFailure?: boolean;
  showSurfaceUntilLoaded?: boolean;
  className?: string;
};

export default function PlannerEventThumbnail({
  imageUrl,
  imageBlurhash,
  imageIsTimeline = false,
  fallbackImageUrl,
  recoverPreloadedFailure = false,
  showSurfaceUntilLoaded = false,
  className,
}: Props) {
  const { haloMode } = useHaloMode();
  const imageKey = JSON.stringify([imageUrl, fallbackImageUrl]);
  const [loadedImageKey, setLoadedImageKey] = useState<string | null>(null);
  const imageLoaded = loadedImageKey === imageKey;
  const onImageLoaded = useCallback(() => setLoadedImageKey(imageKey), [imageKey]);

  return (
    <div
      className={["relative size-10", className, "@container shrink-0 overflow-hidden rounded-md"].filter(Boolean).join(" ")}
    >
      {!showSurfaceUntilLoaded || !imageLoaded ? (
        <div aria-hidden="true" className="absolute inset-0 rounded-md bg-muted ring-1 ring-border" />
      ) : null}
      {haloMode && imageIsTimeline && imageUrl ? (
        <>
          <BlurhashPlaceholder blurhash={imageBlurhash} />
          <HaloModeNotice className="p-0" />
        </>
      ) : imageUrl ? (
        <PlannerEventThumbnailImage
          key={imageKey}
          imageUrl={imageUrl}
          fallbackImageUrl={fallbackImageUrl}
          recoverPreloadedFailure={recoverPreloadedFailure}
          onImageLoaded={onImageLoaded}
        />
      ) : null}
    </div>
  );
}

function PlannerEventThumbnailImage({
  imageUrl,
  fallbackImageUrl,
  recoverPreloadedFailure,
  onImageLoaded,
}: {
  imageUrl: string;
  fallbackImageUrl?: string | null;
  recoverPreloadedFailure: boolean;
  onImageLoaded: () => void;
}) {
  const [imageStage, setImageStage] = useState<"primary" | "fallback" | "failed">("primary");
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const currentImageUrl = imageStage === "primary" ? imageUrl : imageStage === "fallback" ? fallbackImageUrl : null;
  const handleFailure = () => {
    setImageStage((currentStage) => (currentStage === "primary" && fallbackImageUrl ? "fallback" : "failed"));
  };
  const handleLoad = () => {
    onImageLoaded();
    if (recoverPreloadedFailure && currentImageUrl) setLoadedImageUrl(currentImageUrl);
  };

  useEffect(() => {
    if (!recoverPreloadedFailure) return;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0 && currentImageUrl) {
      setLoadedImageUrl(currentImageUrl);
      onImageLoaded();
    } else if (image?.complete && image.naturalWidth === 0) {
      setImageStage((currentStage) => (currentStage === "primary" && fallbackImageUrl ? "fallback" : "failed"));
    }
  }, [currentImageUrl, fallbackImageUrl, onImageLoaded, recoverPreloadedFailure]);

  if (!currentImageUrl) return null;

  return (
    <img
      key={currentImageUrl}
      src={currentImageUrl}
      alt=""
      ref={imageRef}
      className={
        recoverPreloadedFailure && loadedImageUrl !== currentImageUrl
          ? "relative size-full object-cover opacity-0"
          : "relative size-full object-cover"
      }
      loading="lazy"
      onLoad={handleLoad}
      onError={handleFailure}
    />
  );
}
