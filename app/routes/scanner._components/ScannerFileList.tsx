import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { formatScannerBytes } from "./scanner-client";
import { scannerFileKey } from "./scanner-upload";

export default function ScannerFileList({
  files,
  disabled,
  onRemove,
}: {
  files: ReadonlyArray<File>;
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">선택한 파일</legend>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-medium text-foreground">선택한 파일</p>
        <p className="text-muted-foreground" aria-live="polite">
          {files.length}개 · {formatScannerBytes(files.reduce((sum, file) => sum + file.size, 0))}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((file, index) => (
          <ScannerFilePreview
            key={scannerFileKey(file)}
            file={file}
            disabled={disabled}
            onRemove={() => onRemove(index)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ScannerFilePreview({ file, disabled, onRemove }: { file: File; disabled: boolean; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isVideo = file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="aspect-video bg-muted">
        {previewUrl && isVideo ? (
          <video src={previewUrl} muted playsInline preload="metadata" className="size-full object-contain" />
        ) : previewUrl ? (
          <img src={previewUrl} alt={`${file.name} 미리보기`} className="size-full object-contain" />
        ) : null}
      </div>
      <div className="min-w-0 px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatScannerBytes(file.size)}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`${file.name} 삭제`}
        className={cn(
          "absolute right-2 top-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50",
        )}
      >
        <XMarkIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
