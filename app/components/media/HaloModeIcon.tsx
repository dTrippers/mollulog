type HaloModeIconProps = {
  solid?: boolean;
  // The outline's line width, as heroicons' `strokeWidth`.
  strokeWidth?: number;
  className?: string;
};

export function HaloModeIcon({ solid = false, strokeWidth = 1.5, className }: HaloModeIconProps) {
  return solid ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <g transform="rotate(-12 12 12)">
        <path
          fillRule="evenodd"
          d="M3 12a9 5.25 0 1 0 18 0a9 5.25 0 1 0-18 0Zm3 0a6 2.75 0 1 0 12 0a6 2.75 0 1 0-12 0Z"
        />
        <path d="M.75 12 4 10.6v2.8ZM23.25 12 20 10.6v2.8ZM12 3.25l1.4 4h-2.8ZM12 20.75l-1.4-4h2.8Z" />
      </g>
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <g transform="rotate(-12 12 12)">
        <ellipse cx="12" cy="12" rx="8" ry="4.25" />
        <path d="M1.75 12H4M20 12h2.25M12 7.75V4.5M12 16.25v3.25" />
      </g>
    </svg>
  );
}
