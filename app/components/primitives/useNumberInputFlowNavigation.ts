import { useCallback, useId } from "react";
import type { ComponentPropsWithoutRef, KeyboardEvent } from "react";

type NumberInputFlowDirection = "left" | "right" | "up" | "down";

export type NumberInputFlowNavigationInputProps = Pick<
  ComponentPropsWithoutRef<"input">,
  "className" | "onFocus" | "onKeyDown"
> & {
  "data-number-input-flow": string;
};

type NumberInputFlowNavigationPropsOptions = {
  disabled?: boolean;
  onFocus?: ComponentPropsWithoutRef<"input">["onFocus"];
  onKeyDown?: ComponentPropsWithoutRef<"input">["onKeyDown"];
};

export type NumberInputFlowNavigationRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type FlowInput = {
  input: HTMLInputElement;
  rect: NumberInputFlowNavigationRect;
};

type RectMetrics = NumberInputFlowNavigationRect & {
  centerX: number;
  centerY: number;
  height: number;
};

const SAME_ROW_EPSILON = 1;

export function useNumberInputFlowNavigation({ selectOnFocus = true }: { selectOnFocus?: boolean } = {}) {
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
      disabled = false,
      onFocus,
      onKeyDown,
    }: NumberInputFlowNavigationPropsOptions = {}): NumberInputFlowNavigationInputProps => ({
      "data-number-input-flow": gridId,
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

export function findNumberInputFlowNavigationTargetIndex(
  rects: NumberInputFlowNavigationRect[],
  currentIndex: number,
  direction: NumberInputFlowDirection,
): number | null {
  const currentRect = rects[currentIndex];
  if (!currentRect) {
    return null;
  }

  const current = toRectMetrics(currentRect);
  const candidates = rects
    .map((rect, index) => ({ index, rect: toRectMetrics(rect) }))
    .filter(({ index }) => index !== currentIndex);

  if (direction === "left" || direction === "right") {
    return findHorizontalTargetIndex(candidates, current, direction);
  }

  return findVerticalTargetIndex(candidates, current, direction);
}

function getDirection(key: string): NumberInputFlowDirection | null {
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
  direction: NumberInputFlowDirection,
): HTMLInputElement | null {
  const currentInput = event.currentTarget;
  const inputs = Array.from(
    currentInput.ownerDocument.querySelectorAll<HTMLInputElement>("input[data-number-input-flow]"),
  )
    .filter((input) => input.dataset.numberInputFlow === gridId && !input.disabled)
    .map((input): FlowInput => {
      const rect = input.getBoundingClientRect();
      return {
        input,
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        },
      };
    });
  const currentIndex = inputs.findIndex(({ input }) => input === currentInput);
  if (currentIndex === -1) {
    return null;
  }

  const targetIndex = findNumberInputFlowNavigationTargetIndex(
    inputs.map(({ rect }) => rect),
    currentIndex,
    direction,
  );
  if (targetIndex === null) {
    return null;
  }

  return inputs[targetIndex]?.input ?? null;
}

function findHorizontalTargetIndex(
  candidates: Array<{ index: number; rect: RectMetrics }>,
  current: RectMetrics,
  direction: Extract<NumberInputFlowDirection, "left" | "right">,
): number | null {
  const target = candidates
    .filter(({ rect }) => {
      if (!isSameVisualRow(current, rect)) {
        return false;
      }
      return direction === "left" ? rect.centerX < current.centerX : rect.centerX > current.centerX;
    })
    .sort(
      (a, b) =>
        Math.abs(a.rect.centerX - current.centerX) - Math.abs(b.rect.centerX - current.centerX) ||
        Math.abs(a.rect.centerY - current.centerY) - Math.abs(b.rect.centerY - current.centerY) ||
        a.index - b.index,
    )[0];

  return target?.index ?? null;
}

function findVerticalTargetIndex(
  candidates: Array<{ index: number; rect: RectMetrics }>,
  current: RectMetrics,
  direction: Extract<NumberInputFlowDirection, "up" | "down">,
): number | null {
  const directionalCandidates = candidates
    .filter(({ rect }) => !isSameVisualRow(current, rect))
    .filter(({ rect }) => (direction === "up" ? rect.centerY < current.centerY : rect.centerY > current.centerY))
    .sort(
      (a, b) =>
        getVerticalDistance(current, a.rect, direction) - getVerticalDistance(current, b.rect, direction) ||
        Math.abs(a.rect.centerY - current.centerY) - Math.abs(b.rect.centerY - current.centerY) ||
        a.index - b.index,
    );
  const rowAnchor = directionalCandidates[0];
  if (!rowAnchor) {
    return null;
  }

  const target = directionalCandidates
    .filter(({ rect }) => isSameVisualRow(rowAnchor.rect, rect))
    .sort(
      (a, b) =>
        Math.abs(a.rect.centerX - current.centerX) - Math.abs(b.rect.centerX - current.centerX) ||
        a.rect.centerX - b.rect.centerX ||
        a.index - b.index,
    )[0];

  return target?.index ?? null;
}

function getVerticalDistance(
  current: RectMetrics,
  target: RectMetrics,
  direction: Extract<NumberInputFlowDirection, "up" | "down">,
): number {
  return direction === "up" ? Math.max(0, current.top - target.bottom) : Math.max(0, target.top - current.bottom);
}

function isSameVisualRow(a: RectMetrics, b: RectMetrics): boolean {
  const verticalOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (verticalOverlap >= -SAME_ROW_EPSILON) {
    return true;
  }

  const rowTolerance = Math.min(a.height, b.height) / 2 + SAME_ROW_EPSILON;
  return Math.abs(a.centerY - b.centerY) < rowTolerance;
}

function toRectMetrics(rect: NumberInputFlowNavigationRect): RectMetrics {
  return {
    ...rect,
    centerX: (rect.left + rect.right) / 2,
    centerY: (rect.top + rect.bottom) / 2,
    height: rect.bottom - rect.top,
  };
}
