/** @jest-environment jsdom */

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react";
import BlurhashPlaceholder from "~/components/media/BlurhashPlaceholder";

const VALID_BLURHASH = "YEB:Ny3VWp-pA==|A==|@BEla|rxSMrxN]w5dxeqfQeqfQeqfQeq_LF_a|t7SMt7N]xa";

describe("BlurhashPlaceholder", () => {
  const clearRect = jest.fn();
  const putImageData = jest.fn();
  const context = {
    clearRect,
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData,
  } as unknown as CanvasRenderingContext2D;
  let getContextSpy: ReturnType<typeof jest.spyOn>;
  let warnSpy: ReturnType<typeof jest.spyOn>;

  afterEach(() => {
    getContextSpy?.mockRestore();
    warnSpy?.mockRestore();
    clearRect.mockClear();
    putImageData.mockClear();
  });

  function mockCanvas() {
    getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  }

  it("clears the previous image when the hash changes to null", () => {
    mockCanvas();
    const { rerender } = render(<BlurhashPlaceholder blurhash={VALID_BLURHASH} />);
    expect(putImageData).toHaveBeenCalledTimes(1);

    rerender(<BlurhashPlaceholder blurhash={null} />);

    expect(clearRect).toHaveBeenCalledTimes(2);
  });

  it("clears the previous image when the new hash is invalid", () => {
    mockCanvas();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(<BlurhashPlaceholder blurhash={VALID_BLURHASH} />);

    rerender(<BlurhashPlaceholder blurhash="invalid" />);

    expect(clearRect).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith("Could not decode timeline image blurhash", expect.any(Error));
  });
});
