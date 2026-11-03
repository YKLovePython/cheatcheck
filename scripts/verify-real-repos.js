#!/usr/bin/env node
/**
 * Precision check against real repositories.
 *
 * Fetches the latest commit of seven widely used libraries and asserts that
 * cheatcheck finds nothing in them. This is not part of `npm test` because it
 * needs network access; run it before a release or after touching a rule.
 *
 *   npm run verify:repos
 *
 * If your machine sits behind a TLS-intercepting proxy, run:
 *
 *   node --use-system-ca scripts/verify-real-repos.js
 */

const { parseDiff, analyze } = require("../dist/index.js");

const REPOS = [
  "chalk/chalk",
  "trpc/trpc",
  "vitest-dev/vitest",
  "honojs/hono",
  "sindresorhus/got",
  "sindresorhus/slugify",
  "sindresorhus/p-limit",
];

const CONFIG = { ignore: [], ignoreRules: [], threshold: 70, strict: false, lang: "en" };
const headers = { "User-Agent": "cheatcheck-precision-check", Accept: "application/vnd.github+json" };

async function latestCommit(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers });
  if (!res.ok) throw new Error(`${repo}: GitHub API returned ${res.status}`);
  const [commit] = await res.json();
  return { sha: commit.sha, date: commit.commit.committer.date, message: commit.commit.message.split("\n")[0] };
}

async function commitDiff(repo, sha) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
    headers: { ...headers, Accept: "application/vnd.github.diff" },
  });
  if (!res.ok) throw new Error(`${repo}@${sha.slice(0, 8)}: diff request returned ${res.status}`);
  return res.text();
}

(async () => {
  let dirty = 0;
  console.log(`\ncheatcheck precision check — latest commit of ${REPOS.length} repositories\n`);

  for (const repo of REPOS) {
    try {
      const commit = await latestCommit(repo);
      const diff = await commitDiff(repo, commit.sha);
      const result = analyze(parseDiff(diff), CONFIG);
      const mark = result.score === 100 ? "PASS" : "FAIL";
      if (result.score !== 100) dirty++;
      console.log(`${mark}  ${result.score.toString().padStart(3)}  ${repo.padEnd(24)} ${commit.sha.slice(0, 8)}  ${commit.message}`);
      for (const finding of result.findings) {
        console.log(`      ${finding.rule}  ${finding.file}:${finding.line ?? "?"}`);
      }
    } catch (error) {
      dirty++;
      console.log(`ERR       ${repo.padEnd(24)} ${error.message}`);
    }
  }

  console.log("");
  if (dirty > 0) {
    console.log(`${dirty} of ${REPOS.length} repositories did not score 100. Treat this as a false-positive bug, not as a threshold to change.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${REPOS.length} repositories scored 100.`);
  }
})();
