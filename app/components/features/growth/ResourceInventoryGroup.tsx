type ResourceInventoryGroupProps = {
  title: string;
  controls?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export default function ResourceInventoryGroup({
  title,
  controls,
  className,
  children,
}: ResourceInventoryGroupProps) {
  return (
    <section className={className}>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border bg-muted/60 px-3 py-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {controls ? <div className="px-3 pt-2">{controls}</div> : null}
        <div className="flex flex-wrap gap-x-1 gap-y-0 px-3 py-2">{children}</div>
      </div>
    </section>
  );
}
