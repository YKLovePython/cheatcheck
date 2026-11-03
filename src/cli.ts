#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseDiff } from "./diff";
import { analyze, shouldFail } from "./score";
import { RULES, ruleById } from "./rules";
import {
  renderGithub,
  renderJson,
  renderMarkdown,
  renderReport,
  renderRuleExplain,
  renderRuleList,
} from "./report";
import { Config, Lang } from "./types";

/* ------------------------------------------------------------------ */
/* Version                                                             */
/* ------------------------------------------------------------------ */

function readVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(path.join(__dirname, "..", "package.json")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

interface Args {
  staged: boolean;
  base?: string;
  range?: string;
  diff?: string;
  stdin: boolean;
  json: boolean;
  markdown: boolean;
  github: boolean;
  lang?: Lang;
  color: boolean;
  verbose: boolean;
  strict: boolean;
  threshold?: number;
  listRules: boolean;
  explain?: string;
  version: boolean;
  help: boolean;
  quiet: boolean;
  ignore: string[];
  disable: string[];
  failOn: boolean;
}

function defaultArgs(): Args {
  return {
    staged: false,
    stdin: false,
    json: false,
    markdown: false,
    github: false,
    color: true,
    verbose: false,
    strict: false,
    listRules: false,
    version: false,
    help: false,
    quiet: false,
    ignore: [],
    disable: [],
    failOn: true,
  };
}

const VALUE_FLAGS = new Set(["--base", "--range", "--diff", "--lang", "--threshold", "--explain", "--ignore", "--disable"]);

function parseArgs(argv: string[]): Args {
  const a = defaultArgs();
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.indexOf("=");
    const key = eq > -1 && raw.startsWith("--") ? raw.slice(0, eq) : raw;
    const inline = eq > -1 && raw.startsWith("--") ? raw.slice(eq + 1) : undefined;
    const next = (): string => {
      if (inline !== undefined) return inline;
      const v = argv[++i];
      if (v === undefined) {
        throw new Error(`missing value for ${key}`);
      }
      return v;
    };

    switch (key) {
      case "--staged":
        a.staged = true;
        break;
      case "--base":
        a.base = next();
        break;
      case "--range":
        a.range = next();
        break;
      case "--diff":
        a.diff = next();
        break;
      case "--stdin":
        a.stdin = true;
        break;
      case "--json":
        a.json = true;
        break;
      case "--md":
      case "--markdown":
        a.markdown = true;
        break;
      case "--format": {
        const v = next();
        if (v === "json") a.json = true;
        else if (v === "md" || v === "markdown") a.markdown = true;
        else if (v === "github") a.github = true;
        else if (v !== "text") throw new Error(`unknown format: ${v}`);
        break;
      }
      case "--github":
        a.github = true;
        break;
      case "--lang": {
        const v = next();
        if (v !== "en" && v !== "zh") throw new Error(`unknown language: ${v} (expected en or zh)`);
        a.lang = v;
        break;
      }
      case "--no-color":
        a.color = false;
        break;
      case "--color":
        a.color = true;
        break;
      case "--verbose":
      case "-v":
        a.verbose = true;
        break;
      case "--strict":
        a.strict = true;
        break;
      case "--threshold":
        a.threshold = parseInt(next(), 10);
        if (Number.isNaN(a.threshold)) throw new Error("--threshold expects a number");
        break;
      case "--ignore":
        a.ignore.push(next());
        break;
      case "--disable":
        a.disable.push(next());
        break;
      case "--no-fail":
        a.failOn = false;
        break;
      case "--quiet":
      case "-q":
        a.quiet = true;
        break;
      case "--list-rules":
        a.listRules = true;
        break;
      case "--explain":
        a.explain = next();
        break;
      case "--version":
        a.version = true;
        break;
      case "--help":
      case "-h":
        a.help = true;
        break;
      default:
        if (VALUE_FLAGS.has(key)) break; // already consumed above
        throw new Error(`unknown option: ${raw}`);
    }
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

interface FileConfig {
  ignore?: string[];
  ignoreRules?: string[];
  threshold?: number;
  strict?: boolean;
  lang?: Lang;
}

function loadConfig(cwd: string): { config: FileConfig; source?: string } {
  for (const name of [".cheatcheckrc.json", "cheatcheck.config.json"]) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      try {
        return { config: JSON.parse(fs.readFileSync(p, "utf8")) as FileConfig, source: p };
      } catch (err) {
        throw new Error(`invalid config ${name}: ${(err as Error).message}`);
      }
    }
  }
  return { config: {} };
}

