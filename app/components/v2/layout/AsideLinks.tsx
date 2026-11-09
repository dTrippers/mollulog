import { ArrowTopRightOnSquareIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import type { ElementType } from "react";
import { withObjectParticle } from "~/lib/korean";
import { cn } from "~/lib/utils";
import { HintChip } from "../primitives/HintChip";
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

// One block of links. Use one AsideLinks per group inside PageAside. Rows sit on the page without a container; each icon
// sits in a small tile. A disabled row is dimmed and explains itself behind an ⓘ button.
export function AsideLinks({ items }: { items: AsideLinkItem[] }) {
  return (
    <div className="flex flex-col gap-v2-list-gap">
      {items.map((item) => {
        const { Icon } = item;
        const external = item.to !== undefined && isExternalHref(item.to);
        const disabled = item.disabledReason !== undefined;
        const content = (
          <>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-v2-inset">
              <Icon
                className={cn("size-4", disabled ? "text-v2-fg-disabled" : "text-v2-fg-secondary")}
                aria-hidden="true"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm font-medium", disabled && "text-v2-fg-disabled")}>{item.title}</span>
              {item.description && !disabled ? (
                <span className="line-clamp-2 text-xs text-v2-fg-tertiary">{item.description}</span>
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
                <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
              )
            ) : null}
          </>
        );
        if (disabled) {
          return (
            <div
              key={item.key}
              aria-disabled="true"
              className="flex min-h-v2-row-min items-center gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y"
            >
              {content}
              <HintChip
                variant="info"
                label={`${withObjectParticle(item.title)} 쓸 수 없어요`}
                description={item.disabledReason ?? ""}
              />
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
              // An onClick row renders as a button, which centers its text by default.
              "flex min-h-v2-row-min items-center gap-v2-media-gap rounded-md px-v2-row-x py-v2-row-y text-left text-v2-fg hover:bg-v2-hover",
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
