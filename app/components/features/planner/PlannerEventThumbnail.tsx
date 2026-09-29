import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  imageUrl?: string | null;
  fallbackImageUrl?: string | null;
  recoverPreloadedFailure?: boolean;
  showSurfaceUntilLoaded?: boolean;
  className?: string;
};

export default function PlannerEventThumbnail({
  imageUrl,
  fallbackImageUrl,
  recoverPreloadedFailure = false,
  showSurfaceUntilLoaded = false,
  className,
}: Props) {
  const imageKey = JSON.stringify([imageUrl, fallbackImageUrl]);
  const [loadedImageKey, setLoadedImageKey] = useState<string | null>(null);
  const imageLoaded = loadedImageKey === imageKey;
  const onImageLoaded = useCallback(() => setLoadedImageKey(imageKey), [imageKey]);

  return (
    <div
      className={["relative size-10", className, "shrink-0 overflow-hidden rounded-md"].filter(Boolean).join(" ")}
    >
      {!showSurfaceUntilLoaded || !imageLoaded ? (
        <div aria-hidden="true" className="absolute inset-0 rounded-md bg-muted ring-1 ring-border" />
      ) : null}
      {imageUrl ? (
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
