/** @type {import("jest").Config} */
const config = {
  preset: "ts-jest",
  transform: {
    "^.+\\.tsx?$": "<rootDir>/test/transformers/import-meta-env.cjs",
  },
  moduleNameMapper: {
    "^~/(.*)$": "<rootDir>/app/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/db/postgres/scripts/.*\\.test\\.mjs$"],
};

export default config;
