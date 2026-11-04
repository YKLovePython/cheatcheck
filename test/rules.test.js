const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseDiff, analyze, RULES } = require("../dist/index.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "examples", name), "utf8");

const CONFIG = { ignore: [], ignoreRules: [], threshold: 70, strict: false };

function runText(diff) {
  return analyze(parseDiff(diff), CONFIG);
}
function runExample(name) {
  return analyze(parseDiff(read(name)), CONFIG);
}

function makeDiff(file, added, removed = []) {
  const lines = [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,${removed.length} +1,${added.length} @@`,
    ...removed.map((l) => "-" + l),
    ...added.map((l) => "+" + l),
  ];
  return lines.join("\n");
}

const ids = (a) => a.triggered.slice().sort();

/* ------------------------------------------------------------------ */
/* Golden examples                                                     */
/* ------------------------------------------------------------------ */

test("the cheating example fails with every expected rule", () => {
  const a = runExample("agent-cheat.diff");
  assert.equal(a.verdict, "fail");
  assert.ok(a.score < 40, `expected a low score, got ${a.score}`);
  assert.deepEqual(ids(a), [
    "assertion-weakened",
    "error-swallowed",
    "lint-suppressed",
    "stub-implementation",
    "test-deleted",
    "test-file-deleted",
    "test-skipped",
  ]);
});

test("a clean change passes with 100", () => {
  const a = runExample("clean-change.diff");
  assert.equal(a.verdict, "pass");
  assert.equal(a.score, 100);
  assert.deepEqual(a.findings, []);
});

/* ------------------------------------------------------------------ */
/* Individual rules                                                    */
/* ------------------------------------------------------------------ */

test("test-deleted ignores a pure rename", () => {
  const diff = [
    "diff --git a/src/a.test.ts b/src/a.test.ts",
    "--- a/src/a.test.ts",
    "+++ b/src/a.test.ts",
    "@@ -1,3 +1,3 @@",
    "-it('adds numbers', () => {",
    "+it('adds two numbers', () => {",
    "   expect(1 + 1).toBe(2);",
  ].join("\n");
  const a = runText(diff);
  assert.ok(!a.triggered.includes("test-deleted"));
});

test("test-skipped catches .only, xit and pytest skips", () => {
  const js = runText(makeDiff("src/x.test.ts", ["it.only('a', () => {});"]));
  assert.ok(js.triggered.includes("test-skipped"));

  const legacy = runText(makeDiff("src/y.test.ts", ["xit('a', function () {});"]));
  assert.ok(legacy.triggered.includes("test-skipped"));

  const py = runText(makeDiff("tests/test_z.py", ["@pytest.mark.skip(reason='flaky')", "def test_z():", "    assert 1 == 1"]));
  assert.ok(py.triggered.includes("test-skipped"));
});

test("test-skipped does not fire on production code", () => {
  const a = runText(makeDiff("src/queue.ts", ["queue.skip(3);"]));
  assert.ok(!a.triggered.includes("test-skipped"));
});

test("assertion-weakened catches toBeTruthy replacing toBe", () => {
  const diff = [
    "diff --git a/src/a.test.ts b/src/a.test.ts",
    "--- a/src/a.test.ts",
    "+++ b/src/a.test.ts",
    "@@ -1,3 +1,3 @@",
    "-  expect(parse('x')).toBe({ ok: false });",
    "+  expect(parse('x')).toBeTruthy();",
    " });",
  ].join("\n");
  const a = runText(diff);
  assert.ok(a.triggered.includes("assertion-weakened"));
});

test("assertions-removed needs a net loss of two", () => {
  const one = runText(
    [
      "diff --git a/src/a.test.ts b/src/a.test.ts",
      "--- a/src/a.test.ts",
      "+++ b/src/a.test.ts",
      "@@ -1,2 +1,1 @@",
      "-  expect(a).toBe(1);",
      "-  expect(b).toBe(2);",
      "+  expect(a).toBe(1);",
    ].join("\n")
  );
  assert.ok(!one.triggered.includes("assertions-removed"));

  const two = runText(
    [
      "diff --git a/src/a.test.ts b/src/a.test.ts",
      "--- a/src/a.test.ts",
      "+++ b/src/a.test.ts",
      "@@ -1,4 +1,1 @@",
      "-  expect(a).toBe(1);",
      "-  expect(b).toBe(2);",
      "-  expect(c).toBe(3);",
      "+  expect(a).toBe(1);",
    ].join("\n")
  );
  assert.ok(two.triggered.includes("assertions-removed"));
});

test("error-swallowed catches empty catch blocks across lines", () => {
  const a = runText(makeDiff("src/a.ts", ["try {", "  run();", "} catch (err) {", "}", ""]));
  assert.ok(a.triggered.includes("error-swallowed"));
});

test("error-swallowed ignores a catch that rethrows", () => {
  const a = runText(makeDiff("src/a.ts", ["} catch (err) {", "  throw new Error('boom', { cause: err });", "}"]));
  assert.ok(!a.triggered.includes("error-swallowed"));
});

test("checks-disabled catches blanket suppressions", () => {
  assert.ok(runText(makeDiff("src/a.ts", ["// @ts-nocheck"])).triggered.includes("checks-disabled"));
  assert.ok(runText(makeDiff("src/a.ts", ["/* eslint-disable */"])).triggered.includes("checks-disabled"));
  assert.ok(runText(makeDiff("src/a.py", ["x = 1  # type: ignore"])).triggered.includes("checks-disabled"));
});

test("lint-suppressed catches unjustified targeted suppressions", () => {
  assert.ok(runText(makeDiff("src/a.ts", ["// @ts-ignore"])).triggered.includes("lint-suppressed"));
  assert.ok(runText(makeDiff("src/a.js", ["// eslint-disable-next-line no-console"])).triggered.includes("lint-suppressed"));
});

test("a suppression with a real reason is left alone", () => {
  const diff = makeDiff("src/a.js", [
    "// eslint-disable-next-line no-console -- the CLI prints progress here on purpose",
  ]);
  const a = runText(diff);
  assert.ok(!a.triggered.includes("lint-suppressed"));
  assert.ok(!a.triggered.includes("checks-disabled"));
});

test("suppressions quoted as data are not findings", () => {
  const a = runText(
    makeDiff("test/fixtures.test.js", [
      'const cases = ["// @ts-ignore", "/* eslint-disable */"];',
      'expect(snapshot).toContain("// @ts-nocheck");',
    ])
  );
  assert.ok(!a.triggered.includes("lint-suppressed"));
  assert.ok(!a.triggered.includes("checks-disabled"));
});

test("mocks quoted as data are not counted", () => {
  const a = runText(
    makeDiff("test/fixtures.test.js", [
      'const mocks = ["vi.mock(\'a\')", "vi.mock(\'b\')", "vi.mock(\'c\')"];',
    ])
  );
  assert.ok(!a.triggered.includes("mock-inflation"));
});

test("prose and regexes that mention a suppression are not findings", () => {
  const a = runText(
    makeDiff("src/detector.ts", [
      "// `@ts-nocheck` in a file header is a red flag.",
      "if (/@ts-nocheck\\b/.test(line)) return true;",
    ])
  );
  assert.ok(!a.triggered.includes("checks-disabled"));
});

test("rules ignore code examples in documentation", () => {
  const a = runText(
    makeDiff("docs/rules.md", [
      "```ts",
      "try { run(); } catch (err) {}",
      "function todo() { throw new Error('Not implemented'); }",
      "```",
    ])
  );
  assert.ok(!a.triggered.includes("error-swallowed"));
  assert.ok(!a.triggered.includes("stub-implementation"));
});

