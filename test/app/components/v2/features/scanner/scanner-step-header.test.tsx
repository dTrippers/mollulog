import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { ScannerQuotaMeter } from "~/components/v2/features/scanner/ScannerQuota";
import { ScannerStepHeader, ScannerStepTitle } from "~/components/v2/features/scanner/ScannerStepHeader";
import { ProgressBar } from "~/components/v2/primitives/ProgressBar";

function countOf(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

describe("scanner step header", () => {
  it("marks the active step and announces failure in text, not only in color", () => {
    const markup = renderToStaticMarkup(
      <ScannerStepHeader states={["done", "failed", "pending", "pending"]}>
        <ScannerStepTitle title="스크린샷을 인식하지 못했어요" />
      </ScannerStepHeader>,
    );
    expect(markup).not.toContain('aria-current="step"');
    expect(markup).toContain("실패");
    expect(markup).toContain('aria-live="polite"');
  });

  it("puts exactly one progress bar on a recognizing screen", () => {
    const markup = renderToStaticMarkup(
      <ScannerStepHeader states={["done", "active", "pending", "pending"]}>
        <ScannerStepTitle title="스크린샷을 인식하고 있어요" meta="6장 중 3장 처리" />
        <ProgressBar value={3} max={6} label="인식 진행률" />
      </ScannerStepHeader>,
    );
    expect(countOf(markup, /<progress/g)).toBe(1);
    expect(markup).toContain('aria-current="step"');
  });

  it("shows no progress bar while queued, only the waiting line", () => {
    const markup = renderToStaticMarkup(
      <ScannerStepHeader states={["done", "active", "pending", "pending"]}>
        <ScannerStepTitle title="인식 대기 중이에요" />
      </ScannerStepHeader>,
    );
    expect(countOf(markup, /<progress/g)).toBe(0);
  });

  it("keeps the fill at the remaining share and turns only the track into the danger tone", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={0} max={200} label="진행률" track="danger" />);
    expect(markup).toContain('value="0"');
    expect(markup).toContain("bg-v2-danger-subtle");
  });

  it("clamps the progress value and keeps a non-empty maximum", () => {
    const markup = renderToStaticMarkup(<ProgressBar value={9} max={0} label="진행률" />);
    expect(markup).toContain('max="1"');
    expect(markup).toContain('value="1"');
  });
});

describe("scanner quota meter states", () => {
  it("separates loading from an empty quota", () => {
    const markup = renderToStaticMarkup(<ScannerQuotaMeter subject="이미지" state={{ kind: "loading" }} />);
    expect(markup).toContain("불러오는 중");
    expect(markup).not.toContain("남음");
  });

  it("offers a retry for a failed quota read", () => {
    const markup = renderToStaticMarkup(
      <ScannerQuotaMeter subject="영상" state={{ kind: "error", onRetry: () => undefined }} />,
    );
    expect(markup).toContain("불러오지 못했어요");
    expect(markup).toContain("다시 시도");
  });

  it("shows exhaustion with the next available time and the danger tone", () => {
    const markup = renderToStaticMarkup(
      <ScannerQuotaMeter
        subject="이미지"
        state={{ kind: "exhausted", remaining: 0, limit: 200, availableAt: "2026-10-24T05:30:00.000Z" }}
      />,
    );
    expect(markup).toContain("0 / 200");
    expect(markup).toContain("부터 가능");
    expect(markup).toContain("text-v2-danger");
    // The meter value is the real remaining amount, and the exhausted track is danger-subtle (D-1).
    expect(markup).toContain('value="0"');
    expect(markup).toContain("bg-v2-danger-subtle");
  });

  it("shows a low amount with the warning tone and the remaining count", () => {
    const markup = renderToStaticMarkup(
      <ScannerQuotaMeter subject="영상" state={{ kind: "low", remaining: 1, limit: 10 }} />,
    );
    expect(markup).toContain("1 / 10");
    expect(markup).toContain("text-v2-warning");
  });
});
