import config from "./jest.config.mjs";

/** @type {import("jest").Config} */
export default {
  ...config,
  testMatch: ["<rootDir>/test/**/*.slow.test.ts"],
  testPathIgnorePatterns: [],
};
