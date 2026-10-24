import { decode } from "blurhash";
import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";

const BLURHASH_WIDTH = 32;
const BLURHASH_HEIGHT = 16;

export default function BlurhashPlaceholder({
  blurhash,
  className,
}: {
  blurhash?: string | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasRenderedHash = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!blurhash) {
      if (hasRenderedHash.current) {
        canvas.getContext("2d")?.clearRect(0, 0, BLURHASH_WIDTH, BLURHASH_HEIGHT);
      }
      hasRenderedHash.current = false;
      return;
    }

    try {
      const pixels = decode(blurhash, BLURHASH_WIDTH, BLURHASH_HEIGHT);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, BLURHASH_WIDTH, BLURHASH_HEIGHT);
      const imageData = context.createImageData(BLURHASH_WIDTH, BLURHASH_HEIGHT);
      imageData.data.set(pixels);
      context.putImageData(imageData, 0, 0);
      hasRenderedHash.current = true;
    } catch (error) {
      if (hasRenderedHash.current) {
        canvas.getContext("2d")?.clearRect(0, 0, BLURHASH_WIDTH, BLURHASH_HEIGHT);
      }
      hasRenderedHash.current = false;
      console.warn("Could not decode timeline image blurhash", error);
    }
  }, [blurhash]);

  return (
    <div aria-hidden="true" className={cn("absolute inset-0 bg-v2-inset", className)}>
      <canvas ref={canvasRef} width={BLURHASH_WIDTH} height={BLURHASH_HEIGHT} className="size-full object-cover" />
    </div>
  );
}
