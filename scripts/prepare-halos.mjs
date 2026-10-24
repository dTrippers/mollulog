import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIRECTORY = resolve(SCRIPT_DIRECTORY, "../tmp/halos");
const PORTRAIT_OUTPUT_DIRECTORY = resolve(SCRIPT_DIRECTORY, "../tmp/halo-portraits");
const BAQL_GRAPHQL_URL = "https://api.baql.net/graphql";
const STUDENT_QUERY = "query HaloStudents { students { uid name schaleDbId } }";
const COLLECTION_IMAGE_BASE_URL = "https://assets.baql.net/images/students/collection";
export const HALO_PORTRAIT_WIDTH = 64;
export const HALO_PORTRAIT_HEIGHT = Math.round(HALO_PORTRAIT_WIDTH * (226 / 200));
export const HALO_PORTRAIT_ZOOM = 1.35;
// The old 14cqi CSS blur was scaled with the frame: 0.14 × 1.35 = 0.189 of its width.
export const HALO_PORTRAIT_BLUR_RATIO = 0.14 * HALO_PORTRAIT_ZOOM;
const PORTRAIT_FETCH_CONCURRENCY = 6;
const MAX_HALO_OUTPUT_SIZE = 512;
const HALO_MARGIN_RATIO = 0.063;
const HALO_GLOW_BLUR_RATIO = 0.017;
const HALO_GLOW_OPACITY = 0.6;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

export function haloPortraitSourceUrl(uid) {
  return `${COLLECTION_IMAGE_BASE_URL}/${encodeURIComponent(uid)}.webp`;
}

export function haloPortraitOutputFilename(uid) {
  return `${encodeURIComponent(uid)}.webp`;
}

export function calculateHaloPortraitCrop(
  sourceWidth,
  sourceHeight,
  { outputWidth = HALO_PORTRAIT_WIDTH, outputHeight = HALO_PORTRAIT_HEIGHT, zoom = HALO_PORTRAIT_ZOOM } = {},
) {
  if (![sourceWidth, sourceHeight, outputWidth, outputHeight, zoom].every(Number.isFinite)) {
    throw new Error("Portrait crop dimensions and zoom must be finite numbers");
  }
  if (sourceWidth < 1 || sourceHeight < 1 || outputWidth < 1 || outputHeight < 1 || zoom < 1) {
    throw new Error("Portrait crop dimensions must be positive and zoom must be at least 1");
  }

  const targetAspect = outputWidth / outputHeight;
  let coverWidth;
  let coverHeight;
  if (sourceWidth / sourceHeight > targetAspect) {
    coverHeight = sourceHeight;
    coverWidth = Math.max(1, Math.round(sourceHeight * targetAspect));
  } else {
    coverWidth = sourceWidth;
    coverHeight = Math.max(1, Math.round(sourceWidth / targetAspect));
  }
  const coverLeft = Math.floor((sourceWidth - coverWidth) / 2);
  const coverTop = Math.floor((sourceHeight - coverHeight) / 2);
  const width = Math.max(1, Math.floor(coverWidth / zoom));
  const height = Math.max(1, Math.floor(width / targetAspect));
  return {
    left: coverLeft + Math.floor((coverWidth - width) / 2),
    top: coverTop + Math.floor((coverHeight - height) / 2),
    width,
    height,
    cover: { left: coverLeft, top: coverTop, width: coverWidth, height: coverHeight },
  };
}

export async function renderHaloPortrait(input, sharpFactory) {
  const { data, info } = await sharpFactory(input)
    .rotate()
    .toColourspace("srgb")
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.channels < 3) throw new Error("Portrait image has no readable pixels");

  const crop = calculateHaloPortraitCrop(info.width, info.height);
  const sigma = HALO_PORTRAIT_WIDTH * HALO_PORTRAIT_BLUR_RATIO;
  const edgePadding = Math.ceil(sigma * 3);
  const padded = await sharpFactory(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
    .resize(HALO_PORTRAIT_WIDTH, HALO_PORTRAIT_HEIGHT, { fit: "fill" })
    .extend({
      top: edgePadding,
      bottom: edgePadding,
      left: edgePadding,
      right: edgePadding,
      extendWith: "copy",
    })
    .png()
    .toBuffer();
  return sharpFactory(padded)
    .blur(sigma)
    .extract({ left: edgePadding, top: edgePadding, width: HALO_PORTRAIT_WIDTH, height: HALO_PORTRAIT_HEIGHT })
    .webp({ lossless: true })
    .toBuffer();
}

