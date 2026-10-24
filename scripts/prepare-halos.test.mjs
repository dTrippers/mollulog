import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  characterKeyOf,
  calculateHaloPortraitCrop,
  HALO_PORTRAIT_BLUR_RATIO,
  HALO_PORTRAIT_HEIGHT,
  HALO_PORTRAIT_WIDTH,
  haloPortraitOutputFilename,
  haloPortraitSourceUrl,
  mapStudentsToFandomAssets,
  normalizeAssetName,
  normalizeHaloImage,
  renderHaloPortrait,
  writeHaloOutputFiles,
} from "./prepare-halos.mjs";

test("calculates a cover crop and centered 1.35x zoom for a wide portrait source", () => {
  const crop = calculateHaloPortraitCrop(1000, 500);

  assert.deepEqual(crop.cover, { left: 278, top: 0, width: 444, height: 500 });
  assert.deepEqual(crop, {
    left: 336,
    top: 65,
    width: 328,
    height: 369,
    cover: { left: 278, top: 0, width: 444, height: 500 },
  });
  assert.equal(HALO_PORTRAIT_WIDTH, 64);
  assert.equal(HALO_PORTRAIT_HEIGHT, 72);
  assert.ok(Math.abs(HALO_PORTRAIT_BLUR_RATIO - 0.189) < 1e-12);
  assert.ok(Math.abs(HALO_PORTRAIT_WIDTH * HALO_PORTRAIT_BLUR_RATIO - 12.096) < 1e-9);
});

test("renders 64x72 pre-blurred portraits as lossless WebP", async () => {
  const source = await sharp({ create: { width: 200, height: 226, channels: 3, background: "#527896" } })
    .webp()
    .toBuffer();
  const output = await renderHaloPortrait(source, sharp);
  const metadata = await sharp(output).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 64);
  assert.equal(metadata.height, 72);
  assert.equal(output.toString("ascii", 12, 16), "VP8L", "VP8L identifies lossless WebP encoding");
});

test("builds encoded BAQL source URLs and output keys from collection image uids", () => {
  assert.equal(
    haloPortraitSourceUrl("costume name/1"),
    "https://assets.baql.net/images/students/collection/costume%20name%2F1.webp",
  );
  assert.equal(haloPortraitOutputFilename("costume name/1"), "costume%20name%2F1.webp");
});

async function transparentImage(width, height, { x, y, contentWidth, contentHeight, faintEdge = false }) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = y; row < y + contentHeight; row += 1) {
    for (let column = x; column < x + contentWidth; column += 1) {
      const offset = (row * width + column) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 120;
      pixels[offset + 2] = 40;
      pixels[offset + 3] = 255;
    }
  }
  if (faintEdge) {
    const offset = (y + Math.floor(contentHeight / 2)) * width * 4 + (x - 1) * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 24;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function opaqueContentBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;
    if (data[offset + 3] < 220 || data[offset] < 80) continue;
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    pixels: data,
    channels: info.channels,
  };
}

test("normalizes PNG and WebP filenames with optional halo suffixes", () => {
  assert.equal(normalizeAssetName("Aru_Halo.webp"), "aru");
  assert.equal(normalizeAssetName("Aru Halo.png"), "aru");
  assert.equal(normalizeAssetName("Aru.png"), "aru");
  assert.equal(characterKeyOf("hoshino_battle_tank"), "hoshino");
  assert.equal(characterKeyOf("shiroko_terror"), "shiroko_terror");
});

