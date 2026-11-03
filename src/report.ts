import { Analysis, Finding, Lang, Severity, Verdict } from "./types";

/* ------------------------------------------------------------------ */
/* Terminal styling                                                    */
/* ------------------------------------------------------------------ */

type Paint = (code: string, s: string) => string;

function makePaint(enabled: boolean): Paint {
  if (!enabled) return (_code, s) => s;
  return (code, s) => `\u001b[${code}m${s}\u001b[0m`;
}

const ANSI = {
  bold: "1",
  dim: "2",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  cyan: "36",
  gray: "90",
  brightRed: "91",
};

const SEVERITY_ICON: Record<Severity, string> = {
  critical: "✖",
  high: "▲",
  medium: "●",
  low: "·",
};

const SEVERITY_ANSI: Record<Severity, string> = {
  critical: ANSI.red,
  high: ANSI.yellow,
  medium: ANSI.cyan,
  low: ANSI.gray,
};

const VERDICT_ANSI: Record<Verdict, string> = {
  pass: ANSI.green,
  review: ANSI.yellow,
  risky: ANSI.yellow,
  fail: ANSI.red,
};

const VERDICT_LABEL: Record<Verdict, Record<Lang, string>> = {
  pass: { en: "PASS", zh: "通过" },
  review: { en: "REVIEW", zh: "待复核" },
  risky: { en: "RISKY", zh: "可疑" },
  fail: { en: "FAIL", zh: "不通过" },
};

const TAGLINE: Record<Verdict, Record<Lang, string>> = {
  pass: {
    en: "Nothing suspicious. Merge with confidence.",
    zh: "没发现可疑改动，可以放心合并。",
  },
  review: {
    en: "Nothing damning, but a human should read this diff.",
    zh: "没有致命问题，但建议人工过一遍这个 diff。",
  },
  risky: {
    en: "This diff is hiding work. Read it before you merge.",
    zh: "这个 diff 在藏东西，合并前请仔细读。",
  },
  fail: {
    en: "The agent said it was done. The diff says otherwise.",
    zh: "Agent 说它做完了，diff 表示不同意。",
  },
};

const REMOVED_RULES = new Set(["test-deleted", "test-file-deleted", "assertions-removed"]);

function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(s: string): number {
  let width = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0) ?? 0;
    const wide =
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return width;
}

function padEndVisible(s: string, width: number): string {
  const gap = width - visibleLength(s);
  return gap > 0 ? s + " ".repeat(gap) : s;
}

/* ------------------------------------------------------------------ */
/* Text report                                                         */
/* ------------------------------------------------------------------ */

export interface ReportOptions {
  lang: Lang;
  color: boolean;
  verbose?: boolean;
  version: string;
  width?: number;
}

function bar(score: number, width: number): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

export function renderReport(a: Analysis, opts: ReportOptions): string {
  const { lang } = opts;
  const p = makePaint(opts.color);
  const width = Math.min(96, Math.max(60, opts.width ?? 80));
  const out: string[] = [];

  const zh = lang === "zh";
  const label = VERDICT_LABEL[a.verdict][lang];
  const vcolor = VERDICT_ANSI[a.verdict];

  out.push("");
  out.push("  " + p(ANSI.bold, "cheatcheck") + p(ANSI.gray, ` ${opts.version}`));
  out.push("");

  const stats = zh
    ? `${a.files} 个文件  +${a.added} −${a.removed}`
    : `${a.files} file${a.files === 1 ? "" : "s"} changed  +${a.added} −${a.removed}`;
  out.push("  " + p(ANSI.gray, stats));
  out.push("");

  const scoreStr = p(vcolor + ";" + ANSI.bold, String(a.score).padStart(3, " "));
  out.push(
    "  " +
      p(vcolor + ";" + ANSI.bold, padEndVisible(label, 8)) +
      scoreStr +
      p(ANSI.gray, " / 100   ") +
      p(vcolor, bar(a.score, 24))
  );
  out.push("");

  const shown = a.findings.slice(0, opts.verbose ? 40 : 10);
  if (shown.length === 0) {
    out.push("  " + p(ANSI.green, zh ? "✓ 没有发现可疑改动。" : "✓ No suspicious changes found."));
    out.push("");
  }

  const ruleWidth = Math.min(28, Math.max(...shown.map((f) => visibleLength(f.ruleName[lang])), 10));

  for (const f of shown) {
    out.push(renderFinding(f, opts, ruleWidth));
  }

  if (a.findings.length > shown.length) {
    out.push(
      "  " +
        p(
          ANSI.gray,
          zh ? `… 还有 ${a.findings.length - shown.length} 条（--verbose 查看全部）` : `… ${a.findings.length - shown.length} more (use --verbose)`
        )
    );
    out.push("");
  }

  out.push("  " + p(ANSI.gray, "─".repeat(width - 4)));
  const parts: string[] = [];
  const names: Record<Severity, Record<Lang, string>> = {
    critical: { en: "critical", zh: "严重" },
    high: { en: "high", zh: "高" },
    medium: { en: "medium", zh: "中" },
    low: { en: "low", zh: "低" },
  };
  for (const s of ["critical", "high", "medium", "low"] as Severity[]) {
    if (a.bySeverity[s] === 0) continue;
    parts.push(p(SEVERITY_ANSI[s], `${a.bySeverity[s]} ${names[s][lang]}`));
  }
  out.push("  " + (parts.length ? parts.join(p(ANSI.gray, " · ")) : p(ANSI.gray, zh ? "无问题" : "clean")));
  out.push("  " + p(ANSI.gray, TAGLINE[a.verdict][lang]));
  out.push("");

  return out.join("\n");
}

