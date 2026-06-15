import { useCallback, useId } from "react";
import type { ComponentPropsWithoutRef, KeyboardEvent } from "react";

type NumberInputGridDirection = "left" | "right" | "up" | "down";

export type NumberInputGridNavigationInputProps = Pick<
  ComponentPropsWithoutRef<"input">,
  "className" | "onFocus" | "onKeyDown"
> & {
  "data-number-input-grid": string;
  "data-number-input-grid-row": number;
  "data-number-input-grid-column": number;
};

type NumberInputGridNavigationPropsOptions = {
  rowIndex: number;
  columnIndex: number;
  disabled?: boolean;
  onFocus?: ComponentPropsWithoutRef<"input">["onFocus"];
  onKeyDown?: ComponentPropsWithoutRef<"input">["onKeyDown"];
};

type GridInput = {
  input: HTMLInputElement;
  rowIndex: number;
  columnIndex: number;
};

export function useNumberInputGridNavigation({ selectOnFocus = true }: { selectOnFocus?: boolean } = {}) {
  const gridId = useId();

  const selectInputValue = useCallback(
    (input: HTMLInputElement) => {
      if (!selectOnFocus) {
        return;
      }

      requestAnimationFrame(() => {
        if (input.ownerDocument.activeElement === input) {
          input.select();
        }
      });
    },
    [selectOnFocus],
  );

  const getInputProps = useCallback(
    ({
      rowIndex,
      columnIndex,
      disabled = false,
      onFocus,
      onKeyDown,
    }: NumberInputGridNavigationPropsOptions): NumberInputGridNavigationInputProps => ({
      "data-number-input-grid": gridId,
      "data-number-input-grid-row": rowIndex,
      "data-number-input-grid-column": columnIndex,
      onFocus: (event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) {
          selectInputValue(event.currentTarget);
        }
      },
      onKeyDown: (event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || disabled || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
          return;
        }

        const direction = getDirection(event.key);
        if (!direction) {
          return;
        }

        const targetInput = findNavigationTarget(event, gridId, direction);
        if (!targetInput) {
          return;
        }

        event.preventDefault();
        targetInput.focus();
        selectInputValue(targetInput);
      },
    }),
    [gridId, selectInputValue],
  );

  return { getInputProps };
}

function getDirection(key: string): NumberInputGridDirection | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

function findNavigationTarget(
  event: KeyboardEvent<HTMLInputElement>,
  gridId: string,
  direction: NumberInputGridDirection,
): HTMLInputElement | null {
  const currentInput = event.currentTarget;
  const currentRowIndex = Number(currentInput.dataset.numberInputGridRow);
  const currentColumnIndex = Number(currentInput.dataset.numberInputGridColumn);
  if (!Number.isFinite(currentRowIndex) || !Number.isFinite(currentColumnIndex)) {
    return null;
  }

  const inputs = Array.from(
    currentInput.ownerDocument.querySelectorAll<HTMLInputElement>("input[data-number-input-grid]"),
  )
    .filter((input) => input.dataset.numberInputGrid === gridId && !input.disabled)
    .map((input): GridInput | null => {
      const rowIndex = Number(input.dataset.numberInputGridRow);
      const columnIndex = Number(input.dataset.numberInputGridColumn);
      if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) {
        return null;
      }

      return { input, rowIndex, columnIndex };
    })
    .filter((input): input is GridInput => input != null);

  if (direction === "left" || direction === "right") {
    return findHorizontalTarget(inputs, currentRowIndex, currentColumnIndex, direction);
  }

  return findVerticalTarget(inputs, currentRowIndex, currentColumnIndex, direction);
}

function findHorizontalTarget(
  inputs: GridInput[],
  currentRowIndex: number,
  currentColumnIndex: number,
  direction: Extract<NumberInputGridDirection, "left" | "right">,
): HTMLInputElement | null {
  const rowInputs = inputs
    .filter(({ rowIndex, columnIndex }) =>
      direction === "left"
        ? rowIndex === currentRowIndex && columnIndex < currentColumnIndex
        : rowIndex === currentRowIndex && columnIndex > currentColumnIndex,
    )
    .sort((a, b) => (direction === "left" ? b.columnIndex - a.columnIndex : a.columnIndex - b.columnIndex));

  return rowInputs[0]?.input ?? null;
}

function findVerticalTarget(
  inputs: GridInput[],
  currentRowIndex: number,
  currentColumnIndex: number,
  direction: Extract<NumberInputGridDirection, "up" | "down">,
): HTMLInputElement | null {
  const targetRows = Array.from(
    new Set(
      inputs
        .map(({ rowIndex }) => rowIndex)
        .filter((rowIndex) => (direction === "up" ? rowIndex < currentRowIndex : rowIndex > currentRowIndex)),
    ),
  ).sort((a, b) => (direction === "up" ? b - a : a - b));

  for (const rowIndex of targetRows) {
    const nearestInput = inputs
      .filter((input) => input.rowIndex === rowIndex)
      .sort(
        (a, b) =>
          Math.abs(a.columnIndex - currentColumnIndex) - Math.abs(b.columnIndex - currentColumnIndex) ||
          a.columnIndex - b.columnIndex,
      )[0];

    if (nearestInput) {
      return nearestInput.input;
    }
  }

  return null;
}
