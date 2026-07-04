const { TsJestTransformer } = require("ts-jest");

// `import.meta.env`/`import.meta.url` are Vite-only syntax that Node's CommonJS
// loader cannot parse at all (a hard SyntaxError, not just an undefined
// reference), so ts-jest alone can't make files using them requireable under
// Jest. This strips them to plain object/string literals before ts-jest sees
// the source, so app files that reference `import.meta.env.*` for defaults
// (e.g. `~/lib/ranks/base.ts`) can be imported directly in tests.
const tsJestTransformer = new TsJestTransformer();

function stripImportMeta(sourceText) {
  return sourceText.replace(/import\.meta\.env/g, "({})").replace(/import\.meta\.url/g, '"file://jest"');
}

module.exports = {
  process(sourceText, sourcePath, transformOptions) {
    return tsJestTransformer.process(stripImportMeta(sourceText), sourcePath, transformOptions);
  },
  processAsync(sourceText, sourcePath, transformOptions) {
    return tsJestTransformer.processAsync(stripImportMeta(sourceText), sourcePath, transformOptions);
  },
  getCacheKey(sourceText, sourcePath, transformOptions) {
    return tsJestTransformer.getCacheKey(stripImportMeta(sourceText), sourcePath, transformOptions);
  },
};
