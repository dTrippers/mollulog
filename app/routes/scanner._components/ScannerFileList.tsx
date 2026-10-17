import { XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { Button } from "~/components/v2/primitives/Button";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { cn } from "~/lib/utils";
import { formatScannerBytes } from "./scanner-client";
import { scannerFileKey } from "./scanner-upload";

// The selected files: a count and size line with a clear action, then a preview grid. Each preview has a remove control.
export default function ScannerFileList({
  files,
  disabled,
  onRemove,
  onClear,
}: {
  files: ReadonlyArray<File>;
  disabled: boolean;
  onRemove: (index: number) => void;
  onClear: () => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-v2-group-gap">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-v2-fg-secondary tabular-nums" aria-live="polite">
          {files.length}장 · {formatScannerBytes(files.reduce((sum, file) => sum + file.size, 0))}
        </p>
        <Button variant="text" disabled={disabled} onClick={onClear}>
          선택 초기화
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-v2-block-gap sm:grid-cols-3 lg:grid-cols-6">
        {files.map((file, index) => (
          <li key={scannerFileKey(file)}>
            <ScannerFilePreview file={file} disabled={disabled} onRemove={() => onRemove(index)} />
          </li>
        ))}
      </ul>
    </div>
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
    <div className="flex min-w-0 flex-col gap-1">
      <div className="relative aspect-video overflow-hidden rounded-md bg-v2-inset">
        {previewUrl && isVideo ? (
          <video src={previewUrl} muted playsInline preload="metadata" className="size-full object-contain" />
        ) : previewUrl ? (
          <img src={previewUrl} alt={`${file.name} 미리보기`} className="size-full object-contain" />
        ) : null}
        <IconButton
          icon={XMarkIcon}
          label={`${file.name} 삭제`}
          disabled={disabled}
          onClick={onRemove}
          className={cn("absolute top-1 right-1 rounded-full bg-v2-scrim text-v2-on-media")}
        />
      </div>
      <p className="truncate text-xs text-v2-fg-tertiary" title={file.name}>
        {file.name}
      </p>
    </div>
  );
}
