import { Analysis, Lang, Severity } from "./types";
export interface ReportOptions {
    lang: Lang;
    color: boolean;
    verbose?: boolean;
    version: string;
    width?: number;
}
export declare function renderReport(a: Analysis, opts: ReportOptions): string;
export declare function renderJson(a: Analysis): string;
export declare function renderMarkdown(a: Analysis, lang: Lang): string;
export declare function renderGithub(a: Analysis, lang: Lang): string;
export interface RuleInfo {
    id: string;
    severity: Severity;
    weight: number;
    name: Record<Lang, string>;
    why: Record<Lang, string>;
}
export declare function renderRuleList(rules: RuleInfo[], lang: Lang, color: boolean): string;
export declare function renderRuleExplain(rule: RuleInfo, lang: Lang, color: boolean): string;
