"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deductionFor = deductionFor;
exports.verdictFor = verdictFor;
exports.analyze = analyze;
exports.shouldFail = shouldFail;
const rules_1 = require("./rules");
const diff_1 = require("./diff");
const SEVERITY_ORDER = ["critical", "high", "medium", "low"];
function deductionFor(weight, count = 1) {
    const raw = weight * (1 + 0.35 * Math.max(0, count - 1));
    return Math.round(Math.min(raw, weight * 2));
}
function verdictFor(score) {
    if (score >= 90)
        return "pass";
    if (score >= 70)
        return "review";
    if (score >= 40)
        return "risky";
    return "fail";
}
function analyze(input, cfg) {
    const files = (0, rules_1.applicableFiles)(input, cfg);
    const findings = [];
    for (const meta of rules_1.RULES) {
        if (cfg.ignoreRules.includes(meta.id))
            continue;
        let raws = [];
        try {
            raws = meta.run(files, cfg);
        }
        catch {
            // A single bad rule must never take the whole check down.
            raws = [];
        }
        for (const raw of raws) {
            findings.push({
                ...raw,
                rule: meta.id,
                severity: meta.severity,
                ruleName: meta.name,
                why: meta.why,
                deduction: deductionFor(meta.weight, raw.count ?? 1),
            });
        }
    }
    findings.sort((a, b) => b.deduction - a.deduction || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    // A rule that fires in five files is one problem, not five. Aggregate per rule
    // and charge the whole deduction once.
    const byRule = new Map();
    for (const f of findings) {
        const list = byRule.get(f.rule);
        if (list)
            list.push(f);
        else
            byRule.set(f.rule, [f]);
    }
    for (const [rule, list] of byRule) {
        const meta = rules_1.RULES.find((r) => r.id === rule);
        if (!meta)
            continue;
        const total = list.reduce((n, f) => n + (f.count ?? 1), 0);
        const deduction = deductionFor(meta.weight, total);
        list.forEach((f, i) => {
            f.deduction = i === 0 ? deduction : 0;
        });
    }
    findings.sort((a, b) => b.deduction - a.deduction || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    const stats = (0, diff_1.diffStats)(files);
    const remaining = findings.reduce((acc, f) => acc * (1 - Math.min(1, f.deduction / 100)), 1);
    let score = 100 * remaining;
    if (findings.some((f) => f.severity === "critical"))
        score = Math.min(score, 39);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings)
        bySeverity[f.severity]++;
    const triggered = [...new Set(findings.map((f) => f.rule))];
    return {
        files: stats.files,
        added: stats.added,
        removed: stats.removed,
        score,
        verdict: verdictFor(score),
        findings,
        bySeverity,
        triggered,
    };
}
function shouldFail(a, cfg) {
    if (a.score < cfg.threshold)
        return true;
    if (cfg.strict && a.verdict !== "pass")
        return true;
    return false;
}
