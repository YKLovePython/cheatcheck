import { FileDiff } from "./types";

const TEST_DIR = /(^|\/)(__tests__|__test__|test|tests|spec|specs|e2e|cypress|playwright|integration|unit|testing)\//i;
const TEST_EXT = /\.(test|spec|e2e|cy)\.(c|m)?(j|t)sx?$/i;
const GO_TEST = /_test\.go$/i;
const JAVA_TEST = /(Test|Tests|IT|Spec)\.java$/;
const PY_TEST = /(^|\/)test_[^/]+\.py$|_test\.py$/i;
const RS_TEST = /(^|\/)tests\/[^/]+\.rs$/i;
const CS_TEST = /(Tests?|Spec)\.cs$/i;
const RB_TEST = /_spec\.rb$/i;
const PHP_TEST = /Test\.php$/i;

const SNAPSHOT = /(^|\/)(__snapshots__|snapshots)\//i;
const SNAPSHOT_EXT = /\.(snap|snapshot)$/i;

const LOCKFILES = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/i;
const GENERATED = /^(dist|build|out|coverage|vendor|node_modules|\.next|target)\//i;
const DOCS = /\.(md|mdx|txt|rst|adoc)$/i;
const BINARY_ASSET = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|woff2?|ttf|mp4|mov|mp3|wasm)$/i;

const CODE_EXT = /\.(c|m)?(j|t)sx?$|\.(py|go|rs|java|kt|kts|rb|php|cs|cpp|cc|cxx|c|h|hpp|swift|scala|sh|bash|zsh|sql|vue|svelte|astro)$/i;

export function isTestFile(path: string): boolean {
  return (
    TEST_EXT.test(path) ||
    GO_TEST.test(path) ||
    JAVA_TEST.test(path) ||
    PY_TEST.test(path) ||
    RS_TEST.test(path) ||
    CS_TEST.test(path) ||
    RB_TEST.test(path) ||
    PHP_TEST.test(path) ||
    (TEST_DIR.test(path) && CODE_EXT.test(path))
  );
}

export function isSnapshotFile(path: string): boolean {
  return SNAPSHOT.test(path) || SNAPSHOT_EXT.test(path);
}

export function isCodeFile(path: string): boolean {
  return CODE_EXT.test(path) && !isTestFile(path);
}

export function isDocFile(path: string): boolean {
  return DOCS.test(path);
}

export function isNoiseFile(path: string): boolean {
  return LOCKFILES.test(path) || GENERATED.test(path) || BINARY_ASSET.test(path) || isDocFile(path) || isSnapshotFile(path);
}

/** Files that count as "the implementation" when judging test coverage of a change. */
export function isImplementationFile(path: string): boolean {
  return isCodeFile(path) && !isNoiseFile(path);
}

export function isConfigFile(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return /^(package\.json|tsconfig.*\.json|jsconfig.*\.json|\.eslintrc.*|eslint\.config\..*|jest\.config\..*|vitest\.config\..*|vite\.config\..*|pyproject\.toml|pytest\.ini|setup\.cfg|tox\.ini|\.gitignore|\.eslintignore|\.prettierignore|\.npmignore|babel\.config\..*|Makefile|\.husky\/.*|\.pre-commit-config\.yaml)$/i.test(
    base
  );
}

/** Strip the language-specific test suffix so `foo.test.ts` and `foo_test.go` compare equal. */
export function testBasename(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/\.(test|spec|e2e|cy)\.(c|m)?(j|t)sx?$/i, "")
    .replace(/_test\.go$/i, "")
    .replace(/(Test|Tests|IT|Spec)\.java$/i, "")
    .replace(/(Test|Tests?)\.cs$/i, "")
    .replace(/^test_/, "")
    .replace(/_test\.py$/i, "")
    .replace(/_spec\.rb$/i, "")
    .replace(/\.py$/i, "")
    .toLowerCase();
}

/** `src/auth/token.test.ts` -> `token` */
export function moduleBasename(path: string): string {
  return testBasename(path);
}

export function filesTouching(files: FileDiff[], pred: (f: FileDiff) => boolean): FileDiff[] {
  return files.filter(pred);
}