test("mock-under-test catches a test mocking its own module", () => {
  const a = runText(makeDiff("src/auth/token.test.ts", ["vi.mock('./token', () => ({ verifyToken: vi.fn() }));"]));
  assert.ok(a.triggered.includes("mock-under-test"));
});

test("mock-under-test ignores mocking a dependency", () => {
  const a = runText(makeDiff("src/auth/token.test.ts", ["vi.mock('node:crypto', () => ({})),"]));
  assert.ok(!a.triggered.includes("mock-under-test"));
});

test("snapshot-blast needs a large snapshot rewrite", () => {
  const big = Array.from({ length: 30 }, (_, i) => `+  "row ${i}": true,`).join("\n");
  const diff = `diff --git a/src/__snapshots__/a.snap b/src/__snapshots__/a.snap\n--- a/src/__snapshots__/a.snap\n+++ b/src/__snapshots__/a.snap\n@@ -1,1 +1,31 @@\n-old\n${big}`;
  assert.ok(runText(diff).triggered.includes("snapshot-blast"));
});

test("test-ratio fires on a large implementation change with no tests", () => {
  const added = Array.from({ length: 200 }, (_, i) => `export const v${i} = ${i};`);
  const a = runText(makeDiff("src/big.ts", added));
  assert.ok(a.triggered.includes("test-ratio"));
});

