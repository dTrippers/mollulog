export function DirectoryGroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-v2-fg">{title}</h2>
      <span className="text-xs tabular-nums text-v2-fg-tertiary">{count}명</span>
    </div>
  );
}
