import { ArrowRightIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import type { ElementType } from "react";
import { cn } from "~/lib/utils";
import { isExternalHref, LinkTarget } from "./LinkTarget";
import type { V2TransitionKind } from "./screen-transition";
import { v2FocusRing } from "./styles";

export type AsideLinkItem = {
  key: string;
  title: string;
  description?: string;
  badge?: string;
  disabledReason?: string;
  Icon: ElementType;
  to?: string;
  linkState?: unknown;
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
        const disabled = item.disabledReason !== undefined;
        const description = item.disabledReason ?? item.description;
        const content = (
          <>
            <Icon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm font-medium", disabled && "text-v2-fg-secondary")}>{item.title}</span>
              {description ? (
                <span className="line-clamp-2 text-xs text-v2-fg-tertiary">{description}</span>
              ) : null}
            </span>
            {item.badge ? <span className="text-xs text-v2-fg-tertiary">{item.badge}</span> : null}
            {!disabled ? (
              external ? (
                <>
                  <ArrowTopRightOnSquareIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                  <span className="sr-only">새 창에서 열림</span>
                </>
              ) : (
                <ArrowRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
              )
            ) : null}
          </>
        );
        if (disabled) {
          return (
            <div
              key={item.key}
              aria-disabled="true"
              className="flex min-h-v2-row-min items-center gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y text-v2-fg-secondary"
            >
              {content}
            </div>
          );
        }
        return (
          <LinkTarget
            key={item.key}
            to={item.to}
            state={item.linkState}
            onClick={item.onClick}
            preventScrollReset={item.preventScrollReset}
            transition={item.transition}
            className={cn(
              "flex min-h-v2-row-min items-center gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y text-v2-fg hover:bg-v2-hover",
              v2FocusRing,
            )}
          >
            {content}
          </LinkTarget>
        );
      })}
    </div>
  );
}
