#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const TEXT_EXTENSIONS = new Set([".cjs", ".js", ".json", ".jsonc", ".mjs", ".ts", ".tsx"]);

const ACTIVE_D1_PATTERNS = [
  { name: "D1 binding declaration", expression: /\bd1_databases\b|\bD1Database\b|["']binding["']\s*:\s*["']DB["']/i },
  { name: "D1 driver import", expression: /drizzle-orm\/(?:d1|sqlite(?:-core)?)(?:["'/]|$)|@cloudflare\/d1/i },
  { name: "D1 environment access", expression: /\b(?:env|c\.env|context\.env)\.DB\b/ },
  { name: "D1 runtime wrapper", expression: /\b(?:withD1|getD1|d1Session|d1Timeout|parseD1TimestampAsUtc)\b|RUNTIME_TIMEOUTS\.d1/ },
  { name: "D1 package command", expression: /\bwrangler\s+d1\b/i },
];

function isIgnoredFile(filePath) {
  const normalized = filePath.split(sep).join("/");
  return (
    normalized.includes("/node_modules/") ||
    normalized.includes("/.wrangler/") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/docs/") ||
    normalized.endsWith(".d.ts") ||
    /(?:^|\/)[^/]+\.(?:test|spec)\.[^.]+$/.test(normalized)
  );
}

async function collectFiles(root, path = "") {
  const absolutePath = join(root, path);
  const entry = await stat(absolutePath);
  if (entry.isFile()) return [absolutePath];
  if (!entry.isDirectory()) return [];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = [];
  for (const child of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childPath = path ? join(path, child.name) : child.name;
    if (child.isDirectory()) {
      files.push(...(await collectFiles(root, childPath)));
    } else if (child.isFile() && TEXT_EXTENSIONS.has(child.name.slice(child.name.lastIndexOf(".")))) {
      files.push(join(root, childPath));
    }
  }
  return files;
}

export async function scanFiles(root, paths) {
  const files = [];
  for (const path of paths) files.push(...(await collectFiles(root, path)));
  const violations = [];
  for (const file of files.sort()) {
    const relativePath = relative(root, file).split(sep).join("/");
    if (isIgnoredFile(relativePath)) continue;
    const content = await readFile(file, "utf8");
    for (const [lineNumber, line] of content.split(/\r?\n/).entries()) {
      for (const pattern of ACTIVE_D1_PATTERNS) {
        if (pattern.expression.test(line)) {
          violations.push({ file: relativePath, line: lineNumber + 1, pattern: pattern.name, text: line.trim() });
        }
      }
    }
  }
  return { files: files.filter((file) => !isIgnoredFile(relative(root, file))), violations };
}

export async function scanD1Zero({ mollulogRoot, connectRoot, adminRoot }) {
  const projects = [
    {
      project: "MolluLog",
      root: mollulogRoot,
      paths: ["app", "workers", "wrangler.jsonc", "wrangler.cron.jsonc", "package.json"],
    },
    {
      project: "MolluConnect",
      root: connectRoot,
      paths: ["src", "wrangler.jsonc", "package.json"],
    },
    {
      project: "Admin",
      root: adminRoot,
      paths: ["app", "workers", "wrangler.jsonc", "package.json"],
    },
  ];
  const results = [];
  for (const project of projects) {
    if (!project.root) throw new Error(`${project.project} repository root is required`);
    for (const path of project.paths) {
      try {
        await stat(join(project.root, path));
      } catch {
        throw new Error(`${project.project} scan input is missing: ${join(project.root, path)}`);
      }
    }
    const result = await scanFiles(project.root, project.paths);
    results.push({ ...project, ...result });
  }
  return results;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const mollulogRoot = optionValue(args, "--mollulog-root");
  const connectRoot = optionValue(args, "--connect-root");
  const adminRoot = optionValue(args, "--admin-root");
  if (!mollulogRoot || !connectRoot || !adminRoot) {
    throw new Error(
      "Usage: d1-cutover-zero-scan.mjs --mollulog-root DIR --connect-root DIR --admin-root DIR",
    );
  }
  const results = await scanD1Zero({ mollulogRoot, connectRoot, adminRoot });
  const violations = results.flatMap((result) =>
    result.violations.map((violation) => ({ project: result.project, ...violation })),
  );
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.project}/${violation.file}:${violation.line}: ${violation.pattern}: ${violation.text}`);
    }
    throw new Error(`D1-zero scan failed with ${violations.length} active runtime/config violation(s)`);
  }
  const fileCount = results.reduce((count, result) => count + result.files.length, 0);
  console.log(`D1-zero scan passed: ${fileCount} selected runtime/config files scanned across ${results.length} repositories`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
