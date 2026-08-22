import { describe, expect, it, jest } from "@jest/globals";
import {
  getClipboardFiles,
  isClipboardTextTarget,
  registerScannerPasteListener,
} from "~/routes/scanner._components/ScannerUploadSection";

describe("scanner clipboard uploads", () => {
  it("turns file clipboard blobs into files while preserving the accepted MIME type", () => {
    const blob = new Blob(["image"], { type: "image/png" });
    const data = {
      files: [],
      items: [{ kind: "file", getAsFile: () => blob }],
    } as unknown as DataTransfer;

    expect(getClipboardFiles(data)).toEqual([
      expect.objectContaining({ name: expect.stringMatching(/^clipboard-\d+\.png$/), type: "image/png" }),
    ]);
  });

  it("does not hijack text inputs or contenteditable targets", () => {
    expect(isClipboardTextTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isClipboardTextTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isClipboardTextTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isClipboardTextTarget({ tagName: "SECTION" } as unknown as EventTarget)).toBe(false);
  });

  it("registers one page listener and handles file paste outside the upload section", () => {
    let listener: EventListener | undefined;
    const page = {
      addEventListener: jest.fn((_type: string, nextListener: EventListener) => {
        listener = nextListener;
      }),
      removeEventListener: jest.fn(),
    } as unknown as Pick<Document, "addEventListener" | "removeEventListener">;
    const onFiles = jest.fn();
    const blob = new Blob(["image"], { type: "image/png" });
    const clipboardData = {
      files: [],
      items: [{ kind: "file", getAsFile: () => blob }],
    } as unknown as DataTransfer;
    const preventDefault = jest.fn();
    const cleanup = registerScannerPasteListener(page, onFiles, false);

    expect(page.addEventListener).toHaveBeenCalledWith("paste", expect.any(Function));
    expect(listener).toBeDefined();
    const registeredListener = listener as EventListener;
    registeredListener({
      target: { tagName: "BODY" },
      clipboardData,
      preventDefault,
    } as unknown as Event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ type: "image/png" })]);

    registeredListener({
      target: { tagName: "INPUT" },
      clipboardData,
      preventDefault,
    } as unknown as Event);
    expect(onFiles).toHaveBeenCalledTimes(1);

    cleanup();
    expect(page.removeEventListener).toHaveBeenCalledWith("paste", registeredListener);
  });
});
