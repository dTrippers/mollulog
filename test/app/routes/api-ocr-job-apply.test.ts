import { describe, expect, it } from "@jest/globals";
import { findCandidateEvidence } from "../../../app/domain/ocr-candidate";

const result = {
  images: [
    {
      filename: "items-1.png",
      observations: [
        {
          observation_id: "observation-1",
          quantity: 123,
          quantity_exact: true,
          candidates: Array.from({ length: 6 }, (_, index) => ({
            uid: `item-${index + 1}`,
            name: `아이템 ${index + 1}`,
            score: 0.9 - index * 0.1,
          })),
        },
      ],
    },
  ],
};

describe("OCR candidate evidence", () => {
  it("accepts a candidate from the selected image and observation", () => {
    expect(
      findCandidateEvidence(result, "item-1", {
        imageFilename: "items-1.png",
        observationId: "observation-1",
      }),
    ).toEqual({
      imageFilename: "items-1.png",
      observationId: "observation-1",
      quantity: 123,
      quantityExact: true,
      candidateScore: 0.9,
    });
  });

  it("rejects candidates outside the top five", () => {
    expect(
      findCandidateEvidence(result, "item-6", {
        imageFilename: "items-1.png",
        observationId: "observation-1",
      }),
    ).toBeNull();
  });

  it("rejects a candidate attributed to a different image or observation", () => {
    expect(
      findCandidateEvidence(result, "item-1", {
        imageFilename: "items-2.png",
        observationId: "observation-1",
      }),
    ).toBeNull();
    expect(
      findCandidateEvidence(result, "item-1", {
        imageFilename: "items-1.png",
        observationId: "observation-2",
      }),
    ).toBeNull();
  });
});
