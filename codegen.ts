import { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: process.env.VITE_BAQL_URL ?? "https://baql.mollulog.net/graphql",
  documents: ["app/**/*.{ts,tsx}"],
  config: {
    scalars: {
      ISO8601DateTime: "Date",
    },
  },
  ignoreNoDocuments: true,
  generates: {
    "./app/graphql/": {
      preset: "client",
      config: {
        useTypeImports: true,
        avoidOptionals: true,
      },
    },
  },
};

export default config;
