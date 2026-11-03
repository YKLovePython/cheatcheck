"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULES = void 0;
exports.ruleById = ruleById;
exports.applicableFiles = applicableFiles;
const files_1 = require("./files");
/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */
const LEAF_DECL = [
    /(?<!\.)\b(it|test|specify)\s*(\.\s*(only|skip|todo|failing|concurrent|each|sequential))?\s*\(/,
    /^\s*(?:async\s+)?def\s+test_\w+\s*\(/,
    /^\s*func\s+(Test|Benchmark|Fuzz)\w*\s*\(/,
    /^\s*#\[(?:tokio::)?test\]/,
    /^\s*@(Test|ParameterizedTest|RepeatedTest)\b/,
    /^\s*\[(Fact|Theory|Test|TestMethod)\]/,
    /^\s*(it|specify)\s+['"`]/,
    /^\s*function\s+test\w*\s*\(/i,
];
const SKIP = [
    /\.\s*(skip|only|todo|failing)\s*\(/,
    /(?<!\.)\b(xit|xdescribe|xspecify|fit|fdescribe)\s*\(/,
    /@pytest\.mark\.(skip|skipif|xfail)\b/,
    /@unittest\.skip\b/,
    /@Ignore\b/,
    /\bt\.Skip\w*\s*\(/,
    /\bthis\.Skip\s*\(/,
    /#\[ignore\]/,
    /@Disabled\b/,
    /\.skipIf\s*\(/,
    /@skip\s*\(/,
    /\bpytest\.skip\s*\(/,
];
const ASSERT = [
    /\bexpect\s*\(/,
    /(?<!\.)\bassert\w*\s*[(!]/,
    /^\s*assert\s+/,
    /\bAssert\.\w+\s*\(/,
    /\bassert_eq!|\bassert!|\bassert_ne!/,
    /\bt\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b/,
    /\brequire\.\w+\s*\(/,
    /\.should\b/,
];
const STRICT_MATCHER = /\.to(?:Be|Equal|StrictEqual|Match|Contain|Throw|HaveLength|HaveProperty)\s*\(/;
const LOOSE_MATCHER = /\.to(?:BeTruthy|BeFalsy|BeDefined|BeUndefined|BeNull)\s*\(|expect\.anything\s*\(|\.not\.toBeNull\s*\(|assertTrue\s*\(|assertIsNotNone\s*\(/;
const DISABLED = [
    /@ts-ignore\b/,
    /@ts-nocheck\b/,
    /@ts-expect-error\b/,
    /\beslint-disable(?:-next-line|-line)?\b/,
    /#\s*type:\s*ignore\b/,
    /#\s*noqa\b/,
    /#\s*pylint:\s*disable\b/,
    /\bistanbul ignore\b/,
    /\bc8 ignore\b/,
    /\/\/\s*nolint\b/,
    /\/\*\s*nolint\b/,
    /#\[allow\(/,
    /@SuppressWarnings\b/,
    /\/\*\s*prettier-ignore\s*\*\//,
];
const LOOSENED = [
    /["']strict["']\s*:\s*false/,
    /["']skipLibCheck["']\s*:\s*true/,
    /\btestPathIgnorePatterns\b/,
    /\b--passWithNoTests\b/,
    /\b--forceExit\b/,
    /\b--no-verify\b/,
    /\bcontinue-on-error\s*:\s*true\b/,
    /^\s*fail_under\s*=\s*0\s*$/,
];
const MOCK = [
    /\bjest\.mock\s*\(/,
    /\bvi\.mock\s*\(/,
    /\bsinon\.(stub|mock|spy)\s*\(/,
    /@patch\s*\(/,
    /\bMagicMock\s*\(/,
    /\bmocker\.patch\s*\(/,
    /\bnock\s*\(/,
    /\bhttp\.mock\s*\(/,
];
const STUB = [
    /throw new Error\(\s*['"`](?:not implemented|unimplemented|todo)/i,
    /\braise\s+NotImplementedError\b/,
    /panic!\(\s*"(?:not implemented|todo|unimplemented)/i,
    /\bnot implemented\b/i,
    /\bTODO[:\s].*\b(?:implement|finish|stub|placeholder)\b/i,
    /\breturn\s+(?:null|undefined|nil)\s*;?\s*(?:\/\/|\/\*)?\s*(?:todo|stub|placeholder|not implemented)/i,
];
/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function matchesAny(text, patterns) {
    return patterns.some((re) => re.test(text));
}
function isAssertion(text) {
    return matchesAny(text, ASSERT);
}
const STRING_LITERAL = /(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g;
/**
 * Remove quoted string contents before looking for directives. Test fixtures and
 * documentation frequently contain `"// @ts-ignore"` as data, not as a directive.
 * Unclosed quotes (an apostrophe in prose) are deliberately left alone.
 */
function stripStrings(text) {
    return text.replace(STRING_LITERAL, '""');
}
/** Position of the first suppression marker, or -1. */
function disableIndex(text) {
    let best = -1;
    for (const re of DISABLED) {
        const m = re.exec(text);
        if (m && (best === -1 || m.index < best))
            best = m.index;
    }
    return best;
}
/**
 * A suppression only counts when it sits in a comment or is a language attribute.
 * This keeps prose (`* \`@ts-nocheck\` is a white flag`) and the detector's own
 * regex literals from being reported as suppressions.
 */
function isSuppressionDirective(text) {
    const idx = disableIndex(text);
    if (idx < 0)
        return false;
    const before = text.slice(0, idx);
    if (/(?:\/\/|\/\*|#)\s*$/.test(before))
        return true;
    // `# type: ignore` and `# noqa` include the comment marker in the match itself.
    if (text[idx] === "#" && (before.trim() === "" || /\s$/.test(before)))
        return true;
    return /^(?:@SuppressWarnings\b|#\[allow\()/.test(text.trim());
}
/**
 * A suppression comment is only interesting when it is unexplained or blanket.
 * `eslint-disable-next-line no-console -- we log on purpose here` is engineering;
 * `@ts-nocheck` at the top of a file is a white flag.
 */
function classifyDisable(raw) {
    const t = stripStrings(raw).trim();
    if (!isSuppressionDirective(t))
        return null;
    const reason = (() => {
        const dash = /(?:--|—)\s*(.+)$/.exec(t);
        if (dash)
            return dash[1].trim();
        const ts = /@ts-(?:ignore|expect-error|nocheck)\b[: ]\s*(.+)$/.exec(t);
        if (ts)
            return ts[1].trim();
        return "";
    })();
    if (reason.length >= 12)
        return "justified";
    if (/@ts-nocheck\b/.test(t))
        return "blanket";
    if (/istanbul ignore file|c8 ignore file/.test(t))
        return "blanket";
    if (/#!\[allow\(/.test(t))
        return "blanket";
    if (/\beslint-disable(?!-)\b/.test(t)) {
        const rest = (t.split(/\beslint-disable(?!-)\b/)[1] ?? "")
            .replace(/(?:--|—).*$/, "")
            .replace(/\*\/\s*$/, "")
            .trim();
        return rest === "" ? "blanket" : "targeted";
    }
    if (/#\s*type:\s*ignore\b/.test(t) && !/#\s*type:\s*ignore\[/.test(t))
        return "blanket";
    if (/#\s*noqa\b(?!\s*:)/.test(t))
        return "blanket";
    if (/#\s*pylint:\s*disable\b(?!\s*=)/.test(t))
        return "blanket";
    if (/\/\/\s*nolint\b(?!:)/.test(t))
        return "blanket";
    return "targeted";
}
function trimEvidence(lines, max = 3) {
    return lines
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .slice(0, max)
        .map((l) => (l.length > 110 ? l.slice(0, 107) + "..." : l));
}
/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */
const testDeleted = {
    id: "test-deleted",
    severity: "critical",
    weight: 30,
    name: { en: "tests removed", zh: "测试被删除" },
    why: {
        en: "A test disappeared and nothing replaced it. This is the cheapest way for an agent to turn red into green.",
        zh: "有测试消失了，而且没有替代品。这是 Agent 把红色变绿色最省事的办法。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if (f.status === "deleted" || !(0, files_1.isTestFile)(f.path) || (0, files_1.isSnapshotFile)(f.path))
                continue;
            const removed = f.removed.filter((l) => matchesAny(stripStrings(l.text), LEAF_DECL));
            if (removed.length === 0)
                continue;
            const added = f.added.filter((l) => matchesAny(stripStrings(l.text), LEAF_DECL));
            const net = removed.length - added.length;
            if (net <= 0)
                continue;
            out.push({
                file: f.path,
                line: removed[0].line,
                evidence: trimEvidence(removed.map((l) => l.text)),
                message: {
                    en: `${net} fewer test${net > 1 ? "s" : ""} (net)`,
                    zh: `净减少 ${net} 个测试`,
                },
                count: net,
            });
        }
        return out;
    },
};
const testFileDeleted = {
    id: "test-file-deleted",
    severity: "critical",
    weight: 30,
    name: { en: "test file deleted", zh: "测试文件被删除" },
    why: {
        en: "An entire test file is gone. Unless it was renamed, its coverage vanished with it.",
        zh: "整个测试文件没了。除非它是被重命名，否则覆盖也一起没了。",
    },
    run(files) {
        const surviving = files.filter((f) => f.status !== "deleted" && (0, files_1.isTestFile)(f.path)).map((f) => (0, files_1.testBasename)(f.path));
        const out = [];
        for (const f of files) {
            if (f.status !== "deleted" || !(0, files_1.isTestFile)(f.path))
                continue;
            if (surviving.includes((0, files_1.testBasename)(f.path)))
                continue;
            const gone = f.removed.filter((l) => matchesAny(l.text, LEAF_DECL)).length;
            out.push({
                file: f.path,
                evidence: trimEvidence(f.removed.map((l) => l.text)),
                message: {
                    en: gone > 0 ? `${gone} test${gone > 1 ? "s" : ""} deleted with the file` : "entire file removed",
                    zh: gone > 0 ? `${gone} 个测试随文件一起消失` : "整个文件被删除",
                },
                count: Math.max(1, gone),
            });
        }
        return out;
    },
};
const testSkipped = {
    id: "test-skipped",
    severity: "critical",
    weight: 25,
    name: { en: "tests skipped", zh: "测试被跳过" },
    why: {
        en: "Skipped tests still show up as green. `.only` is worse: it silently disables every other test in the file.",
        zh: "被跳过的测试依然显示绿色。`.only` 更糟：它会静默禁用同文件里其它所有测试。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if (!(0, files_1.isTestFile)(f.path))
                continue;
            const hits = f.added.filter((l) => matchesAny(stripStrings(l.text), SKIP));
            if (hits.length === 0)
                continue;
            out.push({
                file: f.path,
                line: hits[0].line,
                evidence: trimEvidence(hits.map((l) => l.text)),
                message: {
                    en: `${hits.length} test${hits.length > 1 ? "s" : ""} skipped`,
                    zh: `跳过了 ${hits.length} 个测试`,
                },
                count: hits.length,
            });
        }
        return out;
    },
};
const testIgnored = {
    id: "test-ignored",
    severity: "critical",
    weight: 25,
    name: { en: "tests excluded from the run", zh: "测试被排除在运行之外" },
    why: {
        en: "The diff adds an ignore pattern or config entry that keeps tests from running. Green means nothing now.",
        zh: "diff 里新增了忽略规则或配置，让测试根本不跑。这时候的绿色毫无意义。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            const base = f.path.split("/").pop() ?? "";
            if (/^\.(git|eslint|prettier)ignore$/.test(base)) {
                const hits = f.added.filter((l) => /(^|[\/.])(tests?|specs?|__tests__|__snapshots__|snapshots)\b|\.(test|spec)\.|_test\./i.test(l.text.trim()));
                if (hits.length > 0) {
                    out.push({
                        file: f.path,
                        line: hits[0].line,
                        evidence: trimEvidence(hits.map((l) => l.text)),
                        message: {
                            en: "test path added to an ignore file",
                            zh: "测试路径被加进了忽略文件",
                        },
                        count: hits.length,
                    });
                }
            }
            if (/(^|\/)(jest|vitest)\.config\.[cm]?[jt]s$/.test(f.path) || base === "package.json") {
                const hits = f.added.filter((l) => /testPathIgnorePatterns|testRegex|testMatch/.test(l.text));
                if (hits.length > 0) {
                    out.push({
                        file: f.path,
                        line: hits[0].line,
                        evidence: trimEvidence(hits.map((l) => l.text)),
                        message: {
                            en: "test discovery config changed",
                            zh: "测试发现配置被改动",
                        },
                        count: hits.length,
                    });
                }
            }
        }
        return out;
    },
};
const assertionsRemoved = {
    id: "assertions-removed",
    severity: "high",
    weight: 18,
    name: { en: "assertions removed", zh: "断言被删除" },
    why: {
        en: "Tests still exist, but they assert less. A test with no assertion passes forever.",
        zh: "测试还在，但断言变少了。没有断言的测试永远都会通过。",
    },
    run(files) {
        let removed = 0;
        let added = 0;
        let where;
        let line;
        const evidence = [];
        for (const f of files) {
            if (!(0, files_1.isTestFile)(f.path) || f.status === "deleted" || (0, files_1.isSnapshotFile)(f.path))
                continue;
            for (const l of f.removed) {
                if (!isAssertion(stripStrings(l.text)))
                    continue;
                removed++;
                if (!where) {
                    where = f;
                    line = l.line;
                }
                if (evidence.length < 3)
                    evidence.push(l.text);
            }
            for (const l of f.added) {
                if (isAssertion(stripStrings(l.text)))
                    added++;
            }
        }
        const net = removed - added;
        if (!where || net < 2)
            return [];
        return [
            {
                file: where.path,
                line,
                evidence: trimEvidence(evidence),
                message: {
                    en: `${net} assertion${net > 1 ? "s" : ""} removed net`,
                    zh: `净减少 ${net} 处断言`,
                },
                count: net,
            },
        ];
    },
};
const assertionWeakened = {
    id: "assertion-weakened",
    severity: "high",
    weight: 20,
    name: { en: "assertions weakened", zh: "断言被弱化" },
    why: {
        en: "A precise matcher was swapped for a vague one. `toBeTruthy()` accepts almost anything — including the bug.",
        zh: "精确的断言被换成了模糊的断言。`toBeTruthy()` 几乎什么都接受——包括那个 bug。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if (!(0, files_1.isTestFile)(f.path))
                continue;
            const strictRemoved = f.removed.filter((l) => STRICT_MATCHER.test(stripStrings(l.text)));
            const looseAdded = f.added.filter((l) => LOOSE_MATCHER.test(stripStrings(l.text)));
            if (strictRemoved.length === 0 || looseAdded.length === 0)
                continue;
            out.push({
                file: f.path,
                line: looseAdded[0].line,
                evidence: trimEvidence([
                    ...looseAdded.map((l) => "+ " + l.text),
                    ...strictRemoved.map((l) => "− " + l.text),
                ]),
                message: {
                    en: `${looseAdded.length} vague matcher${looseAdded.length > 1 ? "s" : ""} replaced ${looseAdded.length > 1 ? "precise ones" : "a precise one"}`,
                    zh: `${looseAdded.length} 处精确断言换成了模糊断言`,
                },
                count: looseAdded.length,
            });
        }
        return out;
    },
};
const errorSwallowed = {
    id: "error-swallowed",
    severity: "high",
    weight: 18,
    name: { en: "errors swallowed", zh: "异常被吞掉" },
    why: {
        en: "The new code catches an error and does nothing with it. Failures become invisible instead of fixed.",
        zh: "新代码捕获了异常却什么都不做。失败没有消失，只是看不见了。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if ((0, files_1.isNoiseFile)(f.path))
                continue;
            const lines = f.added;
            const hits = [];
            for (let i = 0; i < lines.length; i++) {
                const cur = lines[i];
                const t = stripStrings(cur.text);
                const sameLineEmpty = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*|\/\*[^\n]*\*\/)?\s*\}\s*;?\s*$/.test(t);
                if (sameLineEmpty) {
                    hits.push(cur);
                    continue;
                }
                const opensBrace = /catch\s*(?:\([^)]*\))?\s*\{\s*$/.test(t);
                if (opensBrace) {
                    const next = lines[i + 1];
                    const after = lines[i + 2];
                    if (next && next.line === cur.line + 1 && /^\s*\}\s*;?\s*$/.test(next.text)) {
                        hits.push(cur);
                        continue;
                    }
                    if (next &&
                        after &&
                        next.line === cur.line + 1 &&
                        after.line === cur.line + 2 &&
                        /^\s*(?:\/\/|\/\*)/.test(next.text) &&
                        /^\s*\}\s*;?\s*$/.test(after.text)) {
                        hits.push(cur);
                        continue;
                    }
                }
                if (/except[^:]*:\s*(?:pass|\.\.\.)\s*$/.test(t)) {
                    hits.push(cur);
                    continue;
                }
                if (/except[^:]*:\s*$/.test(t)) {
                    const next = lines[i + 1];
                    if (next && next.line === cur.line + 1 && /^\s*(?:pass|\.\.\.)\s*$/.test(next.text))
                        hits.push(cur);
                    continue;
                }
                if (/\.catch\(\s*(?:\(\s*\)|\(\w+\))?\s*=>\s*\{\s*\}\s*\)/.test(t))
                    hits.push(cur);
            }
            if (hits.length > 0) {
                out.push({
                    file: f.path,
                    line: hits[0].line,
                    evidence: trimEvidence(hits.map((h) => h.text)),
                    message: {
                        en: `${hits.length} swallowed error${hits.length > 1 ? "s" : ""}`,
                        zh: `${hits.length} 处异常被吞掉`,
                    },
                    count: hits.length,
                });
            }
        }
        return out;
    },
};
const checksDisabled = (() => {
    const make = (id, severity, weight, mode) => ({
        id,
        severity,
        weight,
        name: mode === "blanket"
            ? { en: "checks disabled", zh: "检查被关闭" }
            : { en: "lint suppressed", zh: "lint 被抑制" },
        why: mode === "blanket"
            ? {
                en: "A type or lint check was switched off for a whole file or crate, with no comment explaining why.",
                zh: "整个文件或整个 crate 的类型/lint 检查被关掉了，而且没有一句解释。",
            }
            : {
                en: "A check was silenced for one line with no reason given. Fine occasionally, suspicious in bulk.",
                zh: "单行检查被静默，且没有说明原因。偶尔可以，成批出现就可疑了。",
            },
        run(files) {
            const out = [];
            for (const f of files) {
                if ((0, files_1.isNoiseFile)(f.path))
                    continue;
                const hits = f.added.filter((l) => classifyDisable(l.text) === mode);
                if (hits.length === 0)
                    continue;
                out.push({
                    file: f.path,
                    line: hits[0].line,
                    evidence: trimEvidence(hits.map((l) => l.text)),
                    message: mode === "blanket"
                        ? {
                            en: `${hits.length} blanket suppression${hits.length > 1 ? "s" : ""}`,
                            zh: `${hits.length} 处整体性抑制`,
                        }
                        : {
                            en: `${hits.length} unjustified suppression${hits.length > 1 ? "s" : ""}`,
                            zh: `${hits.length} 处无理由抑制`,
                        },
                    count: hits.length,
                });
            }
            return out;
        },
    });
    return [make("checks-disabled", "high", 15, "blanket"), make("lint-suppressed", "medium", 8, "targeted")];
})();
const configLoosened = {
    id: "config-loosened",
    severity: "high",
    weight: 15,
    name: { en: "configuration loosened", zh: "配置被放宽" },
    why: {
        en: "The project's own guardrails were relaxed: stricter checks off, failing runs allowed to continue.",
        zh: "项目自己的护栏被放松了：关闭严格检查、允许失败的流水线继续。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            const base = f.path.split("/").pop() ?? "";
            const isWorkflow = /^\.github\/workflows\/.+\.ya?ml$/.test(f.path);
            if (!(0, files_1.isConfigFile)(f.path) && !isWorkflow && base !== "pyproject.toml")
                continue;
            const hits = f.added.filter((l) => matchesAny(l.text, LOOSENED));
            if (hits.length === 0)
                continue;
            out.push({
                file: f.path,
                line: hits[0].line,
                evidence: trimEvidence(hits.map((l) => l.text)),
                message: {
                    en: "guardrails relaxed",
                    zh: "护栏被放宽",
                },
                count: hits.length,
            });
        }
        return out;
    },
};
const mockUnderTest = {
    id: "mock-under-test",
    severity: "critical",
    weight: 25,
    name: { en: "module under test is mocked", zh: "被测模块被 mock" },
    why: {
        en: "The test mocks the very module it is supposed to verify. It now tests the mock, and the mock always passes.",
        zh: "测试把本该验证的模块自己 mock 掉了。它现在测的是 mock，而 mock 永远通过。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if (!(0, files_1.isTestFile)(f.path))
                continue;
            const mod = (0, files_1.moduleBasename)(f.path);
            const hits = f.added.filter((l) => {
                const m = /(?:jest|vi)\.mock\s*\(\s*['"`]([^'"`]+)['"`]/.exec(l.text);
                if (!m)
                    return false;
                const target = (m[1].split("/").pop() ?? "").replace(/\.[cm]?[jt]sx?$/, "").toLowerCase();
                return target === mod;
            });
            if (hits.length === 0)
                continue;
            out.push({
                file: f.path,
                line: hits[0].line,
                evidence: trimEvidence(hits.map((l) => l.text)),
                message: {
                    en: `the unit under test is mocked`,
                    zh: `被测模块被 mock`,
                },
                count: hits.length,
            });
        }
        return out;
    },
};
const mockInflation = {
    id: "mock-inflation",
    severity: "medium",
    weight: 10,
    name: { en: "heavy mocking", zh: "大量 mock" },
    why: {
        en: "A large number of new mocks usually means the integration was replaced by a story about it.",
        zh: "一次新增大量 mock，通常意味着真正的集成被一个关于它的故事替代了。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if (!(0, files_1.isTestFile)(f.path))
                continue;
            const hits = f.added.filter((l) => matchesAny(stripStrings(l.text), MOCK));
            if (hits.length < 3)
                continue;
            out.push({
                file: f.path,
                line: hits[0].line,
                evidence: trimEvidence(hits.map((l) => l.text)),
                message: {
                    en: `${hits.length} new mocks`,
                    zh: `新增 ${hits.length} 处 mock`,
                },
                count: hits.length,
            });
        }
        return out;
    },
};
const stubImplementation = {
    id: "stub-implementation",
    severity: "medium",
    weight: 12,
    name: { en: "stub implementation", zh: "桩实现" },
    why: {
        en: "The code was written to look finished rather than to work. `not implemented` is not a feature.",
        zh: "代码是为了看起来完成，而不是真的能用。`not implemented` 不算功能。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if ((0, files_1.isNoiseFile)(f.path) || (0, files_1.isTestFile)(f.path))
                continue;
            const hits = f.added.filter((l) => matchesAny(l.text, STUB));
            if (hits.length === 0)
                continue;
            out.push({
                file: f.path,
                line: hits[0].line,
                evidence: trimEvidence(hits.map((l) => l.text)),
                message: {
                    en: `${hits.length} stub marker${hits.length > 1 ? "s" : ""}`,
                    zh: `${hits.length} 处桩代码标记`,
                },
                count: hits.length,
            });
        }
        return out;
    },
};
const snapshotBlast = {
    id: "snapshot-blast",
    severity: "high",
    weight: 15,
    name: { en: "snapshots mass-regenerated", zh: "快照被批量重生成" },
    why: {
        en: "Regenerating snapshots makes any output match. If it was done with `-u`, nobody reviewed what changed.",
        zh: "重生成快照能让任何输出都匹配。如果是用 `-u` 跑的，没人真正看过改了什么。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if (!(0, files_1.isSnapshotFile)(f.path))
                continue;
            if (f.added.length < 20)
                continue;
            if (f.added.length <= f.removed.length * 2)
                continue;
            out.push({
                file: f.path,
                line: f.added[0]?.line,
                evidence: [],
                message: {
                    en: `${f.added.length} snapshot lines rewritten`,
                    zh: `重写了 ${f.added.length} 行快照`,
                },
            });
        }
        return out;
    },
};
const testRatio = {
    id: "test-ratio",
    severity: "medium",
    weight: 8,
    name: { en: "large change, no tests", zh: "大幅改动，测试没动" },
    why: {
        en: "Hundreds of lines of implementation landed without a proportional test change. Something should have been provable.",
        zh: "几百行实现落地，测试却没有相应增加。总该有点什么是可以被证明的。",
    },
    run(files) {
        const impl = files.filter((f) => f.status !== "deleted" && (0, files_1.isImplementationFile)(f.path));
        const tests = files.filter((f) => (0, files_1.isTestFile)(f.path));
        const implAdded = impl.reduce((n, f) => n + f.added.length, 0);
        const testAdded = tests.reduce((n, f) => n + f.added.length, 0);
        if (implAdded < 150)
            return [];
        if (testAdded >= implAdded * 0.02)
            return [];
        const biggest = impl.slice().sort((a, b) => b.added.length - a.added.length)[0];
        return [
            {
                file: biggest?.path ?? ".",
                line: biggest?.added[0]?.line,
                evidence: [],
                message: {
                    en: `+${implAdded} implementation lines, +${testAdded} test lines`,
                    zh: `新增 ${implAdded} 行实现，只新增 ${testAdded} 行测试`,
                },
            },
        ];
    },
};
const typeEscape = {
    id: "type-escape",
    severity: "low",
    weight: 4,
    name: { en: "type escapes", zh: "类型逃逸" },
    why: {
        en: "`any` spreads. A handful of new casts can quietly delete the type safety around them.",
        zh: "`any` 会扩散。几个新的类型断言，就能悄悄抹掉周围一片的类型安全。",
    },
    run(files) {
        const out = [];
        for (const f of files) {
            if (!/\.(?:[cm]?[jt]sx?)$/.test(f.path) || (0, files_1.isTestFile)(f.path))
                continue;
            const hits = f.added.filter((l) => /:\s*any\b|\bas\s+any\b|\bany\[\]/.test(l.text));
            if (hits.length < 3)
                continue;
            out.push({
                file: f.path,
                line: hits[0].line,
                evidence: trimEvidence(hits.map((l) => l.text)),
                message: {
                    en: `${hits.length} new \`any\``,
                    zh: `新增 ${hits.length} 处 \`any\``,
                },
                count: hits.length,
            });
        }
        return out;
    },
};
/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */
exports.RULES = [
    testDeleted,
    testFileDeleted,
    testSkipped,
    testIgnored,
    mockUnderTest,
    assertionsRemoved,
    assertionWeakened,
    errorSwallowed,
    ...checksDisabled,
    configLoosened,
    snapshotBlast,
    stubImplementation,
    mockInflation,
    testRatio,
    typeEscape,
];
function ruleById(id) {
    return exports.RULES.find((r) => r.id === id);
}
function applicableFiles(files, cfg) {
    if (cfg.ignore.length === 0)
        return files;
    return files.filter((f) => !cfg.ignore.some((prefix) => f.path === prefix || f.path.startsWith(prefix.replace(/\/$/, "") + "/")));
}
