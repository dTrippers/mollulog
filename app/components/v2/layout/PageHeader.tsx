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
  titleHidden?: boolean;
  // A compact media block beside the heading, such as a student's thumbnail.
  media?: ReactNode;
  // Optional block beside the title on wide page-available widths, under the description otherwise.
  trailing?: ReactNode;
  // Keeps `trailing` beside the heading at every width instead of stacking it below, for a short action such as a
  // primary button. The heading truncates before the action wraps.
  trailingInline?: boolean;
  // Full-width lines under the heading row, below the media too, such as a profile's introduction and counts.
  details?: ReactNode;
  // Hide the header beside an aside, where the page renders `PageAsideHeader` at the top of the aside instead.
  stackedOnly?: boolean;
};

function HeaderBack({ back, titleHidden = false }: { back: PageHeaderBack; titleHidden?: boolean }) {
  const backClassName = cn(
    !titleHidden && "mb-2",
    "inline-flex min-h-v2-row-min cursor-pointer items-center gap-1 rounded-md text-sm text-v2-fg-secondary hover:text-v2-fg",
    v2FocusRing,
  );
  return "to" in back ? (
    <Link to={back.to} className={backClassName} {...getV2LinkTransitionProps("reverse")}>
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      <span>{back.title}</span>
    </Link>
  ) : (
    <button type="button" className={backClassName} onClick={() => runV2BackNavigation(back.onClick)}>
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      <span>{back.title}</span>
    </button>
  );
}

function HeaderText({
  title,
  description,
  back,
  meta,
  titleHidden = false,
  compactMeta = false,
}: Omit<PageHeaderProps, "trailing" | "media"> & { compactMeta?: boolean }) {
  return (
    <>
      {back ? <HeaderBack back={back} titleHidden={titleHidden} /> : null}
      <h1 className={cn("text-xl font-bold text-v2-fg md:text-2xl", titleHidden && "sr-only")}>{title}</h1>
      {description ? <p className="mt-2 max-w-prose text-sm text-v2-fg-secondary">{description}</p> : null}
      {meta ? (
        <div className={cn(compactMeta ? "mt-1" : "mt-2", "text-sm text-v2-fg-tertiary", titleHidden && "sr-only")}>
          {meta}
        </div>
      ) : null}
    </>
  );
}

export function PageHeader({
  title,
  description,
  back,
  meta,
  titleHidden,
  media,
  trailing,
  trailingInline = false,
  stackedOnly = false,
  details,
}: PageHeaderProps) {
  // A title alone beside the media, with its lines moved to `details`, sits in the middle of the row.
  const centered = Boolean(media && details && !meta && !description && !back);
  const heading = media ? (
    <div className={cn("min-w-0", trailing && trailingInline && "flex-1")}>
      {back ? <HeaderBack back={back} titleHidden={titleHidden} /> : null}
      <div className={cn("flex min-w-0 gap-v2-media-gap", centered ? "items-center" : "items-start")}>
        <div className="w-[3.75rem] shrink-0">{media}</div>
        <div className="min-w-0 flex-1">
          <HeaderText title={title} description={description} meta={meta} titleHidden={titleHidden} compactMeta />
        </div>
      </div>
    </div>
  ) : null;

  const stackedOnlyAttribute = stackedOnly ? "true" : undefined;
  const headerClassName = "v2-header min-w-0 pb-v2-group-gap";
  const rowClassName = trailing
    ? cn(
        "flex min-w-0 gap-v2-block-gap",
        trailingInline
          ? cn("flex-row justify-between", centered ? "items-center" : "items-start")
          : "flex-col @min-[60rem]/page-available:flex-row @min-[60rem]/page-available:items-start @min-[60rem]/page-available:justify-between",
      )
    : "min-w-0";
  const rowContent = (
    <>
      {heading ??
        (trailing ? (
          <div className={cn("min-w-0", trailingInline && "flex-1")}>
            <HeaderText title={title} description={description} back={back} meta={meta} titleHidden={titleHidden} />
          </div>
        ) : (
          <HeaderText title={title} description={description} back={back} meta={meta} titleHidden={titleHidden} />
        ))}
      {trailing ? (
        <div className={cn("min-w-0", trailingInline ? "shrink-0" : "@min-[60rem]/page-available:shrink-0")}>
          {trailing}
        </div>
      ) : null}
    </>
  );

  if (!details) {
    return (
      <div data-stacked-only={stackedOnlyAttribute} className={cn(headerClassName, trailing && rowClassName)}>
        {rowContent}
      </div>
    );
  }
  return (
    <div data-stacked-only={stackedOnlyAttribute} className={headerClassName}>
      <div className={rowClassName}>{rowContent}</div>
      <div className="mt-3 min-w-0">{details}</div>
    </div>
  );
}

// The header of a `stackedOnly` page beside its aside. The page renders it first in `PageAside`.
export function PageAsideHeader({
  title,
  back,
  meta,
  media,
}: Pick<PageHeaderProps, "title" | "back" | "meta" | "media">) {
  return (
    <div className="min-w-0">
      {back ? <HeaderBack back={back} /> : null}
      <div className="flex min-w-0 items-start gap-v2-media-gap">
        {media ? <div className="w-[3.75rem] shrink-0">{media}</div> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-[1.4] font-bold text-v2-fg">{title}</h1>
          {meta ? <div className="mt-1 text-sm text-v2-fg-tertiary">{meta}</div> : null}
        </div>
      </div>
    </div>
  );
}