/* ------------------------------------------------------------------ */
/* Diff source                                                         */
/* ------------------------------------------------------------------ */

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const res = spawnSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error) return { ok: false, out: "", err: res.error.message };
  return { ok: res.status === 0, out: res.stdout ?? "", err: res.stderr ?? "" };
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function resolveDiff(a: Args, cwd: string): { text: string; origin: string } {
  if (a.stdin) return { text: readStdin(), origin: "stdin" };
  if (a.diff) {
    if (a.diff === "-") return { text: readStdin(), origin: "stdin" };
    const p = path.resolve(cwd, a.diff);
    return { text: fs.readFileSync(p, "utf8"), origin: p };
  }

  if (a.range) {
    const r = git(["diff", "--no-color", "--no-ext-diff", a.range], cwd);
    if (!r.ok) throw new Error(r.err.trim() || `git diff ${a.range} failed`);
    return { text: r.out, origin: `git diff ${a.range}` };
  }
  if (a.base) {
    const spec = `${a.base}...HEAD`;
    const r = git(["diff", "--no-color", "--no-ext-diff", spec], cwd);
    if (!r.ok) throw new Error(r.err.trim() || `git diff ${spec} failed`);
    return { text: r.out, origin: `git diff ${spec}` };
  }
  if (a.staged) {
    const r = git(["diff", "--cached", "--no-color", "--no-ext-diff"], cwd);
    if (!r.ok) throw new Error(r.err.trim() || "git diff --cached failed");
    return { text: r.out, origin: "git diff --cached" };
  }

  const head = git(["rev-parse", "--verify", "HEAD"], cwd);
  if (head.ok) {
    const r = git(["diff", "HEAD", "--no-color", "--no-ext-diff"], cwd);
    if (!r.ok) throw new Error(r.err.trim() || "git diff HEAD failed");
    return { text: r.out, origin: "git diff HEAD" };
  }
  const r = git(["diff", "--no-color", "--no-ext-diff"], cwd);
  if (!r.ok) {
    throw new Error(
      "not a git repository and no --diff/--stdin given.\n" +
        "  Usage: cheatcheck --diff changes.patch\n" +
        "     or: git diff | cheatcheck --stdin"
    );
  }
  return { text: r.out, origin: "git diff" };
}

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

function detectLang(explicit?: Lang, fromConfig?: Lang): Lang {
  if (explicit) return explicit;
  if (fromConfig) return fromConfig;
  const env = process.env.CHEATCHECK_LANG;
  if (env === "zh" || env === "en") return env;
  const locale = process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? "";
  if (/^zh/i.test(locale)) return "zh";
  return "en";
}

/* ------------------------------------------------------------------ */
/* Help                                                                */
/* ------------------------------------------------------------------ */

