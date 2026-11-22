import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "@jest/globals";
import {
  getStudentPortraitPresentation,
  HALO_ASSET_BASE_URL,
  HALO_PORTRAIT_ASSET_BASE_URL,
} from "~/models/student-image-policy";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("student portrait policy", () => {
  it("shows the in-game placeholder for unlisted students in both modes and keeps null students neutral", () => {
    const placeholder = { kind: "collection", src: "https://assets.mollulog.net/assets/images/students/-1" };
    expect(getStudentPortraitPresentation("unlisted", false)).toEqual(placeholder);
    expect(getStudentPortraitPresentation("unlisted", true)).toEqual(placeholder);
    expect(getStudentPortraitPresentation(null, true)).toEqual({ kind: "neutral" });
  });

  it("keeps collection art unchanged outside halo mode and provides a halo URL for every uid in halo mode", () => {
    expect(getStudentPortraitPresentation("fixture-halo", false)).toEqual({
      kind: "collection",
      src: "https://assets.baql.net/images/students/collection/fixture-halo.webp",
    });
    expect(getStudentPortraitPresentation("fixture-halo", true)).toEqual({
      kind: "concealed",
      src: `${HALO_PORTRAIT_ASSET_BASE_URL}/fixture-halo.webp`,
      haloSrc: `${HALO_ASSET_BASE_URL}/fixture-halo.webp`,
    });
    expect(getStudentPortraitPresentation("fixture-not-listed", true)).toEqual({
      kind: "concealed",
      src: `${HALO_PORTRAIT_ASSET_BASE_URL}/fixture-not-listed.webp`,
      haloSrc: `${HALO_ASSET_BASE_URL}/fixture-not-listed.webp`,
    });
    expect(getStudentPortraitPresentation("fixture-halo", false, "fixture-costume")).toEqual({
      kind: "collection",
      src: "https://assets.baql.net/images/students/collection/fixture-costume.webp",
    });
    expect(getStudentPortraitPresentation("fixture-halo", true, "fixture-costume")).toEqual({
      kind: "concealed",
      src: `${HALO_PORTRAIT_ASSET_BASE_URL}/fixture-costume.webp`,
      haloSrc: `${HALO_ASSET_BASE_URL}/fixture-halo.webp`,
    });
  });

  it("URL-encodes collection image keys for blurred portraits while keeping halo keys on the student uid", () => {
    expect(getStudentPortraitPresentation("student/fixture", true, "costume name")).toEqual({
      kind: "concealed",
      src: `${HALO_PORTRAIT_ASSET_BASE_URL}/costume%20name.webp`,
      haloSrc: `${HALO_ASSET_BASE_URL}/student%2Ffixture.webp`,
    });
  });

  it("routes every studentImageUrl consumer through the policy", () => {
    const appRoot = join(process.cwd(), "app");
    const violations = sourceFiles(appRoot)
      .filter((path) => relative(appRoot, path) !== "models/student-image-policy.ts")
      .filter((path) => relative(appRoot, path) !== "models/assets.ts")
      .filter((path) => /\bstudentImageUrl\s*\(/.test(readFileSync(path, "utf8")))
      .map((path) => relative(appRoot, path));

    expect(violations).toEqual([]);
  });

  it("keeps the v2 portrait independent from 1.x components", () => {
    const v2Portrait = readFileSync(
      join(process.cwd(), "app/components/v2/features/students/StudentPortrait.tsx"),
      "utf8",
    );

    expect(v2Portrait).not.toMatch(/from ["']~\/components\/(?!v2\/)/);
  });
});
