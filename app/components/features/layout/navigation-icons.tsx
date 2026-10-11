import type { ComponentProps, ReactNode } from "react";

type IconProps = ComponentProps<"svg">;

function NavigationIcon({
  drawing,
  selectedFill,
  selected = false,
  strokeWidth,
  ...props
}: IconProps & {
  drawing: ReactNode;
  selectedFill: ReactNode;
  selected?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {selected ? (
        <g fill="currentColor" opacity={0.12}>
          {selectedFill}
        </g>
      ) : null}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth ?? (selected ? 1.9 : 1.65)}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {drawing}
      </g>
    </svg>
  );
}

function createNavigationIcon(drawing: ReactNode, selectedFill: ReactNode) {
  function OutlineIcon(props: IconProps) {
    return <NavigationIcon {...props} drawing={drawing} selectedFill={selectedFill} />;
  }
  function SolidIcon(props: IconProps) {
    return <NavigationIcon {...props} drawing={drawing} selectedFill={selectedFill} selected />;
  }
  return { OutlineIcon, SolidIcon };
}

// Menu identity only; page content and general UI controls keep their own icons.
export const NAVIGATION_ICONS = {
  students: createNavigationIcon(
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="1.5" />
      <circle cx="12" cy="9" r="2.25" />
      <path d="M7.5 17a4.5 4.5 0 0 1 9 0Z" />
    </>,
    <rect x="4.5" y="3" width="15" height="18" rx="1.5" />,
  ),
  "pickup-history": createNavigationIcon(
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="1.5" />
      <path d="m3.75 6.25 7.3 6.1a1.5 1.5 0 0 0 1.9 0l7.3-6.1" />
    </>,
    <rect x="3" y="5.5" width="18" height="13" rx="1.5" />,
  ),
  "pyroxene-planner": createNavigationIcon(
    <>
      <path d="m12 2 7.5 5.25v9.5L12 22l-7.5-5.25v-9.5Z" />
      <g strokeWidth="1.1">
        <path d="M4.5 7.25h15M4.5 16.75h15M12 2l-3.75 5.25 7.5 9.5L12 22M12 2l3.75 5.25-7.5 9.5L12 22" />
      </g>
      <g stroke="none" fill="currentColor" fillOpacity=".13">
        <path d="m12 2 3.75 5.25h-7.5ZM8.25 7.25l7.5 9.5h-7.5ZM15.75 16.75 12 22l7.5-5.25Z" />
      </g>
    </>,
    <path d="m12 2 7.5 5.25v9.5L12 22l-7.5-5.25v-9.5Z" />,
  ),
  "ap-planner": createNavigationIcon(
    <path d="m13.5 2.5-9 12h6l-1 7 10-13h-6Z" />,
    <path d="m13.5 2.5-9 12h6l-1 7 10-13h-6Z" />,
  ),
  "event-shop-calculator": createNavigationIcon(
    <>
      <path d="M5 3.5h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
      <path d="M4.5 12v8.5h15V12" />
    </>,
    <path d="M5 3.5h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />,
  ),
  "furniture-catalog": createNavigationIcon(
    <>
      <path d="M6 11V6.5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V11" />
      <path d="M3 11h3v4h12v-4h3v7H3ZM5 18v3M19 18v3" />
    </>,
    <path d="M6 11V6.5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3V15H6Z" />,
  ),
  futures: createNavigationIcon(
    <path d="M11 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v4M3 10h17M7 2.5V7M16 2.5V7M13 17h9m-3.5-3.5L22 17l-3.5 3.5" />,
    <path d="M11 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v4H11Z" />,
  ),
  "integrated-planner": createNavigationIcon(
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="1.5" />
      <path d="M3.5 10h17M7.5 2.5V7M16.5 2.5V7" />
    </>,
    <rect x="3.5" y="5" width="17" height="16" rx="1.5" />,
  ),
  "student-growth-planner": createNavigationIcon(
    <path d="M13 21H4V3h12v7M7 7h6M7 11h4M7 15h3M18 21V12m-3 3 3-3 3 3" />,
    <path d="M13 21H4V3h12v7h-3Z" />,
  ),
  "resource-planner": createNavigationIcon(
    <>
      <path d="M4.5 9v11.5h15V9" />
      <rect x="3" y="4" width="18" height="5" rx=".75" />
    </>,
    <path d="M4.5 9v11.5h15V9Z" />,
  ),
  "relationship-calculator": createNavigationIcon(
    <path d="m12 20-7.4-7.4a5.1 5.1 0 0 1 7.2-7.2l.2.2.2-.2a5.1 5.1 0 0 1 7.2 7.2Z" />,
    <path d="m12 20-7.4-7.4a5.1 5.1 0 0 1 7.2-7.2l.2.2.2-.2a5.1 5.1 0 0 1 7.2 7.2Z" />,
  ),
  "raid-score-calculator": createNavigationIcon(
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M9 2.5h6M12 2.5v3M12 9v4l3 2" />
    </>,
    <circle cx="12" cy="13" r="7.5" />,
  ),
} as const;
