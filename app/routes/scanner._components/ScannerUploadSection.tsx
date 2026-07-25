import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { Button, Checkbox, SubTitle } from "~/components/primitives";
import { cn } from "~/lib/utils";
import { type ScannerUploadQuota, UploadQuotaMeter } from "./UploadQuotaMeter";

type ScannerUploadSectionProps = {
  title: string;
  description: string;
  quota: ScannerUploadQuota | null;
  quotaUnit: string;
  quotaSubject: string;
  inputId: string;
  accept: string;
  multiple?: boolean;
  selectionDisabled: boolean;
  onFiles: (files: File[]) => void;
  icon: ReactNode;
  dropLabel: ReactNode;
  helpText: ReactNode;
  dropDetail?: ReactNode;
  children?: ReactNode;
  consentChecked: boolean;
  consentDisabled: boolean;
  onConsentChange: (checked: boolean) => void;
  consentDataLabel: string;
  actionDisabled: boolean;
  actionLabel: string;
  onAction: () => void;
};

export default function ScannerUploadSection({
  title,
  description,
  quota,
  quotaUnit,
  quotaSubject,
  inputId,
  accept,
  multiple = false,
  selectionDisabled,
  onFiles,
  icon,
  dropLabel,
  helpText,
  dropDetail,
  children,
  consentChecked,
  consentDisabled,
  onConsentChange,
  consentDataLabel,
  actionDisabled,
  actionLabel,
  onAction,
}: ScannerUploadSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const helpId = `${inputId}-help`;

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
        {quota ? (
          <div className="shrink-0 pb-3">
            <UploadQuotaMeter quota={quota} unit={quotaUnit} subject={quotaSubject} />
          </div>
        ) : null}
      </div>
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
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              {icon}
            </span>
            <span className="mt-3 font-medium text-foreground">{dropLabel}</span>
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
                {consentDataLabel}를 인식률 향상에 사용하는 것에 동의합니다. (
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
