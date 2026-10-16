import { ArrowRightIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import type { ElementType } from "react";
import { cn } from "~/lib/utils";
import { isExternalHref, LinkTarget } from "./LinkTarget";
import type { V2TransitionKind } from "./screen-transition";
import { v2FocusRing } from "./styles";

export type AsideLinkItem = {
  key: string;
  title: string;
  description: string;
  Icon: ElementType;
  to?: string;
  onClick?: () => void;
  preventScrollReset?: boolean;
  transition?: V2TransitionKind;
};

// One block of links. Use one AsideLinks per group inside PageAside.
export function AsideLinks({ items }: { items: AsideLinkItem[] }) {
  return (
    <div className="flex flex-col gap-v2-list-gap rounded-lg bg-v2-surface p-2">
      {items.map((item) => {
        const { Icon } = item;
        const external = item.to !== undefined && isExternalHref(item.to);
        return (
          <LinkTarget
            key={item.key}
            to={item.to}
            onClick={item.onClick}
            preventScrollReset={item.preventScrollReset}
            transition={item.transition}
            className={cn(
              "flex min-h-v2-row-min items-center gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y text-v2-fg hover:bg-v2-hover",
              v2FocusRing,
            )}
          >
            <Icon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="block truncate text-xs text-v2-fg-tertiary">{item.description}</span>
            </span>
            {external ? (
              <>
                <ArrowTopRightOnSquareIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                <span className="sr-only">새 창에서 열림</span>
              </>
            ) : (
              <ArrowRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            )}
          </LinkTarget>
        );
      })}
    </div>
  );
}
