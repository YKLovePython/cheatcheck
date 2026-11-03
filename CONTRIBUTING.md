# Contributing

Thanks for looking. This project has one job — **be right about what a diff hides** — so the bar for a
new rule is evidence, not cleverness.

## Setup

```bash
git clone https://github.com/YKLovePython/cheatcheck
cd cheatcheck
npm install
npm test
node dist/cli.js --diff examples/agent-cheat.diff
```

No runtime dependencies. TypeScript compiles to CommonJS in `dist/`, which is committed so the GitHub
Action and `npx github:YKLovePython/cheatcheck` work without a build step.

## Layout

```
src/
  diff.ts       unified diff parser (no dependencies)
  files.ts      path classification: is this a test file? a snapshot? a lockfile?
  rules.ts      all 16 rules, one object each
  score.ts      per-rule aggregation, trust score, verdict
  report.ts     terminal / JSON / Markdown / GitHub annotations
  cli.ts        argument parsing, git invocation, exit codes
examples/       diffs used by tests and the demo image
docs/rules.md    human-readable rule reference
scripts/        demo image generator, real-repo precision check
```

## Adding a rule

A rule is an object with metadata and a `run(files, config)` function that returns findings.

```ts
const noSleepInTests: RuleMeta = {
  id: "sleep-in-tests",
  severity: "medium",
  weight: 8,
  name: { en: "sleep in tests", zh: "测试里用 sleep" },
  why: {
    en: "A fixed sleep is a race condition with better manners.",
    zh: "固定 sleep 是带着礼貌的竞态条件。",
  },
  run(files) {
    const out: RawFinding[] = [];
    for (const f of files) {
      if (!isTestFile(f.path)) continue;
      const hits = f.added.filter((l) => /\bsleep\s*\(/.test(l.text));
      if (hits.length === 0) continue;
      out.push({
        file: f.path,
        line: hits[0].line,
        evidence: hits.slice(0, 3).map((l) => l.text.trim()),
        message: { en: `${hits.length} fixed sleeps`, zh: `${hits.length} 处固定 sleep` },
        count: hits.length,
      });
    }
    return out;
  },
};
```

Then register it in `RULES` and document it in `docs/rules.md`.

### Requirements for a new rule

1. **A positive test.** A minimal diff that must fire.
2. **A negative test.** A near-miss that must not fire. If you cannot think of one, the rule probably
   is not precise enough.
3. **Bilingual copy.** `name`, `why` and `message` all need `en` and `zh`.
4. **A documented false-positive guard**, if the rule needs one (see `classifyDisable` in `rules.ts`).

Rules must be pure: no filesystem, no subprocesses, no network, no clock.

## Precision policy

We optimize for precision over recall. A rule that fires on clean, well-written code will be reverted,
even if it also catches real cheats. When in doubt, raise the evidence threshold.

Two mechanisms exist for this:

- `trimEvidence` caps evidence at three lines so reports stay readable.
- Aggregation in `score.ts` charges each rule once per diff, so one pattern in five files is one
  finding, not five.

Before opening a pull request that changes a rule, run:

```bash
npm run verify:repos
```

It fetches the latest commit of seven real repositories and fails if any scores below 100. If the
command cannot reach GitHub from your network, run it with `node --use-system-ca
scripts/verify-real-repos.js`.

## Committing

```
feat(rules): catch fixed sleeps in tests
fix(cli): do not crash on a diff without a header
docs(zh): clarify the trust score table
```

Rebuild `dist/` before committing if you touched `src/`:

```bash
npm run build
```

## Translations

The Chinese README is not a translation of the English one — it is the same product written for a
different reader. Keep it natural. `lang` is threaded through every user-facing string; new strings need
both languages.

## Releasing

```bash
npm version patch
npm run build
npm test
npm publish
git push --follow-tags
```
