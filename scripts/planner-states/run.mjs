import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = join(root, "app");
const rootUrl = pathToFileURL(`${root}/`).href;
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];

function existingModulePath(basePath) {
  if (extname(basePath) && existsSync(basePath)) return basePath;
  for (const extension of sourceExtensions) {
    if (existsSync(`${basePath}${extension}`)) return `${basePath}${extension}`;
  }
  for (const extension of sourceExtensions) {
    const candidate = join(basePath, `index${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basePath = null;
    if (specifier.startsWith("~/")) {
      basePath = join(appRoot, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith(rootUrl) &&
      !context.parentURL.includes("/node_modules/")
    ) {
      basePath = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    const resolvedPath = basePath ? existingModulePath(basePath) : null;
    if (resolvedPath) return nextResolve(pathToFileURL(resolvedPath).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith("node:") || extname(specifier) || context.conditions?.includes("require")) throw error;
      try {
        return nextResolve(`${specifier}.js`, context);
      } catch {
        throw error;
      }
    }
  },
  load(url, context, nextLoad) {
    if (!url.startsWith("file:") || !url.match(/\.tsx?$/)) return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    return { format: "module", source: output, shortCircuit: true };
  },
});

const { main } = await import("./cli.ts");
await main();
