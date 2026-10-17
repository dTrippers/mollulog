import { ArrowLeftIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps, runV2BackNavigation } from "./screen-transition";
import { v2FocusRing } from "./styles";

// `onClick` runs a router navigation such as `navigate(-1)`. It must not start a view transition itself.
export type PageHeaderBack = { title: string } & ({ to: string } | { onClick: () => void | Promise<void> });

export type PageHeaderProps = {
  title: ReactNode;
  description?: string;
  back?: PageHeaderBack;
  meta?: ReactNode;
  // Optional block beside the title on wide page-available widths, under the description otherwise.
  trailing?: ReactNode;
};

const backClassName = cn(
  "mb-2 inline-flex min-h-v2-row-min cursor-pointer items-center gap-1 rounded-md text-sm text-v2-fg-secondary hover:text-v2-fg",
  v2FocusRing,
);

function HeaderText({ title, description, back, meta }: Omit<PageHeaderProps, "trailing">) {
  return (
    <>
      {back ? (
        "to" in back ? (
          <Link to={back.to} className={backClassName} {...getV2LinkTransitionProps("reverse")}>
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            <span>{back.title}</span>
          </Link>
        ) : (
          <button type="button" className={backClassName} onClick={() => runV2BackNavigation(back.onClick)}>
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            <span>{back.title}</span>
          </button>
        )
      ) : null}
      <h1 className="text-xl font-bold text-v2-fg md:text-2xl">{title}</h1>
      {description ? <p className="mt-2 max-w-prose text-sm text-v2-fg-secondary">{description}</p> : null}
      {meta ? <div className="mt-2 text-sm text-v2-fg-tertiary">{meta}</div> : null}
    </>
  );
}

export function PageHeader({ title, description, back, meta, trailing }: PageHeaderProps) {
  if (!trailing) {
    return (
      <div className="v2-header min-w-0 pb-v2-group-gap">
        <HeaderText title={title} description={description} back={back} meta={meta} />
      </div>
    );
  }
  return (
    <div className="v2-header flex min-w-0 flex-col gap-v2-block-gap pb-v2-group-gap @min-[60rem]/page-available:flex-row @min-[60rem]/page-available:items-start @min-[60rem]/page-available:justify-between">
      <div className="min-w-0">
        <HeaderText title={title} description={description} back={back} meta={meta} />
      </div>
      <div className="min-w-0 @min-[60rem]/page-available:shrink-0">{trailing}</div>
    </div>
  );
}
