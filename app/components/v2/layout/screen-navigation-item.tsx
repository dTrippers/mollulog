import type { ElementType } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps, runV2StateTransition } from "./screen-transition";
import { v2FocusRing } from "./styles";

export type ScreenTabItem = {
  key: string;
  text: string;
  label?: string;
  Icon: ElementType;
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  // Link mode navigates with aria-current. Onclick mode is state only, with aria-pressed.
  link?: string;
  linkState?: unknown;
  onClick?: () => void;
  hiddenStacked?: boolean;
};

type ScreenNavigationItemRendererProps = {
  item: ScreenTabItem;
  orientation: "horizontal" | "vertical";
  responsiveNavigation?: boolean;
};

export function ScreenNavigationItemRenderer({
  item,
  orientation,
  responsiveNavigation = false,
}: ScreenNavigationItemRendererProps) {
  const { Icon } = item;
  const className =
    orientation === "horizontal"
      ? cn(
          "relative flex min-h-v2-row-min shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap hover:bg-v2-hover",
          item.active ? "v2-tab-active font-semibold text-v2-fg" : "font-medium text-v2-fg-secondary",
          item.hiddenStacked && "v2-hidden-stacked",
          item.disabled && "cursor-not-allowed text-v2-fg-disabled hover:bg-transparent",
          v2FocusRing,
        )
      : cn(
          "relative flex min-h-v2-row-min items-center gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y text-sm transition-colors duration-v2-fast",
          item.active ? "bg-v2-inset font-semibold text-v2-fg" : "font-medium text-v2-fg-secondary",
          item.hiddenStacked && "v2-hidden-stacked",
          item.disabled
            ? "cursor-not-allowed text-v2-fg-disabled"
            : item.active
              ? "cursor-pointer hover:bg-v2-inset hover:text-v2-fg"
              : "cursor-pointer hover:bg-v2-hover hover:text-v2-fg",
          v2FocusRing,
        );
  const content = (
    <>
      <Icon className={cn("size-4 shrink-0", item.active ? "text-v2-fg" : "text-v2-fg-tertiary")} aria-hidden="true" />
      <span className={orientation === "vertical" ? "min-w-0 flex-1 truncate" : undefined}>{item.text}</span>
      {item.label ? <span className="text-xs tabular-nums text-v2-fg-tertiary">{item.label}</span> : null}
      {item.disabled && item.disabledReason ? <span className="sr-only">{item.disabledReason}</span> : null}
    </>
  );

  if (item.disabled) {
    return (
      <button
        type="button"
        disabled
        title={item.disabledReason}
        className={className}
        data-v2-screen-navigation-item={responsiveNavigation ? item.key : undefined}
      >
        {content}
      </button>
    );
  }

  if (item.link) {
    return (
      <Link
        to={item.link}
        state={item.linkState}
        aria-current={item.active ? "page" : undefined}
        data-active={item.active ? "true" : undefined}
        className={className}
        data-v2-screen-navigation-item={responsiveNavigation ? item.key : undefined}
        {...getV2LinkTransitionProps("crossfade")}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={item.active ?? false}
      data-active={item.active ? "true" : undefined}
      disabled={!item.onClick}
      onClick={() => {
        if (item.onClick) {
          runV2StateTransition("crossfade", item.onClick);
        }
      }}
      className={className}
      data-v2-screen-navigation-item={responsiveNavigation ? item.key : undefined}
    >
      {content}
    </button>
  );
}
