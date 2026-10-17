/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import ResourceScanner from "~/routes/scanner.resource._components/ResourceScanner";
import { getScannerTerminalJobTitle } from "~/routes/scanner._components/scanner-messages";

const mockRequestScannerJson = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSetSearchParams = jest.fn();
const mockOutletContext = {
  imageUploadQuota: { limit: 200, remaining: 150, nextAvailableAt: null },
  setImageUploadQuota: jest.fn(),
  videoUploadQuota: null,
  setVideoUploadQuota: jest.fn(),
  openJobsPanel: jest.fn(),
  setMobileActionBarHidden: jest.fn(),
  stacked: false,
};

jest.mock("react-router", () => ({
  Link: "a",
  useOutletContext: () => mockOutletContext,
  useSearchParams: () => [new URLSearchParams("job=job-1"), mockSetSearchParams],
}));

jest.mock("~/routes/scanner._components/scanner-client", () => {
  const actual = jest.requireActual<Record<string, unknown>>("~/routes/scanner._components/scanner-client");
  return { ...actual, requestScannerJson: (...args: unknown[]) => mockRequestScannerJson(...args) };
});

const STEPPER_SELECTOR = 'ol[aria-label="진행 단계"]';
const SKELETON_TEXT = "인식 작업을 불러오는 중";

const baseJob = {
  uid: "job-1",
  generation: 1,
  status: "review_ready",
  progress: { completed: 1, failed: 0, total: 1 },
  images: [{ uid: "image-1", filename: "shot.png", status: "succeeded" }],
  reviewMode: "cells",
  cells: [],
  currentQuantities: {},
  application: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-08T00:00:00.000Z",
};

const UPLOAD_TITLE = "스크린샷을 선택해 주세요";
const REVIEW_TITLE = "인식 결과를 검토해 주세요";
const COMPLETION_TITLE = "반영했어요";

// One body per job state: the expected body title is shown, and no other body is rendered with it.
const phaseCases = [
  {
    name: "queued",
    job: {
      ...baseJob,
      status: "queued",
      progress: { completed: 0, failed: 0, total: 1 },
      images: [{ uid: "image-1", filename: "shot.png", status: "queued" }],
      reviewMode: undefined,
      cells: undefined,
    },
    body: "인식 대기 중이에요",
    progressBars: 0,
    absent: [UPLOAD_TITLE, REVIEW_TITLE, COMPLETION_TITLE],
  },
  {
    name: "processing",
    job: {
      ...baseJob,
      status: "processing",
      progress: { completed: 0, failed: 0, total: 1 },
      images: [{ uid: "image-1", filename: "shot.png", status: "processing" }],
      reviewMode: undefined,
      cells: undefined,
    },
    body: "스크린샷을 인식하고 있어요",
    progressBars: 1,
    absent: [UPLOAD_TITLE, REVIEW_TITLE, COMPLETION_TITLE],
  },
  {
    name: "review",
    job: baseJob,
    body: REVIEW_TITLE,
    progressBars: 0,
    absent: [UPLOAD_TITLE, COMPLETION_TITLE],
  },
  {
    name: "applied",
    job: {
      ...baseJob,
      application: { status: "applied", appliedAt: "2026-01-02T00:00:00.000Z" },
      completionSummary: {
        appliedCount: 1,
        unappliedCellCount: 0,
        items: [{ uid: "item-1", name: "아이템", quantity: 3 }],
      },
    },
    body: COMPLETION_TITLE,
    progressBars: 0,
    absent: [UPLOAD_TITLE, REVIEW_TITLE],
  },
  {
    name: "failed",
    job: {
      ...baseJob,
      status: "failed",
      progress: { completed: 0, failed: 1, total: 1 },
      images: [{ uid: "image-1", filename: "shot.png", status: "failed" }],
    },
    body: getScannerTerminalJobTitle("failed", "item_inventory_images_v1"),
    progressBars: 0,
    absent: [UPLOAD_TITLE, REVIEW_TITLE, COMPLETION_TITLE],
  },
  {
    name: "expired",
    job: { ...baseJob, status: "expired", images: [{ uid: "image-1", filename: "shot.png", status: "failed" }] },
    body: getScannerTerminalJobTitle("expired", "item_inventory_images_v1"),
    progressBars: 0,
    absent: [UPLOAD_TITLE, REVIEW_TITLE, COMPLETION_TITLE],
  },
  {
    name: "cancelled",
    job: { ...baseJob, status: "cancelled", images: [{ uid: "image-1", filename: "shot.png", status: "failed" }] },
    body: getScannerTerminalJobTitle("cancelled", "item_inventory_images_v1"),
    progressBars: 0,
    absent: [UPLOAD_TITLE, REVIEW_TITLE, COMPLETION_TITLE],
  },
];

describe("item scanner step body", () => {
  beforeEach(() => {
    mockRequestScannerJson.mockReset();
    mockSetSearchParams.mockReset();
  });

  for (const phaseCase of phaseCases) {
    it(`renders one step header and only the ${phaseCase.name} body`, async () => {
      mockRequestScannerJson.mockResolvedValue(phaseCase.job);
      const { container } = render(<ResourceScanner />);

      // The loading skeleton has its own step header, so wait for the loaded body before counting headers.
      await waitFor(() => expect(screen.queryAllByText(phaseCase.body)).toHaveLength(1));
      expect(screen.queryByText(SKELETON_TEXT)).toBeNull();
      expect(container.querySelectorAll(STEPPER_SELECTOR)).toHaveLength(1);
      expect(container.querySelectorAll("progress")).toHaveLength(phaseCase.progressBars);
      for (const text of phaseCase.absent) {
        expect(screen.queryByText(text)).toBeNull();
      }
    });
  }
});