test("trims a wide transparent source, centers it, and keeps a soft glow inside the padded square", async () => {
  const input = await transparentImage(1000, 500, {
    x: 340,
    y: 80,
    contentWidth: 320,
    contentHeight: 240,
    faintEdge: true,
  });
  const output = await normalizeHaloImage(input, sharp);
  const metadata = await sharp(output).metadata();
  const content = await opaqueContentBounds(output);
  const fill = Math.max(content.width, content.height) / metadata.width;

  assert.equal(metadata.width, metadata.height);
  assert.equal(metadata.width, 363, "the new uniform margin keeps the halo content near 89% fill");
  assert.ok(fill >= 0.88 && fill <= 0.9, `expected about 89% content fill, got ${fill}`);
  assert.equal(content.width, 320);
  assert.ok(Math.abs(content.left - (metadata.width - content.width) / 2) <= 1);
  assert.ok(Math.abs(content.top - (metadata.height - content.height) / 2) <= 1);

  const pixelAt = (x, y) => {
    const offset = (y * metadata.width + x) * content.channels;
    return [...content.pixels.subarray(offset, offset + content.channels)];
  };
  const midline = content.top + Math.floor(content.height / 2);
  const faintEdge = pixelAt(content.left - 1, midline);
  const darkGlow = pixelAt(content.left - 2, midline);
  assert.ok(faintEdge[3] > 0 && faintEdge[0] + faintEdge[1] + faintEdge[2] > 0, "faint source alpha survives trim");
  assert.ok(darkGlow[3] > 0 && darkGlow[0] + darkGlow[1] + darkGlow[2] < 50, "the dark glow extends beyond the halo");
  const sideGlowAlphas = Array.from({ length: content.height - 40 }, (_, index) =>
    pixelAt(content.left - 2, content.top + 20 + index)[3],
  );
  assert.ok(
    Math.max(...sideGlowAlphas) - Math.min(...sideGlowAlphas) <= 4,
    "the glow opacity stays even along a straight halo edge",
  );
  for (let edge = 0; edge < metadata.width; edge += 1) {
    assert.equal(pixelAt(edge, 0)[3], 0, "the glow does not touch the top edge");
    assert.equal(pixelAt(edge, metadata.height - 1)[3], 0, "the glow does not touch the bottom edge");
    assert.equal(pixelAt(0, edge)[3], 0, "the glow does not touch the left edge");
    assert.equal(pixelAt(metadata.width - 1, edge)[3], 0, "the glow does not touch the right edge");
  }
});

test("preserves the aspect ratio of a tight source and caps large outputs at 512px", async () => {
  const originalAspectRatio = 1180 / 580;
  const input = await transparentImage(1200, 600, {
    x: 10,
    y: 10,
    contentWidth: 1180,
    contentHeight: 580,
  });
  const output = await normalizeHaloImage(input, sharp);
  const metadata = await sharp(output).metadata();
  const content = await opaqueContentBounds(output);
  const normalizedAspectRatio = content.width / content.height;
  const fill = Math.max(content.width, content.height) / metadata.width;

  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.ok(Math.abs(normalizedAspectRatio - originalAspectRatio) < 0.02);
  assert.ok(fill >= 0.88 && fill <= 0.9, `expected about 89% content fill, got ${fill}`);
});

test("expands one character halo file to every schaleDbId variant", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "10021", name: "아루", schaleDbId: "aru" },
      { uid: "10031", name: "아루(새해)", schaleDbId: "aru_newyear" },
      { uid: "10072", name: "아루(드레스)", schaleDbId: "aru_dress" },
    ],
    ["/png/Aru_Halo.webp"],
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].status, "resolved");
  assert.equal(result[0].characterKey, "aru");
  assert.deepEqual(result[0].uids, ["10021", "10031", "10072"]);
  assert.equal(result[0].fileName, "Aru_Halo.webp");
});

test("uses explicit Fandom-name overrides for verified SchaleDB character keys", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "10015", name: "아리스", schaleDbId: "aris" },
      { uid: "20007", name: "하츠네 미쿠", schaleDbId: "hatsune_miku" },
      { uid: "10100", name: "시로코*테러", schaleDbId: "shiroko_terror" },
    ],
    ["Alice.png", "Miku.webp", "Shiroko Terror Halo.png"],
  );

  assert.deepEqual(result.map(({ status }) => status), ["resolved", "resolved", "resolved"]);
  assert.deepEqual(result.map(({ fandomName }) => fandomName), ["Alice", "Miku", "Shiroko Terror"]);
});

