/** @type {import("jest").Config} */
const config = {
  preset: "ts-jest",
  transform: {
    "^.+\\.[cm]?[jt]sx?$": "<rootDir>/test/transformers/import-meta-env.cjs",
  },
  transformIgnorePatterns: [
    "node_modules/.pnpm/(?!(?:htmlparser2|domhandler|domutils|domelementtype|dom-serializer|entities)@)",
    "node_modules/(?!\\.pnpm/|htmlparser2/|domhandler/|domutils/|domelementtype/|dom-serializer/|entities/)",
  ],
  moduleNameMapper: {
    "^~/(.*)$": "<rootDir>/app/$1",
  },
  testPathIgnorePatterns: [
    "<rootDir>/scripts/local-dev.test.mjs",
    "<rootDir>/scripts/student-state-migration.test.mjs",
  ],
};

export default config;
