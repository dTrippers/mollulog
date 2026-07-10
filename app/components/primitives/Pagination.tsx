import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

/**
 * Generate page numbers to display with ellipsis for large page counts
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = [];
  if (totalPages <= 5) {
    // Show all pages if total is small
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Show first page
    pages.push(1);
    if (currentPage <= 3) {
      // Near the start: 1, 2, 3, 4, ..., last
      for (let i = 2; i <= 4; i++) {
        pages.push(i);
      }
      pages.push("...");
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 1) {
      // Near the end: 1, ..., n-3, n-2, n-1, n
      pages.push("...");
      for (let i = totalPages - 2; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // In the middle: 1, ..., current-1, current, current+1, ..., last
      pages.push("...");
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        pages.push(i);
      }
      pages.push("...");
      pages.push(totalPages);
    }
  }
  return pages;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const [jumpPage, setJumpPage] = useState("");
  if (totalPages <= 1) {
    return null;
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const handleJumpToPage = () => {
    const page = Number.parseInt(jumpPage, 10);
    if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
      setJumpPage("");
    }
  };

  const handleJumpInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleJumpToPage();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-6">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="이전 페이지"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>

        {pageNumbers.map((page, index) => {
          if (page === "...") {
            const previousPage = pageNumbers[index - 1];
            const nextPage = pageNumbers[index + 1];
            return (
              <span
                key={`ellipsis-${previousPage ?? "start"}-${nextPage ?? "end"}`}
                className="px-2 text-muted-foreground"
              >
                ...
              </span>
            );
          }

          const pageNum = page as number;
          const isActive = currentPage === pageNum;
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              className={`cursor-pointer rounded-md px-3 py-1 text-sm transition-colors ${
                isActive ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"
              }`}
              aria-label={`페이지 ${pageNum}`}
              aria-current={isActive ? "page" : undefined}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="다음 페이지"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          max={totalPages}
          value={jumpPage}
          onChange={(e) => setJumpPage(e.target.value)}
          onKeyDown={handleJumpInputKeyDown}
          placeholder="페이지"
          className="no-decoration w-20 rounded-md border border-input bg-background px-2 py-1 text-sm transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        <button
          type="button"
          onClick={handleJumpToPage}
          disabled={!jumpPage || Number.isNaN(Number.parseInt(jumpPage, 10))}
          className="cursor-pointer rounded-md bg-muted px-3 py-1 text-sm transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          이동
        </button>
      </div>
    </div>
  );
}
