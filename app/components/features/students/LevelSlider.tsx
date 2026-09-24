type LevelSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  valuePrefix?: string;
  valueLabel?: string;
  showHeader?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export default function LevelSlider({
  label,
  value,
  min,
  max,
  valuePrefix,
  valueLabel,
  showHeader = true,
  disabled,
  onChange,
}: LevelSliderProps) {
  const sliderMax = Math.max(min, max);
  const clampedValue = Math.min(Math.max(value, min), sliderMax);
  const progress = sliderMax === min ? 0 : ((clampedValue - min) / (sliderMax - min)) * 100;
  const displayedValue = valueLabel ?? `${valuePrefix ?? ""}${value}`;

  return (
    <label className={disabled ? "block min-w-0 opacity-45" : "block min-w-0"}>
      {showHeader ? (
        <span className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium">{label}</span>
          <strong className="shrink-0 tabular-nums text-foreground">{displayedValue}</strong>
        </span>
      ) : null}
      <span className={`relative mx-1.5 block h-4 ${showHeader ? "mt-1.5" : "mt-0.5"}`}>
        <input
          type="range"
          aria-label={`${label} ${displayedValue}`}
          className="peer absolute -inset-x-1.5 top-0 z-10 h-4 w-[calc(100%+0.75rem)] cursor-pointer opacity-0 disabled:cursor-default"
          min={min}
          max={sliderMax}
          value={clampedValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" aria-hidden="true" />
        <span
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-sm transition-[left] peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-2"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />
      </span>
    </label>
  );
}
