# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-03

First release. `cheatcheck` reads a git diff and reports the shortcuts an AI coding agent takes to
make a change look finished: tests that disappeared, specs that stopped running, assertions that
became unfalsifiable, errors that stopped propagating, checks that were switched off.

### Added

- **Zero-dependency diff parser** (`src/diff.ts`). Handles multi-file diffs, renames, binary files,
  new/deleted files, and `\ No newline at end of file` markers.
- **16 rules** across five languages families (JS/TS, Python, Go, Rust, Java/Kotlin, .NET, Ruby):

  | Rule | Severity | Catches |
  | --- | --- | --- |
  | `test-deleted` | critical | Net loss of test declarations in a test file |
  | `test-file-deleted` | critical | A test file removed without a rename |
  | `test-skipped` | critical | `.skip`, `.only`, `xit`, `@pytest.mark.skip`, `t.Skip`, `#[ignore]`, `@Disabled` |
  | `test-ignored` | critical | New ignore patterns or discovery changes that stop tests running |
  | `mock-under-test` | critical | A test that mocks the module it is supposed to verify |
  | `assertions-removed` | high | Net loss of assertions |
  | `assertion-weakened` | high | `toBe` / `toEqual` replaced by `toBeTruthy` / `toBeDefined` |
  | `error-swallowed` | high | Empty `catch {}`, `except: pass`, bare `.catch(() => {})` |
  | `checks-disabled` | high | Blanket `@ts-nocheck`, `eslint-disable`, `# type: ignore` with no reason |
  | `config-loosened` | high | `"strict": false`, `skipLibCheck`, `--passWithNoTests`, `continue-on-error: true` |
  | `snapshot-blast` | high | A snapshot file with a large one-way rewrite |
  | `lint-suppressed` | medium | One-line suppressions with no reason given |
  | `stub-implementation` | medium | `not implemented`, `TODO: implement`, `return null; // stub` |
  | `mock-inflation` | medium | Three or more new mocks in one file |
  | `test-ratio` | medium | 150+ lines of implementation and almost no test change |
  | `type-escape` | low | Three or more new `any` casts in production code |

- **Trust score.** Per-rule multiplicative deduction, one charge per rule per diff, and a hard cap of
  39 when any critical rule fires. Verdicts: `PASS` (90–100), `REVIEW` (70–89), `RISKY` (40–69),
  `FAIL` (0–39).
- **Diff sources.** Working tree, `--staged`, `--base <ref>`, `--range <a>..<b>`, `--diff <file>`,
  and `--stdin`.
- **Output formats.** Human terminal output with colour and CJK-aware alignment, `--json`, `--md`
  (PR comment), and `--format github` (native workflow annotations).
- **Bilingual messages.** Every finding, rule name and explanation exists in English and Chinese.
  `--lang en|zh` overrides the locale.
- **`.cheatcheckrc.json`** with `threshold`, `strict`, `ignore`, `ignoreRules` and `lang`.
- **GitHub Action** (`action.yml`) and a self-checking workflow, both running the committed `dist/`
  so no build step is required.
- **Documentation.** `README.md`, `README.zh-CN.md`, `docs/rules.md`, `CONTRIBUTING.md`, and
  generated terminal screenshots in `docs/`.
- **Tests.** 51 tests covering the parser, every rule (positive and near-miss), scoring, the CLI, and
  documentation completeness. `npm run verify:repos` fetches the latest commit of `chalk`, `trpc`,
  `vitest`, `hono`, `got`, `slugify` and `p-limit`; all must score 100.

### Design notes

- **Precision over recall.** A suppression comment with a real reason (12+ characters) is treated as
  engineering, not cheating. Only unjustified suppressions are reported. Suppression text inside a
  string literal, regex or documentation snippet is ignored, so fixtures and code examples do not
  produce findings.
- **No model, no network, no key, no telemetry.** The CLI is a pure function from diff bytes to a
  report. That makes it safe to run in CI and in a pre-commit hook.
- **Only the diff is inspected.** Pre-existing problems are out of scope by design. The repository's
  own release commit scores 100 with `cheatcheck --range`. 

[0.1.0]: https://github.com/YKLovePython/cheatcheck/releases/tag/v0.1.0
