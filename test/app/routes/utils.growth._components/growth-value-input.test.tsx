/** @jest-environment jsdom */

import "../../components/v2/layout/layout-test-polyfills";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GrowthValueInput } from "~/routes/utils.growth._components/GrowthValueInput";

const flowProps = { "data-number-input-flow": "test", onFocus: jest.fn(), onKeyDown: jest.fn() };

function renderSkill(value: number | null) {
  render(
    <GrowthValueInput
      label="니코 현재 EX 스킬"
      value={value}
      min={1}
      max={5}
      showSteps={false}
      flowProps={flowProps}
      onChange={jest.fn()}
      maxText="MAX"
    />,
  );
  return screen.getByRole("textbox", { name: "니코 현재 EX 스킬" }) as HTMLInputElement;
}

describe("GrowthValueInput", () => {
  afterEach(() => cleanup());

  it("shows MAX for the highest value and the number while focused", () => {
    const input = renderSkill(5);
    expect(input.value).toBe("MAX");

    fireEvent.focus(input);
    expect(input.value).toBe("5");

    fireEvent.blur(input);
    expect(input.value).toBe("MAX");
  });

  it("shows the number below the highest value", () => {
    expect(renderSkill(4).value).toBe("4");
  });
});
