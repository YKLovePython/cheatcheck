const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseDiff, diffStats } = require("../dist/diff.js");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "examples", name), "utf8");

test("parses files, statuses and paths", () => {
  const files = parseDiff(read("agent-cheat.diff"));
  assert.equal(files.length, 5);

  const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
  assert.equal(byPath["src/auth/token.test.ts"].status, "modified");
  assert.equal(byPath["src/auth/permissions.ts"].status, "added");
  assert.equal(byPath["src/auth/legacy.test.ts"].status, "deleted");
  assert.equal(byPath["package.json"].status, "modified");
});

test("counts added and removed lines", () => {
  const files = parseDiff(read("agent-cheat.diff"));
  const stats = diffStats(files);
  assert.equal(stats.files, 5);
  assert.equal(stats.added, 22);
  assert.equal(stats.removed, 24);
});

test("tracks new-file line numbers for additions", () => {
  const files = parseDiff(read("agent-cheat.diff"));
  const token = files.find((f) => f.path === "src/auth/token.ts");
  const tsIgnore = token.added.find((l) => l.text.includes("@ts-ignore"));
  assert.ok(tsIgnore, "expected the @ts-ignore line");
  assert.equal(typeof tsIgnore.line, "number");
  assert.ok(tsIgnore.line > 0);
});

test("handles CRLF and trailing whitespace", () => {
  const crlf = read("clean-change.diff").replace(/\n/g, "\r\n");
  const files = parseDiff(crlf);
  assert.equal(files.length, 3);
});

test("handles an empty diff", () => {
  assert.deepEqual(parseDiff(""), []);
  assert.deepEqual(parseDiff("\n\n"), []);
});

test("does not treat +++ inside a hunk as a file header", () => {
  const diff = [
    "diff --git a/a.txt b/a.txt",
    "--- a/a.txt",
    "+++ b/a.txt",
    "@@ -1,1 +1,2 @@",
    " hello",
    "+++ not a header",
  ].join("\n");
  const files = parseDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "a.txt");
  assert.equal(files[0].added.length, 1);
  assert.equal(files[0].added[0].text, "++ not a header");
});
