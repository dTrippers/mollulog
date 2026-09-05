import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { shareStudentGrowthUrl } from "~/routes/$username.students._components/ShareStudentGrowthButton";
import {
  isAbilityEditable,
  shouldAutoFocusGrowthEditor,
} from "~/routes/$username.students._components/StudentGrowthCard";

type TestNavigator = {
  share?: jest.MockedFunction<(data: ShareData) => Promise<void>>;
  clipboard?: { writeText: jest.MockedFunction<(text: string) => Promise<void>> };
};

function setNavigator(value: TestNavigator) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
}

function setDocument(value: unknown) {
  Object.defineProperty(globalThis, "document", { configurable: true, value });
}

const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  setNavigator({
    share: jest.fn<(data: ShareData) => Promise<void>>(),
    clipboard: { writeText: jest.fn<(text: string) => Promise<void>>() },
  });
});

afterEach(() => {
  if (originalDocument === undefined) {
    delete (globalThis as { document?: unknown }).document;
  } else {
    setDocument(originalDocument);
  }
});

describe("student growth sharing", () => {
  it("uses Web Share when it is available", async () => {
    const share = (navigator as unknown as TestNavigator).share as jest.MockedFunction<
      (data: ShareData) => Promise<void>
    >;
    share.mockResolvedValue(undefined);

    await expect(shareStudentGrowthUrl("https://mollulog.test/@teacher/students?view=growth")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "학생 성장 상태",
      url: "https://mollulog.test/@teacher/students?view=growth",
    });
    expect((navigator as unknown as TestNavigator).clipboard?.writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when Web Share is unavailable", async () => {
    const clipboard = { writeText: jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) };
    setNavigator({ clipboard });

    await expect(shareStudentGrowthUrl("https://mollulog.test/growth")).resolves.toBe("copied");
    expect(clipboard.writeText).toHaveBeenCalledWith("https://mollulog.test/growth");
  });

  it("treats a Web Share cancellation as a non-error result", async () => {
    const share = (navigator as unknown as TestNavigator).share as jest.MockedFunction<
      (data: ShareData) => Promise<void>
    >;
    share.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "AbortError" }));

    await expect(shareStudentGrowthUrl("https://mollulog.test/growth")).resolves.toBe("cancelled");
    expect((navigator as unknown as TestNavigator).clipboard?.writeText).not.toHaveBeenCalled();
  });

  it("reports an explicit error when Web Share and both clipboard paths fail", async () => {
    const share = jest.fn<(data: ShareData) => Promise<void>>().mockRejectedValue(new Error("share unavailable"));
    const writeText = jest.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("clipboard unavailable"));
    const execCommand = jest.fn((_command: string) => false);
    const textarea = {
      value: "",
      setAttribute: jest.fn(),
      style: {} as Record<string, string>,
      select: jest.fn(),
      remove: jest.fn(),
    };
    setNavigator({ share, clipboard: { writeText } });
    setDocument({
      createElement: jest.fn(() => textarea),
      body: { appendChild: jest.fn() },
      execCommand,
    });

    await expect(shareStudentGrowthUrl("https://mollulog.test/growth")).rejects.toThrow("clipboard unavailable");
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("https://mollulog.test/growth");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it.each([
    ["available unique weapon tier", true, 6, true],
    ["lower non-unique weapon tier", true, 5, false],
    ["catalog without a weapon", false, 6, false],
  ] as const)("derives ability editing from the draft tier and catalog for %s", (_caseName, available, tier, expected) => {
    expect(isAbilityEditable(available, tier)).toBe(expected);
  });

  it("requests focus only when the growth editor is active", () => {
    expect(shouldAutoFocusGrowthEditor(true)).toBe(true);
    expect(shouldAutoFocusGrowthEditor(false)).toBe(false);
  });
});