function renderFinding(f: Finding, opts: ReportOptions, ruleWidth: number): string {
  const p = makePaint(opts.color);
  const { lang } = opts;
  const icon = p(SEVERITY_ANSI[f.severity], SEVERITY_ICON[f.severity]);
  const name = p(ANSI.bold, padEndVisible(f.ruleName[lang], ruleWidth));
  const line: string[] = [];
  line.push("  " + icon + " " + name + "  " + f.message[lang]);

  if (opts.verbose) {
    line.push("    " + p(ANSI.gray, f.why[lang]));
  }

  const loc = f.line ? `${f.file}:${f.line}` : f.file;
  line.push("    " + p(ANSI.cyan, loc));

  const sign = REMOVED_RULES.has(f.rule) ? "−" : "+";
  const indent = "      ";
  for (const ev of f.evidence) {
    const marked = /^([+−-])\s+(.*)$/.exec(ev);
    if (marked) {
      const s = marked[1] === "-" ? "−" : marked[1];
      line.push(indent + p(s === "−" ? ANSI.red : ANSI.green, s + " ") + p(ANSI.gray, marked[2]));
    } else {
      line.push(indent + p(sign === "−" ? ANSI.red : ANSI.green, sign + " ") + p(ANSI.gray, ev));
    }
  }
  line.push("");
  return line.join("\n");
}

/* ------------------------------------------------------------------ */
/* Other formats                                                       */
/* ------------------------------------------------------------------ */

export function renderJson(a: Analysis): string {
  return JSON.stringify(
    {
      score: a.score,
      verdict: a.verdict,
      files: a.files,
      added: a.added,
      removed: a.removed,
      counts: a.bySeverity,
      findings: a.findings.map((f) => ({
        rule: f.rule,
        severity: f.severity,
        file: f.file,
        line: f.line ?? null,
        message: f.message,
        evidence: f.evidence,
        deduction: f.deduction,
      })),
    },
    null,
    2
  );
}

export function renderMarkdown(a: Analysis, lang: Lang): string {
  const zh = lang === "zh";
  const label = VERDICT_LABEL[a.verdict][lang];
  const rows = a.findings
    .slice(0, 30)
    .map((f) => {
      const loc = f.line ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``;
      const msg = f.message[lang].replace(/\|/g, "\\|");
      const ev = f.evidence[0] ? `\n<sub>\`${f.evidence[0].replace(/`/g, "'")}\`</sub>` : "";
      return `| ${f.severity} | ${f.rule} | ${loc} | ${msg}${ev} |`;
    })
    .join("\n");

  const table = rows
    ? `| severity | rule | file | detail |\n| --- | --- | --- | --- |\n${rows}`
    : zh
      ? "没有发现可疑改动。"
      : "No suspicious changes found.";

  return [
    `## cheatcheck — ${label} · ${a.score}/100`,
    "",
    zh
      ? `${a.files} 个文件，+${a.added} −${a.removed} 行。${TAGLINE[a.verdict][lang]}`
      : `${a.files} files changed, +${a.added} −${a.removed} lines. ${TAGLINE[a.verdict][lang]}`,
    "",
    table,
    "",
    "<sub>Generated by [cheatcheck](https://github.com/cheatcheck/cheatcheck) — catch agent cheating before you merge.</sub>",
  ].join("\n");
}

export function renderGithub(a: Analysis, lang: Lang): string {
  const level = a.verdict === "fail" || a.verdict === "risky" ? "error" : "warning";
  const lines = a.findings.map((f) => {
    const file = f.file.replace(/%/g, "%25").replace(/\r?\n/g, " ");
    const line = f.line ?? 1;
    const msg = f.message[lang].replace(/\r?\n/g, " ");
    return `::${level} file=${file},line=${line},title=cheatcheck/${f.rule}::${msg}`;
  });
  lines.unshift(`::notice::cheatcheck: ${a.score}/100 (${a.verdict})`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Rule listing                                                        */
/* ------------------------------------------------------------------ */

export interface RuleInfo {
  id: string;
  severity: Severity;
  weight: number;
  name: Record<Lang, string>;
  why: Record<Lang, string>;
}

export function renderRuleList(rules: RuleInfo[], lang: Lang, color: boolean): string {
  const p = makePaint(color);
  const out: string[] = [""];
  out.push("  " + p(ANSI.bold, "cheatcheck rules") + p(ANSI.gray, `  ${rules.length} checks`));
  out.push("");
  const w = Math.max(...rules.map((r) => r.id.length), 12);
  for (const r of rules) {
    out.push(
      "  " + p(SEVERITY_ANSI[r.severity], r.severity.padEnd(9)) + p(ANSI.bold, r.id.padEnd(w + 2)) + r.name[lang]
    );
  }
  out.push("");
  out.push("  " + p(ANSI.gray, lang === "zh" ? "查看某条规则：cheatcheck --explain <rule>" : "Explain one: cheatcheck --explain <rule>"));
  out.push("");
  return out.join("\n");
}

export function renderRuleExplain(rule: RuleInfo, lang: Lang, color: boolean): string {
  const p = makePaint(color);
  const out: string[] = [""];
  out.push("  " + p(ANSI.bold, rule.id) + "  " + p(SEVERITY_ANSI[rule.severity], `[${rule.severity}]`));
  out.push("");
  out.push("  " + rule.name[lang]);
  out.push("");
  out.push("  " + p(ANSI.gray, rule.why[lang]));
  out.push("");
  return out.join("\n");
}