export async function generateHaloPortraits(
  students,
  {
    fetchImpl = fetch,
    sharpFactory,
    outputDirectory = PORTRAIT_OUTPUT_DIRECTORY,
    concurrency = PORTRAIT_FETCH_CONCURRENCY,
  } = {},
) {
  if (!sharpFactory) {
    const importedSharp = await import("sharp");
    sharpFactory = importedSharp.default;
  }
  await mkdir(outputDirectory, { recursive: true });
  const uniqueStudents = [...new Map(
    students
      .map((student) => ({ ...student, uid: typeof student.uid === "string" ? student.uid.trim() : "" }))
      .filter((student) => student.uid)
      .map((student) => [student.uid, student]),
  ).values()];
  const generated = [];
  const failed = [];
  let cursor = 0;

  async function worker() {
    while (cursor < uniqueStudents.length) {
      const student = uniqueStudents[cursor];
      cursor += 1;
      const fileName = haloPortraitOutputFilename(student.uid);
      try {
        const response = await fetchImpl(haloPortraitSourceUrl(student.uid));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const source = Buffer.from(await response.arrayBuffer());
        const output = await renderHaloPortrait(source, sharpFactory);
        await writeFile(join(outputDirectory, fileName), output);
        generated.push({ uid: student.uid, fileName, bytes: output.byteLength });
      } catch (error) {
        failed.push({
          uid: student.uid,
          fileName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const workerCount = Math.min(uniqueStudents.length, Math.max(1, Math.floor(concurrency)));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  generated.sort((left, right) => left.uid.localeCompare(right.uid, "en", { numeric: true }));
  failed.sort((left, right) => left.uid.localeCompare(right.uid, "en", { numeric: true }));
  const report = { generated, failed };
  await writeFile(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export const FANDOM_NAME_OVERRIDES = new Map([
  ["aris", "Alice"],
  ["hatsune", "Miku"],
  ["shiroko", "Shiroko"],
  ["shiroko_terror", "Shiroko Terror"],
  ["misaka", "Misaka Mikoto"],
  ["shokuhou", "Shokuhou Misaki"],
  ["saten", "Saten Ruiko"],
]);

export const KOREAN_NAME_ALIASES = new Map([
  ["안나", "anna"],
  ["에리나", "erina"],
  ["츠무기", "tsumugi"],
  ["코코로", "kokoro"],
  ["코토네", "kotone"],
]);

export function normalizeAssetName(value) {
  return value
    .normalize("NFKC")
    .replace(/\.[^.]+$/, "")
    .replace(/halo/gi, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("en");
}

export function characterKeyOf(schaleDbId) {
  if (typeof schaleDbId !== "string") return null;
  const fullId = schaleDbId.trim().toLocaleLowerCase("en");
  if (!fullId) return null;
  if (FANDOM_NAME_OVERRIDES.has(fullId)) return fullId;
  const baseKey = fullId.split("_", 1)[0];
  return baseKey || null;
}

function normalizedStudentName(name) {
  return typeof name === "string" ? name.normalize("NFKC").trim() : "";
}

function stripTrailingCostumeSuffix(name) {
  const match = name.match(/^(.*?)\s*\([^()]*\)$/u);
  return match?.[1]?.trim() || null;
}

function characterKeyForStudent(student, studentsByBaseName) {
  if (typeof student.schaleDbId === "string" && student.schaleDbId.trim()) {
    const characterKey = characterKeyOf(student.schaleDbId);
    return characterKey ? { characterKey } : { reason: "invalid-schale-db-id" };
  }

  const name = normalizedStudentName(student.name);
  if (!name) return { reason: "missing-student-name" };

  const baseName = stripTrailingCostumeSuffix(name);
  if (baseName) {
    const candidates = studentsByBaseName.get(baseName) ?? [];
    if (candidates.length === 1) {
      return { characterKey: characterKeyOf(candidates[0].schaleDbId), mappingSource: "base-name" };
    }
    if (candidates.length > 1) {
      return {
        reason: "ambiguous-base-name",
        baseName,
        candidateUids: candidates.map((candidate) => candidate.uid).sort(),
      };
    }
  }

  const aliasName = KOREAN_NAME_ALIASES.get(baseName ?? name);
  if (aliasName) return { characterKey: aliasName, mappingSource: "korean-alias" };
  return { reason: "unmapped-korean-name", baseName: baseName ?? name };
}

function fandomPageUrl(name) {
  return `https://bluearchive.fandom.com/wiki/${encodeURIComponent(name.replaceAll(" ", "_"))}`;
}

function expectedFandomFileNames(name) {
  return [`${name}_Halo.webp`, `${name} Halo.png`, `${name}.png`, `${name}.webp`, `Halo ${name}.png`, `Halo ${name}.webp`];
}

function defaultFandomName(characterKey) {
  return characterKey.replace(/^./, (first) => first.toLocaleUpperCase("en"));
}

export async function writeHaloOutputFiles(outputDirectory, report) {
  const resolvedUids = [...new Set(report.resolved.flatMap((entry) => entry.convertedUids))].sort();
  const downloadList = report.missingFile.map(
    ({ characterKey, uids, names, schaleDbIds, fandomName, pageUrl, expectedFileNames }) => ({
      characterKey,
      uids,
      names,
      schaleDbIds,
      fandomName,
      pageUrl,
      expectedFileNames,
    }),
  );

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(outputDirectory, "uids.json"), `${JSON.stringify(resolvedUids, null, 2)}\n`),
    writeFile(join(outputDirectory, "download-list.json"), `${JSON.stringify(downloadList, null, 2)}\n`),
    writeFile(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`),
  ]);

  return resolvedUids;
}

export async function normalizeHaloImage(input, sharpFactory) {
  const { data: pixels, info } = await sharpFactory(input)
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height || channels !== 4) throw new Error("Halo image has no readable RGBA pixels");

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    if (pixels[pixelIndex * channels + 3] === 0) continue;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) throw new Error("Halo image has no visible pixels after trimming");

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmedBuffer = await sharpFactory(pixels, { raw: { width, height, channels } })
    .extract({ left: minX, top: minY, width: trimmedWidth, height: trimmedHeight })
    .png()
    .toBuffer();

  const longestSide = Math.max(trimmedWidth, trimmedHeight);
  const blurSigma = longestSide * HALO_GLOW_BLUR_RATIO;
  const glowPadding = Math.ceil(blurSigma * 3);
  const paddedWidth = trimmedWidth + glowPadding * 2;
  const paddedHeight = trimmedHeight + glowPadding * 2;
  const alphaPixels = Buffer.alloc(paddedWidth * paddedHeight);
  for (let y = 0; y < trimmedHeight; y += 1) {
    for (let x = 0; x < trimmedWidth; x += 1) {
      const sourceOffset = ((minY + y) * width + minX + x) * channels + 3;
      alphaPixels[(y + glowPadding) * paddedWidth + x + glowPadding] = pixels[sourceOffset];
    }
  }

  const { data: blurredAlpha, info: blurredAlphaInfo } = await sharpFactory(alphaPixels, {
    raw: { width: paddedWidth, height: paddedHeight, channels: 1 },
  })
    .greyscale()
    .blur(blurSigma)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (blurredAlphaInfo.channels !== 1) throw new Error("Halo glow blur did not produce a single alpha channel");
  const glowPixels = Buffer.alloc(paddedWidth * paddedHeight * 4);
  for (let pixelIndex = 0; pixelIndex < blurredAlpha.length; pixelIndex += 1) {
    glowPixels[pixelIndex * 4 + 3] = Math.round(blurredAlpha[pixelIndex] * HALO_GLOW_OPACITY);
  }
  const haloOnPaddedCanvas = await sharpFactory(trimmedBuffer)
    .extend({
      top: glowPadding,
      bottom: glowPadding,
      left: glowPadding,
      right: glowPadding,
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
  const glowLayer = await sharpFactory(glowPixels, {
    raw: { width: paddedWidth, height: paddedHeight, channels: 4 },
  })
    .png()
    .toBuffer();
  const haloWithGlow = await sharpFactory(glowLayer)
    .composite([{ input: haloOnPaddedCanvas, blend: "over" }])
    .png()
    .toBuffer();

  const margin = Math.ceil(longestSide * HALO_MARGIN_RATIO);
  const canvasSize = longestSide + margin * 2;
  if (canvasSize < paddedWidth || canvasSize < paddedHeight) {
    throw new Error("Halo glow does not fit inside the normalized canvas");
  }
  const left = Math.floor((canvasSize - paddedWidth) / 2);
  const top = Math.floor((canvasSize - paddedHeight) / 2);

  const squareCanvas = await sharpFactory(haloWithGlow)
    .extend({
      top,
      bottom: canvasSize - paddedHeight - top,
      left,
      right: canvasSize - paddedWidth - left,
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();

  return sharpFactory(squareCanvas)
    .resize({
      width: MAX_HALO_OUTPUT_SIZE,
      height: MAX_HALO_OUTPUT_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90 })
    .toBuffer();
}

export function mapStudentsToFandomAssets(students, pngFiles) {
  const files = pngFiles
    .filter((path) => [".png", ".webp"].includes(extname(path).toLowerCase()))
    .map((path) => ({ path, name: basename(path), normalized: normalizeAssetName(basename(path)) }));
  const groups = new Map();
  const mappingFailed = [];
  const studentsByBaseName = new Map();

  for (const student of students) {
    const uid = typeof student.uid === "string" ? student.uid.trim() : "";
    const schaleDbId = typeof student.schaleDbId === "string" ? student.schaleDbId.trim() : "";
    const name = normalizedStudentName(student.name);
    if (!uid || !schaleDbId || !name || stripTrailingCostumeSuffix(name)) continue;
    const candidates = studentsByBaseName.get(name) ?? [];
    candidates.push({ uid, schaleDbId });
    studentsByBaseName.set(name, candidates);
  }

  for (const student of students) {
    const uid = typeof student.uid === "string" ? student.uid.trim() : "";
    const { characterKey, reason, baseName, candidateUids, mappingSource } = characterKeyForStudent(
      student,
      studentsByBaseName,
    );
    if (!uid || !characterKey) {
      mappingFailed.push({
        status: "mapping-failed",
        uid: uid || null,
        name: normalizedStudentName(student.name) || null,
        schaleDbId: student.schaleDbId ?? null,
        ...(baseName ? { baseName } : {}),
        ...(candidateUids ? { candidateUids } : {}),
        reason: !uid ? "missing-student-uid" : reason,
      });
      continue;
    }

    const group =
      groups.get(characterKey) ?? { characterKey, uids: [], names: [], schaleDbIds: [], mappingSources: [] };
    group.uids.push(uid);
    const name = normalizedStudentName(student.name);
    if (name) group.names.push(name);
    if (typeof student.schaleDbId === "string" && student.schaleDbId.trim()) {
      group.schaleDbIds.push(student.schaleDbId.trim());
    }
    if (mappingSource) group.mappingSources.push(mappingSource);
    groups.set(characterKey, group);
  }

  const entries = [...groups.values()].map((group) => {
    const fandomName = FANDOM_NAME_OVERRIDES.get(group.characterKey) ?? defaultFandomName(group.characterKey);
    const normalizedName = normalizeAssetName(fandomName);
    const pageUrl = fandomPageUrl(fandomName);
    const matches = files.filter((file) => file.normalized === normalizedName);
    const uids = [...new Set(group.uids)].sort();

    if (matches.length > 1) {
      return {
        status: "mapping-failed",
        characterKey: group.characterKey,
        uids,
        names: [...new Set(group.names)].sort(),
        schaleDbIds: [...new Set(group.schaleDbIds)].sort(),
        mappingSources: [...new Set(group.mappingSources)].sort(),
        fandomName,
        pageUrl,
        fileNames: matches.map((file) => file.name).sort(),
        reason: "ambiguous-local-files",
      };
    }
    if (matches.length === 0) {
      return {
        status: "missing-file",
        characterKey: group.characterKey,
        uids,
        names: [...new Set(group.names)].sort(),
        schaleDbIds: [...new Set(group.schaleDbIds)].sort(),
        mappingSources: [...new Set(group.mappingSources)].sort(),
        fandomName,
        pageUrl,
        expectedFileNames: expectedFandomFileNames(fandomName),
      };
    }

    return {
      status: "resolved",
      characterKey: group.characterKey,
      uids,
      names: [...new Set(group.names)].sort(),
      schaleDbIds: [...new Set(group.schaleDbIds)].sort(),
      mappingSources: [...new Set(group.mappingSources)].sort(),
      fandomName,
      pageUrl,
      fileName: matches[0].name,
      filePath: matches[0].path,
    };
  });

  return [...entries, ...mappingFailed];
}

async function fetchStudents(fetchImpl = fetch) {
  const response = await fetchImpl(BAQL_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: STUDENT_QUERY }),
  });
  if (!response.ok) throw new Error(`BAQL returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !Array.isArray(result.data?.students)) {
    throw new Error("BAQL student query did not return a student list");
  }
  return result.data.students;
}

function readPngDirectoryArgument(argv) {
  const index = argv.indexOf("--png-dir");
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value) throw new Error("Usage: node scripts/prepare-halos.mjs --png-dir <local-png-directory>");
  return resolve(value);
}

async function main(argv = process.argv.slice(2)) {
  const pngDirectory = readPngDirectoryArgument(argv);
  const portraitMode = argv.includes("--portraits");
  if (!portraitMode && !pngDirectory) {
    throw new Error("Usage: node scripts/prepare-halos.mjs --png-dir <local-png-directory> [--portraits]");
  }
  const students = await fetchStudents();
  const { default: sharp } = await import("sharp");
  if (portraitMode) {
    const portraitReport = await generateHaloPortraits(students, { sharpFactory: sharp });
    process.stdout.write(
      `${JSON.stringify(
        {
          outputDirectory: PORTRAIT_OUTPUT_DIRECTORY,
          generatedCount: portraitReport.generated.length,
          failedCount: portraitReport.failed.length,
          report: portraitReport,
        },
        null,
        2,
      )}\n`,
    );
  }

  if (pngDirectory) {
    const filenames = await readdir(pngDirectory);
    const planned = mapStudentsToFandomAssets(students, filenames.map((filename) => join(pngDirectory, filename)));
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const resolved = [];
    const conversionFailed = [];
    for (const entry of planned.filter((item) => item.status === "resolved")) {
      try {
        const converted = [];
        for (const uid of entry.uids) {
          const normalizedImage = await normalizeHaloImage(entry.filePath, sharp);
          await writeFile(join(OUTPUT_DIRECTORY, `${uid}.webp`), normalizedImage);
          converted.push(uid);
        }
        resolved.push({ ...entry, convertedUids: converted });
      } catch (error) {
        conversionFailed.push({ ...entry, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const missingFile = planned.filter((entry) => entry.status === "missing-file");
    const mappingFailed = planned.filter((entry) => entry.status === "mapping-failed");
    const report = { resolved, missingFile, mappingFailed, conversionFailed };
    const resolvedUids = await writeHaloOutputFiles(OUTPUT_DIRECTORY, report);
    process.stdout.write(`${JSON.stringify({ outputDirectory: OUTPUT_DIRECTORY, report }, null, 2)}\n`);
    return resolvedUids;
  }

  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
