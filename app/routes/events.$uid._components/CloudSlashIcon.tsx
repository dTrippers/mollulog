// The canvas draws a crossed-out cloud for a failed load; heroicons has no such icon.
export function CloudSlashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l14 14" />
      <path d="M6.5 7.2A3.8 3.8 0 0 0 5.5 14.5h8.2M15.6 13.6A3 3 0 0 0 14 8a4.6 4.6 0 0 0-5-3.3" />
    </svg>
  );
}