test("maps Shiroko variants separately from Shiroko Terror", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "10010", name: "시로코", schaleDbId: "shiroko" },
      { uid: "10024", name: "시로코(라이딩)", schaleDbId: "shiroko_cycling" },
      { uid: "10100", name: "시로코*테러", schaleDbId: "shiroko_terror" },
      { uid: "20027", name: "시로코(수영복)", schaleDbId: "shiroko_swimsuit" },
    ],
    ["Shiroko_Halo.png", "Shiroko_Terror_Halo.png"],
  );

  assert.deepEqual(
    result.map(({ characterKey, uids, fileName }) => ({ characterKey, uids, fileName })),
    [
      { characterKey: "shiroko", uids: ["10010", "10024", "20027"], fileName: "Shiroko_Halo.png" },
      { characterKey: "shiroko_terror", uids: ["10100"], fileName: "Shiroko_Terror_Halo.png" },
    ],
  );
});

test("uses Railgun collaboration Fandom-name overrides", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "10079", name: "미사카 미코토", schaleDbId: "misaka_mikoto" },
      { uid: "10080", name: "쇼쿠호 미사키", schaleDbId: "shokuhou_misaki" },
      { uid: "26011", name: "사텐 루이코", schaleDbId: "saten_ruiko" },
    ],
    ["Misaka_Mikoto_Halo.png", "Shokuhou_Misaki_Halo.png", "Saten_Ruiko_Halo.png"],
  );

  assert.deepEqual(
    result.map(({ status, uids, fandomName, fileName }) => ({ status, uids, fandomName, fileName })),
    [
      { status: "resolved", uids: ["10079"], fandomName: "Misaka Mikoto", fileName: "Misaka_Mikoto_Halo.png" },
      { status: "resolved", uids: ["10080"], fandomName: "Shokuhou Misaki", fileName: "Shokuhou_Misaki_Halo.png" },
      { status: "resolved", uids: ["26011"], fandomName: "Saten Ruiko", fileName: "Saten_Ruiko_Halo.png" },
    ],
  );
});

test("maps no-id costume variants through a unique Korean base-name match", () => {
  const baseStudents = [
    { uid: "20033", name: "마코토", schaleDbId: "makoto" },
    { uid: "20040", name: "사츠키", schaleDbId: "satsuki" },
    { uid: "20016", name: "이로하", schaleDbId: "iroha" },
    { uid: "16014", name: "이부키", schaleDbId: "ibuki" },
    { uid: "10022", name: "카스미", schaleDbId: "kasumi" },
    { uid: "10107", name: "치아키", schaleDbId: "chiaki" },
  ];
  const costumeStudents = [
    { uid: "10146", name: "마코토(수영복)" },
    { uid: "10147", name: "사츠키(수영복)" },
    { uid: "10148", name: "이로하(수영복)" },
    { uid: "20060", name: "이부키(수영복)" },
    { uid: "20061", name: "카스미(수영복)" },
    { uid: "26016", name: "치아키(수영복)" },
  ];
  const result = mapStudentsToFandomAssets(
    [...baseStudents, ...costumeStudents],
    ["Makoto_Halo.png", "Satsuki_Halo.png", "Iroha_Halo.png", "Ibuki_Halo.png", "Kasumi_Halo.png", "Chiaki_Halo.png"],
  );

  for (const student of costumeStudents) {
    const entry = result.find((candidate) => candidate.names.includes(student.name));
    assert.equal(entry.status, "resolved");
    assert.ok(entry.uids.includes(student.uid));
    assert.deepEqual(entry.mappingSources, ["base-name"]);
  }
});

test("uses the approved Korean-name aliases when no base-name match exists", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "10149", name: "코코로" },
      { uid: "10150", name: "코토네" },
      { uid: "10152", name: "츠무기" },
      { uid: "10151", name: "안나" },
      { uid: "20062", name: "에리나" },
    ],
    ["Kokoro_Halo.png", "Kotone_Halo.png", "Tsumugi_Halo.png"],
  );

  assert.deepEqual(
    result.map(({ status, uids, names, fandomName }) => ({ status, uids, names, fandomName })),
    [
      { status: "resolved", uids: ["10149"], names: ["코코로"], fandomName: "Kokoro" },
      { status: "resolved", uids: ["10150"], names: ["코토네"], fandomName: "Kotone" },
      { status: "resolved", uids: ["10152"], names: ["츠무기"], fandomName: "Tsumugi" },
      { status: "missing-file", uids: ["10151"], names: ["안나"], fandomName: "Anna" },
      { status: "missing-file", uids: ["20062"], names: ["에리나"], fandomName: "Erina" },
    ],
  );
});

