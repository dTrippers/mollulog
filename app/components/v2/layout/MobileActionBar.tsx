import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import type { ElementType } from "react";
import { cn } from "~/lib/utils";
import { isExternalHref, LinkTarget } from "./LinkTarget";
import type { V2TransitionKind } from "./screen-transition";
import { v2FocusRing } from "./styles";
import { useV2Page } from "./V2Page";

export type MobileActionLink = {
  key: string;
  title: string;
  shortTitle?: string;
  Icon: ElementType;
  to?: string;
  onClick?: () => void;
  preventScrollReset?: boolean;
  transition?: V2TransitionKind;
};

// A panel entry opens the PanelSheet with the same panelId. That PanelSheet must render in this page's PageAside.
export type MobileActionPanel = {
  panelId: string;
  title: string;
  shortTitle?: string;
  Icon: ElementType;
  disabled?: boolean;
};

export type MobileActionBarProps = {
  links?: MobileActionLink[];
  panels?: MobileActionPanel[];
};

const itemClassName = cn(
  "flex min-h-12 min-w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md px-3 py-1.5 text-xs font-medium text-v2-fg-secondary hover:bg-v2-hover disabled:cursor-not-allowed disabled:text-v2-fg-disabled",
  v2FocusRing,
);

// Fixed bottom action bar for stacked layouts. Hidden on side-by-side by the container query in tailwind.css.
export function MobileActionBar({ links = [], panels = [] }: MobileActionBarProps) {
  const { sheetPanelId, openSheet } = useV2Page();
  if (links.length === 0 && panels.length === 0) {
    return null;
  }

  return (
    <div className="v2-action-bar fixed right-4 bottom-[var(--mobile-bottom-offset)] z-30 flex rounded-lg bg-v2-elevated p-1 shadow-lg">
      {links.map((link) => {
        const { Icon } = link;
        const external = link.to !== undefined && isExternalHref(link.to);
        return (
          <LinkTarget
            key={link.key}
            to={link.to}
            onClick={link.onClick}
            preventScrollReset={link.preventScrollReset}
            transition={link.transition}
            className={itemClassName}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="inline-flex items-center gap-0.5">
              <span>{link.shortTitle ?? link.title}</span>
              {external ? <span className="sr-only">{" (새 창)"}</span> : null}
              {external ? <ArrowTopRightOnSquareIcon className="size-3 shrink-0" aria-hidden="true" /> : null}
            </span>
          </LinkTarget>
        );
      })}
      {panels.map((panel) => {
        const { Icon } = panel;
        return (
          <button
            key={panel.panelId}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={!panel.disabled && sheetPanelId === panel.panelId}
            disabled={panel.disabled}
            onClick={() => openSheet(panel.panelId)}
            className={itemClassName}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span>{panel.shortTitle ?? panel.title}</span>
          </button>
        );
      })}
    </div>
  );
}
