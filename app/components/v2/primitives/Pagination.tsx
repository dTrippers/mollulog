import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { type FormEvent, type MouseEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getV2LinkTransitionProps } from "../layout/screen-transition";
import { v2FocusRing } from "../layout/styles";
import { Button } from "./Button";

export type PageItem = { kind: "page"; page: number; neighbor: boolean } | { kind: "ellipsis"; key: string };

// Page numbers with ellipses for large counts. A neighbor is a page beside the current one, not an end page. Narrow
// screens hide neighbors and keep the current page, so the row fits 390px.
export function getPageItems(currentPage: number, totalPages: number): PageItem[] {
  const pageItem = (page: number, large: boolean): PageItem => ({
    kind: "page",
    page,
    neighbor: large && page !== 1 && page !== totalPages && page !== currentPage,
  });

  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => pageItem(index + 1, false));
  }

  const items: PageItem[] = [pageItem(1, true)];
  if (currentPage <= 3) {
    for (let page = 2; page <= 4; page++) {
      items.push(pageItem(page, true));
    }
    items.push({ kind: "ellipsis", key: "end" });
  } else if (currentPage >= totalPages - 1) {
    items.push({ kind: "ellipsis", key: "start" });
    // The last page is added below, once.
    for (let page = totalPages - 2; page < totalPages; page++) {
      items.push(pageItem(page, true));
    }
  } else {
    items.push({ kind: "ellipsis", key: "start" });
    for (let page = currentPage - 1; page <= currentPage + 1; page++) {
      items.push(pageItem(page, true));
    }
    items.push({ kind: "ellipsis", key: "end" });
  }
  items.push(pageItem(totalPages, true));
  return items;
}

// A jump target is an integer from 1 through the last page. Anything else leaves the move action disabled.
export function parseJumpPage(value: string, totalPages: number): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const page = Number(trimmed);
  return page >= 1 && page <= totalPages ? page : null;
}

const itemClassName =
  "inline-flex min-h-v2-row-min min-w-v2-row-min items-center justify-center rounded-md px-2 text-sm tabular-nums text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg";
const currentClassName =
  "bg-v2-selected font-semibold text-v2-on-selected hover:bg-v2-selected hover:text-v2-on-selected";
const disabledClassName =
  "inline-flex min-h-v2-row-min min-w-v2-row-min items-center justify-center rounded-md px-2 text-v2-fg-disabled disabled:cursor-not-allowed";

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  // The URL of a page. Page 1 has its own URL, so the function decides it.
  getHref: (page: number) => string;
};

export function Pagination({ currentPage, totalPages, getHref }: PaginationProps) {
  const navigate = useNavigate();
  if (totalPages <= 1) {
    return null;
  }

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <nav aria-label="페이지" className="mt-8 flex flex-col items-center gap-3 md:flex-row md:justify-center md:gap-6">
      <div className="flex items-center gap-1">
        {isFirst ? (
          <button type="button" disabled aria-label="이전 페이지" className={disabledClassName}>
            <ChevronLeftIcon className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <Link
            to={getHref(currentPage - 1)}
            aria-label="이전 페이지"
            className={`${itemClassName} ${v2FocusRing}`}
            {...getV2LinkTransitionProps("crossfade")}
          >
            <ChevronLeftIcon className="size-5" aria-hidden="true" />
          </Link>
        )}
        {getPageItems(currentPage, totalPages).map((item) => {
          if (item.kind === "ellipsis") {
            return (
              <span key={`ellipsis-${item.key}`} aria-hidden="true" className="px-1 text-v2-fg-tertiary">
                …
              </span>
            );
          }
          const isCurrent = item.page === currentPage;
          return (
            <Link
              key={item.page}
              to={getHref(item.page)}
              aria-label={`${item.page}페이지`}
              aria-current={isCurrent ? "page" : undefined}
              className={`${itemClassName} ${isCurrent ? currentClassName : ""} ${item.neighbor ? "max-md:hidden" : ""} ${v2FocusRing}`}
              {...getV2LinkTransitionProps("crossfade")}
            >
              {item.page}
            </Link>
          );
        })}
        {isLast ? (
          <button type="button" disabled aria-label="다음 페이지" className={disabledClassName}>
            <ChevronRightIcon className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <Link
            to={getHref(currentPage + 1)}
            aria-label="다음 페이지"
            className={`${itemClassName} ${v2FocusRing}`}
            {...getV2LinkTransitionProps("crossfade")}
          >
            <ChevronRightIcon className="size-5" aria-hidden="true" />
          </Link>
        )}
      </div>
      <PageJumpForm totalPages={totalPages} onJump={(page) => navigate(getHref(page), { viewTransition: true })} />
    </nav>
  );
}

function PageJumpForm({ totalPages, onJump }: { totalPages: number; onJump: (page: number) => void }) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const targetPage = parseJumpPage(value, totalPages);
  const crossfade = getV2LinkTransitionProps("crossfade");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (targetPage === null) {
      return;
    }
    setValue("");
    // Arms the same crossfade as the page links. The helper's handler ignores its event argument.
    crossfade.onClick?.(event as unknown as MouseEvent<HTMLAnchorElement>);
    onJump(targetPage);
  };

  return (
    <form className="flex items-center gap-2 text-sm text-v2-fg-tertiary" onSubmit={handleSubmit}>
      <label htmlFor={inputId} className="sr-only">
        이동할 페이지 (1–{totalPages})
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={`min-h-v2-row-min w-16 rounded-md border border-v2-control-border bg-v2-surface px-2 text-center text-sm text-v2-fg tabular-nums ${v2FocusRing}`}
      />
      <span aria-hidden="true" className="tabular-nums">
        / {totalPages}
      </span>
      <Button type="submit" variant="secondary" disabled={targetPage === null}>
        이동
      </Button>
    </form>
  );
}