test("reports an ambiguous Korean base-name match as mapping-failed", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "base-a", name: "미나", schaleDbId: "mina" },
      { uid: "base-b", name: "미나", schaleDbId: "mina_newyear" },
      { uid: "variant", name: "미나(수영복)" },
    ],
    ["Mina_Halo.png"],
  );
  const failedVariant = result.find((entry) => entry.uid === "variant");

  assert.equal(failedVariant.status, "mapping-failed");
  assert.equal(failedVariant.name, "미나(수영복)");
  assert.equal(failedVariant.reason, "ambiguous-base-name");
  assert.deepEqual(failedVariant.candidateUids, ["base-a", "base-b"]);
});

test("reports one missing-file entry for each missing character key and all covered uids", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "10022", name: "카요코", schaleDbId: "kayoko" },
      { uid: "10088", name: "카요코(드레스)", schaleDbId: "kayoko_dress" },
      { uid: "10098", name: "호시노(무장)", schaleDbId: "hoshino_battle_tank" },
    ],
    [],
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].status, "missing-file");
  assert.equal(result[0].characterKey, "kayoko");
  assert.deepEqual(result[0].uids, ["10022", "10088"]);
  assert.ok(result[0].expectedFileNames.includes("Kayoko_Halo.webp"));
  assert.deepEqual(result[1].uids, ["10098"]);
});

test("reports ambiguous normalized filenames once per character key", () => {
  const result = mapStudentsToFandomAssets(
    [
      { uid: "10021", schaleDbId: "aru" },
      { uid: "10031", schaleDbId: "aru_newyear" },
    ],
    ["Aru_Halo.webp", "Aru.png"],
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].status, "mapping-failed");
  assert.equal(result[0].reason, "ambiguous-local-files");
  assert.deepEqual(result[0].uids, ["10021", "10031"]);
  assert.deepEqual(result[0].fileNames, ["Aru.png", "Aru_Halo.webp"]);
});

test("reports unrecognized students without a SchaleDB identifier with their Korean name", () => {
  const result = mapStudentsToFandomAssets([{ uid: "fixture", name: "아루" }], ["Aru_Halo.webp"]);

  assert.equal(result[0].status, "mapping-failed");
  assert.equal(result[0].reason, "unmapped-korean-name");
  assert.equal(result[0].name, "아루");
});

test("writes uid bookkeeping, download list, and report inside the output directory", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "prepare-halos-"));
  const report = {
    resolved: [
      { convertedUids: ["10021", "10031"] },
      { convertedUids: ["10021"] },
    ],
    missingFile: [
      {
        characterKey: "anna",
        uids: ["10151"],
        names: ["안나"],
        schaleDbIds: [],
        fandomName: "Anna",
        pageUrl: "https://bluearchive.fandom.com/wiki/Anna",
        expectedFileNames: ["Anna_Halo.png"],
      },
    ],
    mappingFailed: [],
    conversionFailed: [],
  };

  try {
    const resolvedUids = await writeHaloOutputFiles(outputDirectory, report);
    assert.deepEqual(resolvedUids, ["10021", "10031"]);
    assert.deepEqual((await readdir(outputDirectory)).sort(), ["download-list.json", "report.json", "uids.json"]);
    assert.deepEqual(JSON.parse(await readFile(join(outputDirectory, "uids.json"), "utf8")), resolvedUids);
    assert.equal(JSON.parse(await readFile(join(outputDirectory, "download-list.json"), "utf8"))[0].names[0], "안나");
    assert.deepEqual(JSON.parse(await readFile(join(outputDirectory, "report.json"), "utf8")), report);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
