/** @type {import("jest").Config} */
const config = {
  preset: "ts-jest",
  moduleNameMapper: {
    "^~/(.*)$": "<rootDir>/app/$1",
  },
};

export default config;
