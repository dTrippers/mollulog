import { describe, expect, it } from "@jest/globals";
import { ScannerApiRequestError } from "~/routes/scanner._components/scanner-client";
import { STUDENT_SCANNER_ACCEPT_SPEC, validateScannerFiles } from "~/routes/scanner._components/scanner-upload";
import {
  getStudentUploadFailureReason,
  getStudentUploadPartialFailureForJob,
  getStudentUploadPartialFailureMessage,
  getStudentUploadQuotaError,
  type StudentUploadSubmissionOptions,
  selectLatestStudentJob,
  submitStudentUploadSelection,
} from "~/routes/scanner.student._components/StudentScanner";

function file(name: string, type: string, size = 1): File {
  return { name, type, size } as File;
}

const imageQuota = { limit: 50, used: 0, remaining: 50, nextAvailableAt: null };
const videoQuota = { limit: 10, used: 0, remaining: 10, nextAvailableAt: null };

const validateStudentFiles = (files: ReadonlyArray<File>) => validateScannerFiles(files, STUDENT_SCANNER_ACCEPT_SPEC);

describe("student scanner upload selection", () => {
  it("classifies image-only, video-only, and mixed input", () => {
    const image = file("student.png", "image/png");
    const secondImage = file("student-2.jpg", "image/jpeg");
    const video = file("students.mp4", "video/mp4");

    expect(validateStudentFiles([image, secondImage])).toEqual({
      images: [image, secondImage],
      video: null,
      error: null,
    });
    expect(validateStudentFiles([video])).toEqual({ images: [], video, error: null });
    expect(validateStudentFiles([image, video])).toEqual({ images: [image], video, error: null });
  });

  it("rejects contradictory MIME and extension evidence while preserving fallback classification", () => {
    expect(validateStudentFiles([file("students.mp4", "image/png")])).toEqual(
      expect.objectContaining({ error: "파일의 MIME 타입과 확장자가 일치하지 않아요. 파일을 확인해 주세요." }),
    );
    expect(validateStudentFiles([file("student.png", "video/mp4")])).toEqual(
      expect.objectContaining({ error: "파일의 MIME 타입과 확장자가 일치하지 않아요. 파일을 확인해 주세요." }),
    );

    const imageByMime = file("capture.bin", "image/png");
    const videoByMime = file("capture.bin", "video/mp4");
    const imageByExtension = file("capture.png", "");
    const videoByExtension = file("capture.mp4", "");
    expect(validateStudentFiles([imageByMime, imageByExtension])).toEqual({
      images: [imageByMime, imageByExtension],
      video: null,
      error: null,
    });
    expect(validateStudentFiles([videoByMime])).toEqual({ images: [], video: videoByMime, error: null });
    expect(validateStudentFiles([videoByExtension])).toEqual({
      images: [],
      video: videoByExtension,
      error: null,
    });
  });

  it("rejects a second video and unsupported files before submission", () => {
    expect(validateStudentFiles([file("students.mp4", "video/mp4"), file("students.mov", "video/quicktime")])).toEqual(
      expect.objectContaining({ error: "영상은 한 번에 한 개만 선택할 수 있어요." }),
    );
    expect(validateStudentFiles([file("students.gif", "image/gif")])).toEqual(
      expect.objectContaining({ error: "지원하는 파일은 PNG, JPEG, WebP 이미지와 MP4, MOV 영상이에요." }),
    );
  });

  it("keeps image and video size/count limits in the shared selection validator", () => {
    expect(
      validateStudentFiles(Array.from({ length: 31 }, (_, index) => file(`student-${index}.png`, "image/png"))),
    ).toEqual(expect.objectContaining({ error: "이미지는 1장부터 30장까지 선택할 수 있어요." }));
    expect(validateStudentFiles([file("large.png", "image/png", 10 * 1024 * 1024 + 1)])).toEqual(
      expect.objectContaining({ error: "이미지 한 장은 10MB를 넘을 수 없어요." }),
    );
    expect(validateStudentFiles([file("large.mp4", "video/mp4", 250 * 1024 * 1024 + 1)])).toEqual(
      expect.objectContaining({ error: "영상은 250MB를 넘을 수 없어요." }),
    );
  });

  it("reports each type's quota shortage before creating either job", () => {
    const selection = {
      images: [file("student.png", "image/png"), file("student-2.png", "image/png")],
      video: file("students.mp4", "video/mp4"),
    };

    expect(
      getStudentUploadQuotaError(selection, { ...imageQuota, remaining: 1 }, { ...videoQuota, remaining: 0 }),
    ).toBe(
      "이미지 업로드 가능 수가 부족해요. 최근 7일 동안 1장만 더 업로드할 수 있어요. 최근 7일 동안 업로드할 수 있는 영상 수를 모두 사용했어요. 잠시 후 다시 시도해 주세요.",
    );
    expect(getStudentUploadQuotaError(selection, imageQuota, videoQuota)).toBeNull();
  });

  it("explains partial success without hiding the successful job", () => {
    expect(getStudentUploadPartialFailureMessage([{ kind: "video" }])).toBe(
      "영상 제출에 실패했어요. 성공한 인식 작업은 계속 진행되고 최근 작업에서 확인할 수 있어요.",
    );
  });

  it("shows partial failure feedback only for its associated selected job", () => {
    const failure = { jobUid: "image-job", message: "일부 실패" };
    expect(getStudentUploadPartialFailureForJob(failure, "image-job")).toBe("일부 실패");
    expect(getStudentUploadPartialFailureForJob(failure, "video-job")).toBeNull();
    expect(getStudentUploadPartialFailureForJob(failure, null)).toBeNull();
  });

  it("keeps public hash/upload/API reasons and masks unknown partial failures", () => {
    expect(getStudentUploadFailureReason(new ScannerApiRequestError("영상 quota가 부족해요"))).toBe(
      "영상 quota가 부족해요",
    );
    expect(getStudentUploadFailureReason(new Error("파일 정보를 계산하지 못했어요"))).toBe(
      "파일 정보를 계산하지 못했어요",
    );
    expect(
      getStudentUploadFailureReason(
        new Error("파일 업로드에 실패했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요."),
      ),
    ).toBe("파일 업로드에 실패했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    expect(getStudentUploadFailureReason(new Error("internal stack trace"))).toBe(
      "파일 제출을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
    expect(
      getStudentUploadPartialFailureMessage([{ kind: "video", error: new Error("internal stack trace") }]),
    ).toContain("파일 제출을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
  });

  it("attempts the image branch when video hashing fails and preserves the fulfilled job", async () => {
    const image = file("student.png", "image/png", 10);
    const video = file("students.mp4", "video/mp4", 20);
    const requestCalls: Array<{ input: string; body: Record<string, unknown> | null }> = [];
    const uploadUrls: string[] = [];
    const requestJson: NonNullable<StudentUploadSubmissionOptions["requestJson"]> = async <T>(
      input: string,
      init?: RequestInit,
    ) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      requestCalls.push({ input, body });
      if (input === "/api/ocr/jobs" && body?.jobKind === "student_detail_images_v1") {
        return {
          jobUid: "image-job",
          quota: imageQuota,
          images: [{ imageUid: "image-uid", filename: image.name, uploadUrl: "image-url" }],
        } as T;
      }
      if (input === "/api/ocr/jobs/image-job/submit") {
        return { uid: "image-job", jobKind: "student_detail_images_v1" } as T;
      }
      throw new Error(`unexpected request: ${input}`);
    };
    const hashFile: NonNullable<StudentUploadSubmissionOptions["hashFile"]> = async (candidate) => {
      if (candidate === video) throw new Error("video read failed");
      return "image-hash";
    };
    const uploadFile: NonNullable<StudentUploadSubmissionOptions["uploadFile"]> = async ({ url, file, onProgress }) => {
      uploadUrls.push(url);
      onProgress?.(file.size);
    };

    const result = await submitStudentUploadSelection({ images: [image], video }, false, {
      hashFile,
      requestJson,
      uploadFile,
    });

    expect(result.successfulJobs.map(({ uid }) => uid)).toEqual(["image-job"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].kind).toBe("video");
    expect(result.failures[0].error).toEqual(new Error("video read failed"));
    expect(requestCalls.some(({ input }) => input === "/api/ocr/jobs/image-job/submit")).toBe(true);
    expect(uploadUrls).toEqual(["image-url"]);
  });

  it("submits both production branches and keeps images first when both fulfill", async () => {
    const image = file("student.png", "image/png", 10);
    const video = file("students.mp4", "video/mp4", 20);
    const requestCalls: Array<{ input: string; body: Record<string, unknown> | null }> = [];
    const requestJson: NonNullable<StudentUploadSubmissionOptions["requestJson"]> = async <T>(
      input: string,
      init?: RequestInit,
    ) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      requestCalls.push({ input, body });
      if (input === "/api/ocr/jobs" && body?.jobKind === "student_detail_images_v1") {
        return {
          jobUid: "image-job",
          quota: imageQuota,
          images: [{ imageUid: "image-uid", filename: image.name, uploadUrl: "image-url" }],
        } as T;
      }
      if (input === "/api/ocr/jobs" && body?.jobKind === "student_detail_video_v1") {
        return { jobUid: "video-job", quota: videoQuota, video: { uploadUrl: "video-url" } } as T;
      }
      if (input === "/api/ocr/jobs/image-job/submit") {
        return { uid: "image-job", jobKind: "student_detail_images_v1" } as T;
      }
      if (input === "/api/ocr/jobs/video-job/submit") {
        return { uid: "video-job", jobKind: "student_detail_video_v1" } as T;
      }
      throw new Error(`unexpected request: ${input}`);
    };
    const hashFile: NonNullable<StudentUploadSubmissionOptions["hashFile"]> = async (candidate) =>
      `${candidate.name}-hash`;
    const uploadFile: NonNullable<StudentUploadSubmissionOptions["uploadFile"]> = async () => undefined;

    const result = await submitStudentUploadSelection({ images: [image], video }, true, {
      hashFile,
      requestJson,
      uploadFile,
    });

    expect(
      requestCalls.map(({ body }) => body?.jobKind).filter((jobKind): jobKind is string => typeof jobKind === "string"),
    ).toEqual(expect.arrayContaining(["student_detail_images_v1", "student_detail_video_v1"]));
    expect(result.failures).toEqual([]);
    expect(result.successfulJobs.map(({ uid }) => uid)).toEqual(["image-job", "video-job"]);
  });

  it("opens the newest successful job and prefers the video job when timestamps tie", () => {
    const imageJob = { createdAt: "2026-08-22T00:00:00.000Z", jobKind: "student_detail_images_v1" as const };
    const videoJob = { createdAt: "2026-08-22T00:00:00.000Z", jobKind: "student_detail_video_v1" as const };
    const olderJob = { createdAt: "2026-08-21T00:00:00.000Z", jobKind: "student_detail_images_v1" as const };

    expect(selectLatestStudentJob([olderJob, imageJob])).toBe(imageJob);
    expect(selectLatestStudentJob([imageJob, videoJob])).toBe(videoJob);
    expect(selectLatestStudentJob([videoJob, imageJob])).toBe(videoJob);
  });
});