test("test-ratio stays quiet when tests are added", () => {
  const impl = Array.from({ length: 200 }, (_, i) => `export const v${i} = ${i};`);
  const tests = Array.from({ length: 20 }, (_, i) => `  it('case ${i}', () => { expect(v${i}).toBe(${i}); });`);
  const diff = [makeDiff("src/big.ts", impl), makeDiff("src/big.test.ts", tests)].join("\n");
  assert.ok(!runText(diff).triggered.includes("test-ratio"));
});

test("test-file-deleted ignores a renamed test file", () => {
  const renamed = [
    "diff --git a/src/a.test.ts b/src/a.spec.ts",
    "similarity index 100%",
    "rename from src/a.test.ts",
    "rename to src/a.spec.ts",
  ].join("\n");
  assert.ok(!runText(renamed).triggered.includes("test-file-deleted"));
});

test("test-ignored catches tests added to an ignore list", () => {
  const hit = runText(makeDiff(".eslintignore", ["src/legacy.test.ts"]));
  assert.ok(hit.triggered.includes("test-ignored"));

  const miss = runText(makeDiff(".eslintignore", ["src/legacy.ts"]));
  assert.ok(!miss.triggered.includes("test-ignored"));
});

test("config-loosened catches disabled guardrails, not normal config", () => {
  assert.ok(runText(makeDiff("tsconfig.json", ['"strict": false'])).triggered.includes("config-loosened"));
  assert.ok(
    runText(makeDiff(".github/workflows/ci.yml", ["continue-on-error: true"])).triggered.includes("config-loosened")
  );
  assert.ok(runText(makeDiff("pyproject.toml", ["fail_under = 0"])).triggered.includes("config-loosened"));

  const healthy = runText(
    makeDiff("pyproject.toml", ["fail_under = 85", "[tool.pytest.ini_options]", "addopts = '-q'"])
  );
  assert.ok(!healthy.triggered.includes("config-loosened"));
});

test("ci-neutered catches a pipeline that can no longer fail", () => {
  const swallowed = runText(makeDiff(".github/workflows/ci.yml", ["      - run: npm test || true"]));
  assert.ok(swallowed.triggered.includes("ci-neutered"));

  const disabled = runText(
    makeDiff(".github/workflows/ci.yml", ["      - run: npm run lint", "        if: false"])
  );
  assert.ok(disabled.triggered.includes("ci-neutered"));

  const noErrexit = runText(
    [
      "diff --git a/scripts/test.sh b/scripts/test.sh",
      "--- a/scripts/test.sh",
      "+++ b/scripts/test.sh",
      "@@ -1,3 +1,2 @@",
      "-set -euo pipefail",
      " npm test",
    ].join("\n")
  );
  assert.ok(noErrexit.triggered.includes("ci-neutered"));
});

