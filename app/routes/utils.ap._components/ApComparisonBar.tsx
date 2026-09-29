export default function ApComparisonBar({ requiredAp, availableAp }: { requiredAp: number; availableAp: number }) {
  const scale = Math.max(requiredAp, availableAp, 1);
  const neutralEnd = (Math.min(requiredAp, availableAp) / scale) * 100;
  const differenceStart = neutralEnd;
  const differenceWidth = (Math.abs(requiredAp - availableAp) / scale) * 100;
  const surplus = availableAp > requiredAp;
  const markerPosition = Math.min(100, Math.max(0, (requiredAp / scale) * 100));

  return (
    <div aria-hidden="true" className="relative h-2 w-full overflow-visible rounded-full bg-muted">
      <div
        className="absolute inset-y-0 left-0 rounded-l-full bg-muted-foreground/70"
        style={{ width: `${neutralEnd}%` }}
      />
      {differenceWidth > 0 ? (
        <div
          className={`absolute inset-y-0 ${surplus ? "rounded-r-full bg-green-600 dark:bg-green-400" : "bg-red-600 dark:bg-red-400"}`}
          style={{ left: `${differenceStart}%`, width: `${differenceWidth}%` }}
        />
      ) : null}
      <span
        className="absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
        style={{ left: `${markerPosition}%` }}
      />
    </div>
  );
}
