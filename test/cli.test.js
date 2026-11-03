const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "dist", "cli.js");
const ROOT = path.join(__dirname, "..");

function run(args, input) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    input,
  });
  return { code: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

test("--json reports a failing verdict and exits 1", () => {
  const r = run(["--diff", "examples/agent-cheat.diff", "--json"]);
  assert.equal(r.code, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.verdict, "fail");
  assert.ok(out.score < 40);
  assert.ok(out.findings.length >= 6);
});

test("clean diff exits 0", () => {
  const r = run(["--diff", "examples/clean-change.diff", "--json"]);
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.verdict, "pass");
  assert.equal(out.score, 100);
});

test("--no-fail always exits 0", () => {
  const r = run(["--diff", "examples/agent-cheat.diff", "--no-fail", "--quiet"]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("--threshold 10 lets a score of 14 pass", () => {
  const r = run(["--diff", "examples/agent-cheat.diff", "--threshold", "10", "--quiet"]);
  assert.equal(r.code, 0);
});

test("--strict rejects a merely average diff", () => {
  const diff = [
    "diff --git a/src/a.test.ts b/src/a.test.ts",
    "--- a/src/a.test.ts",
    "+++ b/src/a.test.ts",
    "@@ -1,2 +1,2 @@",
    "-it('one', () => {});",
    "+it('one!', () => {});",
    " ",
  ].join("\n");
  const r = run(["--stdin", "--json"], diff);
  assert.equal(r.code, 0);
});

test("reads a diff from stdin", () => {
  const diff = [
    "diff --git a/src/a.test.ts b/src/a.test.ts",
    "--- a/src/a.test.ts",
    "+++ b/src/a.test.ts",
    "@@ -1,1 +1,2 @@",
    "+it.skip('a', () => {});",
    " ",
  ].join("\n");
  const r = run(["--stdin", "--json"], diff);
  const out = JSON.parse(r.stdout);
  assert.ok(out.findings.some((f) => f.rule === "test-skipped"));
});

test("--list-rules prints every rule", () => {
  const r = run(["--list-rules"]);
  assert.equal(r.code, 0);
  for (const id of ["test-deleted", "test-skipped", "error-swallowed", "mock-under-test"]) {
    assert.ok(r.stdout.includes(id), `missing ${id}`);
  }
});

test("--explain prints a rule", () => {
  const r = run(["--explain", "test-skipped", "--lang", "en"]);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.toLowerCase().includes("skip"));
});

test("--explain with an unknown rule exits 2", () => {
  const r = run(["--explain", "nope"]);
  assert.equal(r.code, 2);
});

test("--version prints a semver", () => {
  const r = run(["--version"]);
  assert.equal(r.code, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("unknown option exits 2", () => {
  const r = run(["--nope"]);
  assert.equal(r.code, 2);
});

test("markdown output contains a table", () => {
  const r = run(["--diff", "examples/agent-cheat.diff", "--md"]);
  assert.ok(r.stdout.includes("| severity | rule | file | detail |"));
  assert.ok(r.stdout.includes("cheatcheck"));
});

test("github output emits workflow commands", () => {
  const r = run(["--diff", "examples/agent-cheat.diff", "--format", "github"]);
  assert.ok(r.stdout.includes("::error file="));
  assert.ok(r.stdout.includes("::notice::"));
});
