import { useState } from "react";
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";

type CopyButtonProps = {
  text: string;
};

export default function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Icon = copied ? ClipboardDocumentCheckIcon : ClipboardDocumentIcon;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded transition-colors text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
      title="쿠폰 번호 복사"
    >
      <Icon className={`size-4 ${copied ? "text-green-500" : ""}`} strokeWidth={2} />
    </button>
  );
}
