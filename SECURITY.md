# Security policy

## Supported versions

`cheatcheck` is pre-1.0. Security fixes land on the latest published minor version.

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting flow:
[Security → Report a vulnerability](https://github.com/YKLovePython/cheatcheck/security/advisories/new).

Include the version, the command you ran, and the smallest diff that reproduces the problem. You can
expect an initial response within 72 hours. Once a fix is ready, the advisory is published and the
release notes credit you unless you ask otherwise.

## What counts as a vulnerability

`cheatcheck` reads untrusted text (diffs, patch files, repository paths) and writes it to a terminal,
a CI log, or a Markdown file. The interesting failure modes are therefore:

- **Terminal escape injection.** A crafted filename or diff line that emits ANSI sequences and
  rewrites the surrounding output, hides findings, or manipulates the clipboard.
- **Path traversal or arbitrary file access.** `--diff` accepting a path outside the working tree, or
  any code path that reads a file it was not asked to read.
- **Command injection.** A ref, path or config value that reaches a shell without quoting.
- **Denial of service.** A diff that makes parsing or scoring take super-linear time or memory.
- **Supply chain.** A published tarball that contains files not present in the repository, or a
  release artifact that differs from the tagged source.
- **Secret leakage.** Any code path that sends repository content off the machine. There is no
  network code in the product; if you find one, that is a vulnerability.

## Design guarantees

These are intentional and enforced by review:

1. **No runtime dependencies.** `package.json` has no `dependencies`. The published package is the
   compiled output of this repository plus documentation.
2. **No network access.** The CLI never opens a socket. It shells out only to `git`, with an argument
   array — never a shell string.
3. **No telemetry, no accounts, no update checks.**
4. **Read-only.** `cheatcheck` never writes to the repository. It prints a report and sets an exit
   code.
5. **Bounded input.** Evidence is capped at three lines per finding and the parser processes the diff
   in a single pass.

If a change would weaken any of these, it needs an explicit discussion in the pull request.

## Verifying a release

```bash
npm view cheatcheck dist.integrity
npm pack cheatcheck --dry-run
```

Every release is published from a tagged commit on `main` by a maintainer with 2FA enabled. The
`dist/` directory in the repository is built from the same commit, so `git diff` after `npm run build`
should be empty.
