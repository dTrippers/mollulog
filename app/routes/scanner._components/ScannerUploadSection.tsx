import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { Checkbox } from "~/components/v2/primitives/Checkbox";
import { cn } from "~/lib/utils";

type ScannerUploadSectionProps = {
  inputId: string;
  // The accessible name of the file input. The stacked layout has no visible label for it.
  inputLabel: string;
  accept: string;
  multiple?: boolean;
  selectionDisabled: boolean;
  onFiles: (files: File[]) => void;
  targetGuide?: ReactNode;
  // The in-game screen to capture, such as "[메뉴] > [아이템]". Each scanner passes its own.
  targetPath: string;
  // The mobile select button label; the student scanner also takes videos.
  selectLabel?: string;
  helpText: string;
  descriptionLines?: ReadonlyArray<string>;
  children?: ReactNode;
  consentChecked: boolean;
  consentDisabled: boolean;
  onConsentChange: (checked: boolean) => void;
  actionDisabled: boolean;
  actionLabel: string;
  onAction: () => void;
  // Stacked layouts (from V2Page) show a select button and a folded guide. Desktop shows the drop zone.
  stacked: boolean;
  // On stacked layouts, the primary action moves to the fixed bottom bar once files are selected.
  hasFiles: boolean;
};

// The upload panel. Desktop shows the drop zone with the in-game guide. Stacked layouts show a select button and a folded guide.
export default function ScannerUploadSection({
  inputId,
  inputLabel,
  accept,
  multiple = false,
  selectionDisabled,
  onFiles,
  targetGuide,
  targetPath,
  selectLabel = "스크린샷 선택",
  helpText,
  descriptionLines = [],
  children,
  consentChecked,
  consentDisabled,
  onConsentChange,
  actionDisabled,
  actionLabel,
  onAction,
  stacked,
  hasFiles,
}: ScannerUploadSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = `${inputId}-help`;
  const consentId = `${inputId}-consent`;
  const showsInPanelAction = !(stacked && hasFiles);

  useEffect(() => registerScannerPasteListener(document, onFiles, selectionDisabled), [onFiles, selectionDisabled]);

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (selectionDisabled || !event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (selectionDisabled) return;
    onFiles(Array.from(event.dataTransfer.files));
  }

  const guideLines = descriptionLines.map((line) => (
    <span key={line} className="text-xs text-v2-fg-tertiary">
      {line}
    </span>
  ));

  return (
    <section className="flex flex-col gap-v2-block-gap rounded-lg bg-v2-surface p-v2-block-p">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        aria-label={inputLabel}
        accept={accept}
        multiple={multiple}
        disabled={selectionDisabled}
        aria-describedby={helpId}
        className="sr-only"
        onChange={(event) => {
          onFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      {stacked ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full"
            disabled={selectionDisabled}
            onClick={() => inputRef.current?.click()}
          >
            <PhotoIcon className="size-5" aria-hidden="true" />
            {selectLabel}
          </Button>
          <details className="group text-sm text-v2-fg-secondary">
            <summary
              className={cn("flex min-h-v2-row-min cursor-pointer list-none items-center rounded-md", v2FocusRing)}
            >
              <span className="min-w-0 flex-1">어떤 화면을 올리나요? · 게임 내 {targetPath}</span>
              <ChevronDownIcon className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="flex flex-col gap-2 pt-2">
              {targetGuide}
              <span id={helpId} className="text-xs text-v2-fg-tertiary">
                {helpText}
              </span>
              {guideLines}
            </div>
          </details>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragEnter={handleDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex min-h-44 cursor-pointer items-center gap-v2-block-gap rounded-lg border border-dashed border-v2-control-border px-v2-block-p py-v2-block-p",
            isDragging && "bg-v2-highlight",
            selectionDisabled && "cursor-not-allowed text-v2-fg-disabled",
            v2FocusRing,
          )}
        >
          {targetGuide}
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-medium text-v2-fg">게임 내 {targetPath} 화면을 찍어 주세요</span>
            <span id={helpId} className="text-sm text-v2-fg-secondary">
              {helpText}
            </span>
            {guideLines}
          </span>
        </label>
      )}

      {children}

      <div className="flex flex-col gap-v2-block-gap pt-1">
        <Checkbox id={consentId} checked={consentChecked} disabled={consentDisabled} onCheckedChange={onConsentChange}>
          업로드한 파일을 인식률 향상에 사용하는 것에 동의합니다. (
          <strong className="font-semibold">동의하지 않아도 사용할 수 있어요</strong>.)
        </Checkbox>
        {showsInPanelAction ? (
          <div className="flex justify-end">
            <Button
              variant="primary"
              className="w-full sm:w-fit disabled:bg-v2-inset"
              disabled={actionDisabled}
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

type ScannerPasteEvent = Pick<ClipboardEvent, "clipboardData" | "target" | "preventDefault">;
type PasteEventTarget = Pick<Document, "addEventListener" | "removeEventListener">;

export function handleScannerPaste(
  event: ScannerPasteEvent,
  onFiles: (files: File[]) => void,
  selectionDisabled: boolean,
): void {
  if (isClipboardTextTarget(event.target) || selectionDisabled) return;
  if (!event.clipboardData) return;
  const clipboardFiles = getClipboardFiles(event.clipboardData);
  if (clipboardFiles.length === 0) return;
  event.preventDefault();
  onFiles(clipboardFiles);
}

export function registerScannerPasteListener(
  target: PasteEventTarget,
  onFiles: (files: File[]) => void,
  selectionDisabled: boolean,
): () => void {
  const listener = (event: Event) => {
    handleScannerPaste(event as ClipboardEvent, onFiles, selectionDisabled);
  };
  target.addEventListener("paste", listener);
  return () => target.removeEventListener("paste", listener);
}

export function getClipboardFiles(data: DataTransfer): File[] {
  const files = Array.from(data.files);
  if (files.length > 0) return files;
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .flatMap((item) => {
      const blob = item.getAsFile();
      if (!blob) return [];
      return [
        new File([blob], clipboardFileName(blob.type), {
          type: blob.type,
          lastModified: Date.now(),
        }),
      ];
    });
}

export function isClipboardTextTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  if (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement) return true;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement && target.isContentEditable) return true;
  const candidate = target as { contentEditable?: unknown; isContentEditable?: unknown; tagName?: unknown };
  return (
    candidate.isContentEditable === true ||
    candidate.contentEditable === true ||
    candidate.contentEditable === "true" ||
    (typeof candidate.tagName === "string" && ["INPUT", "TEXTAREA"].includes(candidate.tagName.toUpperCase()))
  );
}

function clipboardFileName(contentType: string): string {
  let extension = "bin";
  if (contentType === "image/png") {
    extension = "png";
  } else if (contentType === "image/webp") {
    extension = "webp";
  } else if (contentType === "image/jpeg") {
    extension = "jpg";
  } else if (contentType === "video/quicktime") {
    extension = "mov";
  } else if (contentType === "video/mp4") {
    extension = "mp4";
  }
  return `clipboard-${Date.now()}.${extension}`;
}
