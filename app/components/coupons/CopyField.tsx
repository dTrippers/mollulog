import { useState } from "react";
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";

type CopyFieldProps = {
  text: string;
  label?: string;
  className?: string;
};

export default function CopyField({ text, label, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator?.clipboard?.writeText) {
      console.error("Clipboard API is not available in this environment.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy text to clipboard.", error);
    }
  };

  const Icon = copied ? ClipboardDocumentCheckIcon : ClipboardDocumentIcon;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`group flex w-full items-center gap-2 text-left ${className ?? ""}`}
      title="복사"
    >
      {label && <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{label}</span>}
      <code className="flex-1 text-sm font-mono text-neutral-800 dark:text-neutral-200 select-all break-all">
        {text}
      </code>
      <span className="text-xs text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100">
        복사
      </span>
      <Icon className={`size-4 shrink-0 ${copied ? "text-green-500" : "text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200"}`} strokeWidth={2} />
    </button>
  );
}