function help(lang: Lang): string {
  if (lang === "zh") {
    return `
cheatcheck ${VERSION} — 合并前检查 AI 有没有作弊

用法
  cheatcheck                       检查工作区相对 HEAD 的改动
  cheatcheck --staged              检查暂存区（适合 pre-commit）
  cheatcheck --base origin/main    检查当前分支相对 main 的改动（适合 CI）
  git diff | cheatcheck --stdin    检查管道传入的 diff

选项
  --diff <file>       读取一个 .diff / .patch 文件（- 表示 stdin）
  --range <rev>       传给 git diff 的任意范围，如 v1.0..HEAD
  --lang <en|zh>      输出语言（默认跟随系统）
  --json | --md       机器可读 / Markdown 输出
  --format github     输出 GitHub Actions 注解
  --threshold <n>     信任分低于 n 时返回非零（默认 70）
  --strict            只要不是 PASS 就返回非零
  --disable <rule>    禁用某条规则（可重复）
  --ignore <path>     忽略某个路径前缀（可重复）
  --verbose           显示每条规则的解释
  --list-rules        列出所有规则
  --explain <rule>    解释某条规则
  --no-fail           永远返回 0
  -q, --quiet         只返回退出码
  -h, --help          显示帮助
  --version           显示版本

退出码
  0 通过    1 未通过    2 用法或环境错误
`;
  }

  return `
cheatcheck ${VERSION} — catch your agent cheating before you merge

Usage
  cheatcheck                       check the working tree against HEAD
  cheatcheck --staged              check staged changes (pre-commit hook)
  cheatcheck --base origin/main    check this branch against main (CI)
  git diff | cheatcheck --stdin    check a piped diff

Options
  --diff <file>       read a .diff / .patch file (- for stdin)
  --range <rev>       any range git diff understands, e.g. v1.0..HEAD
  --lang <en|zh>      output language (defaults to your locale)
  --json | --md       machine-readable / Markdown output
  --format github     GitHub Actions annotations
  --threshold <n>     exit non-zero below this trust score (default 70)
  --strict            exit non-zero unless the verdict is PASS
  --disable <rule>    disable a rule (repeatable)
  --ignore <path>     ignore a path prefix (repeatable)
  --verbose           show why each rule matters
  --list-rules        list every rule
  --explain <rule>    explain one rule
  --no-fail           always exit 0
  -q, --quiet         print nothing, keep the exit code
  -h, --help          show this help
  --version           print the version

Exit codes
  0 pass    1 fail    2 usage or environment error
`;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`cheatcheck: ${(err as Error).message}\n`);
    return 2;
  }

  const cwd = process.cwd();
  let fileConfig: FileConfig = {};
  try {
    fileConfig = loadConfig(cwd).config;
  } catch (err) {
    process.stderr.write(`cheatcheck: ${(err as Error).message}\n`);
    return 2;
  }

  const lang = detectLang(args.lang, fileConfig.lang);

  if (args.help) {
    process.stdout.write(help(lang));
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (args.listRules) {
    process.stdout.write(
      renderRuleList(
        RULES.map((r) => ({ id: r.id, severity: r.severity, weight: r.weight, name: r.name, why: r.why })),
        lang,
        args.color
      )
    );
    return 0;
  }
  if (args.explain) {
    const rule = ruleById(args.explain);
    if (!rule) {
      process.stderr.write(`cheatcheck: unknown rule "${args.explain}". Try --list-rules.\n`);
      return 2;
    }
    process.stdout.write(
      renderRuleExplain(
        { id: rule.id, severity: rule.severity, weight: rule.weight, name: rule.name, why: rule.why },
        lang,
        args.color
      )
    );
    return 0;
  }

  let diffText: string;
  let origin: string;
  try {
    const resolved = resolveDiff(args, cwd);
    diffText = resolved.text;
    origin = resolved.origin;
  } catch (err) {
    process.stderr.write(`cheatcheck: ${(err as Error).message}\n`);
    return 2;
  }

  if (!diffText.trim()) {
    if (!args.quiet && !args.json && !args.markdown && !args.github) {
      process.stdout.write(lang === "zh" ? "\n  cheatcheck: 没有检测到改动。\n\n" : "\n  cheatcheck: no changes to check.\n\n");
    }
    return 0;
  }

  const files = parseDiff(diffText);

  const cfg: Config = {
    ignore: [...(fileConfig.ignore ?? []), ...args.ignore],
    ignoreRules: [...(fileConfig.ignoreRules ?? []), ...args.disable],
    threshold: args.threshold ?? fileConfig.threshold ?? 70,
    strict: args.strict || fileConfig.strict === true,
  };

  const analysis = analyze(files, cfg);

  const color = args.color && !args.json && !args.markdown && !args.github && supportsColor();

  if (!args.quiet) {
    if (args.json) {
      process.stdout.write(renderJson(analysis) + "\n");
    } else if (args.markdown) {
      process.stdout.write(renderMarkdown(analysis, lang) + "\n");
    } else if (args.github) {
      process.stdout.write(renderGithub(analysis, lang) + "\n");
    } else {
      if (args.verbose) {
        process.stdout.write(`\n  diff source: ${origin}\n`);
      }
      process.stdout.write(
        renderReport(analysis, {
          lang,
          color,
          verbose: args.verbose,
          version: VERSION,
          width: process.stdout.columns,
        })
      );
    }
  }

  if (!args.failOn) return 0;
  return shouldFail(analysis, cfg) ? 1 : 0;
}

function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0") return true;
  return Boolean(process.stdout.isTTY);
}

try {
  process.exitCode = main();
} catch (err) {
  process.stderr.write(`cheatcheck: unexpected error: ${(err as Error).message}\n`);
  process.exitCode = 2;
}