test("ci-neutered leaves a healthy workflow alone", () => {
  const healthy = runText(
    makeDiff(".github/workflows/ci.yml", [
      "      - run: npm ci",
      "      - run: npm test",
      "      - run: npm run build",
      "        if: github.event_name == 'push'",
      "      fail-fast: false",
    ])
  );
  assert.ok(!healthy.triggered.includes("ci-neutered"));

  // A commented-out command is documentation, not a change to the pipeline.
  assert.ok(!runText(makeDiff(".github/workflows/ci.yml", ["      # - run: npm test || true"])).triggered.includes("ci-neutered"));

  // `|| true` in application code is not a CI change.
  assert.ok(!runText(makeDiff("src/run.ts", ["const ok = run() || true;"])).triggered.includes("ci-neutered"));

  // Cleanup after a build may fail; it is not a disabled check.
  assert.ok(!runText(makeDiff("scripts/release.sh", ["rm -rf dist || true"])).triggered.includes("ci-neutered"));
  assert.ok(
    !runText(makeDiff("scripts/release.sh", ["curl -fsS \"$HEALTH_URL\" || true"])).triggered.includes("ci-neutered")
  );

  // Toggling errexit around an expected failure is normal shell, not a neutered pipeline.
  const toggle = runText(
    [
      "diff --git a/scripts/x.sh b/scripts/x.sh",
      "--- a/scripts/x.sh",
      "+++ b/scripts/x.sh",
      "@@ -1,2 +1,4 @@",
      " set -euo pipefail",
      "+set +e",
      "+grep -q needle file",
      "+set -e",
    ].join("\n")
  );
  assert.ok(!toggle.triggered.includes("ci-neutered"));

  // But swallowing the exit code of a real check is a finding.
  assert.ok(
    runText(makeDiff("scripts/ci.sh", ["./scripts/e2e.sh || true"])).triggered.includes("ci-neutered")
  );
});

test("coverage-gate-removed catches a deleted, lowered or switched-off floor", () => {
  const removed = [
    "diff --git a/jest.config.js b/jest.config.js",
    "--- a/jest.config.js",
    "+++ b/jest.config.js",
    "@@ -1,6 +1,3 @@",
    " module.exports = {",
    "-  coverageThreshold: {",
    "-    global: { lines: 80 },",
    "-  },",
    "   testEnvironment: 'node',",
    " };",
  ].join("\n");
  assert.ok(runText(removed).triggered.includes("coverage-gate-removed"));

  const lowered = [
    "diff --git a/pyproject.toml b/pyproject.toml",
    "--- a/pyproject.toml",
    "+++ b/pyproject.toml",
    "@@ -1,2 +1,2 @@",
    "-fail_under = 85",
    "+fail_under = 40",
  ].join("\n");
  assert.ok(runText(lowered).triggered.includes("coverage-gate-removed"));

  assert.ok(
    runText(makeDiff("jest.config.js", ["  collectCoverage: false,"])).triggered.includes("coverage-gate-removed")
  );
});

test("coverage-gate-removed leaves normal coverage config alone", () => {
  assert.ok(!runText(makeDiff("pyproject.toml", ["fail_under = 90"])).triggered.includes("coverage-gate-removed"));

  const raised = [
    "diff --git a/pyproject.toml b/pyproject.toml",
    "--- a/pyproject.toml",
    "+++ b/pyproject.toml",
    "@@ -1,2 +1,2 @@",
    "-fail_under = 70",
    "+fail_under = 90",
  ].join("\n");
  assert.ok(!runText(raised).triggered.includes("coverage-gate-removed"));

  // `fail_under = 0` is config-loosened's finding; do not charge it twice.
  const zero = runText(makeDiff("pyproject.toml", ["fail_under = 0"]));
  assert.ok(zero.triggered.includes("config-loosened"));
  assert.ok(!zero.triggered.includes("coverage-gate-removed"));
});

