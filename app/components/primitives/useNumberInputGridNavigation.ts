import type { ComponentPropsWithoutRef, KeyboardEvent } from "react";
import { useCallback, useId } from "react";

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

type NumberInputGridPosition = Pick<GridInput, "rowIndex" | "columnIndex">;

export function useNumberInputGridNavigation({
  selectOnFocus = true,
  tabNavigation = false,
}: {
  selectOnFocus?: boolean;
  tabNavigation?: boolean;
} = {}) {
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
        if (event.defaultPrevented || disabled || event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }

        if (event.key === "Tab" && tabNavigation) {
          const targetInput = findTabTarget(event, gridId, event.shiftKey ? "backward" : "forward");
          if (!targetInput) {
            return;
          }

          event.preventDefault();
          targetInput.focus();
          selectInputValue(targetInput);
          return;
        }

        if (event.shiftKey) return;

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
    [gridId, selectInputValue, tabNavigation],
  );

  return { getInputProps };
}

function findTabTarget(
  event: KeyboardEvent<HTMLInputElement>,
  gridId: string,
  direction: "forward" | "backward",
): HTMLInputElement | null {
  const inputs = getGridInputs(event.currentTarget, gridId).sort(
    (a, b) => a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex,
  );
  const currentIndex = inputs.findIndex(({ input }) => input === event.currentTarget);
  if (currentIndex === -1) return null;

  return inputs[currentIndex + (direction === "forward" ? 1 : -1)]?.input ?? null;
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

  const inputs = getGridInputs(currentInput, gridId);

  if (direction === "left" || direction === "right") {
    return findHorizontalTarget(inputs, currentRowIndex, currentColumnIndex, direction);
  }

  return findVerticalTarget(inputs, currentRowIndex, currentColumnIndex, direction);
}

function getGridInputs(currentInput: HTMLInputElement, gridId: string): GridInput[] {
  return Array.from(currentInput.ownerDocument.querySelectorAll<HTMLInputElement>("input[data-number-input-grid]"))
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
  return findNumberInputGridVerticalTarget(inputs, currentRowIndex, currentColumnIndex, direction)?.input ?? null;
}

export function findNumberInputGridVerticalTarget<T extends NumberInputGridPosition>(
  inputs: T[],
  currentRowIndex: number,
  currentColumnIndex: number,
  direction: Extract<NumberInputGridDirection, "up" | "down">,
): T | null {
  const targetRows = Array.from(
    new Set(
      inputs
        .map(({ rowIndex }) => rowIndex)
        .filter((rowIndex) => (direction === "up" ? rowIndex < currentRowIndex : rowIndex > currentRowIndex)),
    ),
  ).sort((a, b) => (direction === "up" ? b - a : a - b));

  for (const rowIndex of targetRows) {
    const inputInSameColumn = inputs.find(
      (input) => input.rowIndex === rowIndex && input.columnIndex === currentColumnIndex,
    );

    if (inputInSameColumn) {
      return inputInSameColumn;
    }
  }

  return null;
}
