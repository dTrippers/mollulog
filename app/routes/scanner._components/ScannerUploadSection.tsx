import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button, Checkbox, SubTitle } from "~/components/primitives";
import { cn } from "~/lib/utils";

type ScannerUploadSectionProps = {
  title: string;
  description: string;
  descriptionLines?: ReadonlyArray<string>;
  inputId: string;
  accept: string;
  multiple?: boolean;
  selectionDisabled: boolean;
  onFiles: (files: File[]) => void;
  icon: ReactNode;
  targetGuide?: ReactNode;
  helpText: string;
  dropDetail?: ReactNode;
  children?: ReactNode;
  consentChecked: boolean;
  consentDisabled: boolean;
  onConsentChange: (checked: boolean) => void;
  actionDisabled: boolean;
  actionLabel: string;
  onAction: () => void;
};

export default function ScannerUploadSection({
  title,
  description,
  descriptionLines,
  inputId,
  accept,
  multiple = false,
  selectionDisabled,
  onFiles,
  icon,
  targetGuide,
  helpText,
  dropDetail,
  children,
  consentChecked,
  consentDisabled,
  onConsentChange,
  actionDisabled,
  actionLabel,
  onAction,
}: ScannerUploadSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const helpId = `${inputId}-help`;

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

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <SubTitle text={title} description={description} />
      </div>
      {descriptionLines ? (
        <div className="-mt-2 mb-4 space-y-1 text-sm text-muted-foreground">
          {descriptionLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
      <div className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
        <div className="focus-within:rounded-lg focus-within:ring-2 focus-within:ring-ring/30">
          <input
            id={inputId}
            type="file"
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
          <label
            htmlFor={inputId}
            onDragEnter={handleDragEnter}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40",
              selectionDisabled && "cursor-not-allowed opacity-60",
            )}
          >
            {targetGuide}
            {targetGuide ? null : (
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                {icon}
              </span>
            )}
            <span className={cn(targetGuide ? "mt-4" : "mt-3", "font-medium text-foreground")}>
              파일을 선택하거나 이 곳에 끌어다 놓아주세요
            </span>
            <span id={helpId} className="mt-1 text-sm text-muted-foreground">
              {helpText}
            </span>
            {dropDetail}
          </label>
        </div>

        {children}

        <div className="space-y-4 pt-4">
          <Checkbox
            checked={consentChecked}
            disabled={consentDisabled}
            onChange={onConsentChange}
            className="w-full items-start"
            label={
              <span>
                업로드한 파일을 인식률 향상에 사용하는 것에 동의합니다. (
                <strong className="font-semibold">동의하지 않아도 사용할 수 있어요</strong>.)
              </span>
            }
          />
          <div className="flex justify-end">
            <Button variant="primary" className="w-full sm:w-fit" disabled={actionDisabled} onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        </div>
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