test("mock-inflation needs three new mocks", () => {
  const many = runText(
    makeDiff("src/checkout.test.ts", [
      "vi.mock('./cart', () => ({}));",
      "vi.mock('./user', () => ({}));",
      "vi.mock('../lib/http', () => ({}));",
    ])
  );
  assert.ok(many.triggered.includes("mock-inflation"));

  const few = runText(makeDiff("src/checkout.test.ts", ["vi.mock('./cart', () => ({}));"]));
  assert.ok(!few.triggered.includes("mock-inflation"));
});

test("type-escape counts only production code", () => {
  const three = ["const a: any = 1;", "const b: any = 2;", "const c = value as any;"];
  assert.ok(runText(makeDiff("src/api.ts", three)).triggered.includes("type-escape"));
  assert.ok(!runText(makeDiff("src/api.ts", three.slice(0, 2))).triggered.includes("type-escape"));
  assert.ok(!runText(makeDiff("src/api.test.ts", three)).triggered.includes("type-escape"));
});

test("snapshot-blast leaves a small, balanced snapshot edit alone", () => {
  const diff = [
    "diff --git a/src/__snapshots__/a.snap b/src/__snapshots__/a.snap",
    "--- a/src/__snapshots__/a.snap",
    "+++ b/src/__snapshots__/a.snap",
    "@@ -1,2 +1,2 @@",
    "-old",
    "+new",
    " context",
  ].join("\n");
  assert.ok(!runText(diff).triggered.includes("snapshot-blast"));
});

test("stub-implementation does not fire on test code", () => {
  const a = runText(makeDiff("src/a.test.ts", ["throw new Error('not implemented yet');"]));
  assert.ok(!a.triggered.includes("stub-implementation"));
});

test("disable rules via config", () => {
  const files = parseDiff(read("agent-cheat.diff"));
  const a = analyze(files, { ...CONFIG, ignoreRules: ["test-skipped", "test-deleted", "test-file-deleted"] });
  assert.ok(!a.triggered.includes("test-skipped"));
  assert.ok(!a.triggered.includes("test-deleted"));
});

test("ignore paths via config", () => {
  const files = parseDiff(read("agent-cheat.diff"));
  const a = analyze(files, { ...CONFIG, ignore: ["src/auth/"] });
  assert.ok(!a.triggered.includes("test-file-deleted"));
});

/* ------------------------------------------------------------------ */
/* Documentation and metadata                                          */
/* ------------------------------------------------------------------ */

test("documents every rule in both READMEs and the rule reference", () => {
  const root = path.join(__dirname, "..");
  const docs = {
    "docs/rules.md": fs.readFileSync(path.join(root, "docs", "rules.md"), "utf8"),
    "README.md": fs.readFileSync(path.join(root, "README.md"), "utf8"),
    "README.zh-CN.md": fs.readFileSync(path.join(root, "README.zh-CN.md"), "utf8"),
  };

  assert.equal(RULES.length, 18, "the READMEs advertise 18 rules");

  for (const rule of RULES) {
    for (const [file, text] of Object.entries(docs)) {
      assert.ok(text.includes(rule.id), `${file} does not document rule \`${rule.id}\``);
    }
  }
});

test("every rule has bilingual copy, a known severity and a positive weight", () => {
  const severities = new Set(["critical", "high", "medium", "low"]);

  for (const rule of RULES) {
    assert.ok(severities.has(rule.severity), `${rule.id} has an unknown severity`);
    assert.ok(rule.weight > 0, `${rule.id} needs a positive weight`);
    assert.ok(rule.name.en.length > 0 && rule.name.zh.length > 0, `${rule.id} needs a bilingual name`);
    assert.ok(rule.why.en.length > 0 && rule.why.zh.length > 0, `${rule.id} needs a bilingual why`);
  }

  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "rule ids must be unique");
});

