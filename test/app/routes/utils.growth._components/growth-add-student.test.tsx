/** @jest-environment jsdom */

import "../../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GrowthAddStudent } from "~/routes/utils.growth._components/GrowthAddStudent";

const students = [
  { uid: "10000", name: "아루", altNames: ["사장"] },
  { uid: "10001", name: "무츠키", altNames: [] },
];

function search(query: string) {
  render(<GrowthAddStudent availableStudents={students} adding={false} onAdd={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "학생 추가" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "학생 이름으로 검색" }), { target: { value: query } });
  // The search field hands the query over after its debounce.
  act(() => {
    jest.advanceTimersByTime(200);
  });
}

describe("GrowthAddStudent", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it("finds a student by another name", () => {
    search("사장");

    expect(screen.getByRole("button", { name: "아루" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "무츠키" })).toBeNull();
  });

  it("still finds a student by name", () => {
    search("무츠");

    expect(screen.getByRole("button", { name: "무츠키" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "아루" })).toBeNull();
  });
});
