export { parseDiff, diffStats } from "./diff";
export { analyze, shouldFail, verdictFor, deductionFor } from "./score";
export { RULES, ruleById, applicableFiles } from "./rules";
export { renderReport, renderJson, renderMarkdown, renderGithub, renderRuleList, renderRuleExplain } from "./report";
export type {
  Analysis,
  Config,
  FileDiff,
  Finding,
  Lang,
  Message,
  RawFinding,
  RuleMeta,
  Severity,
  Verdict,
} from "./types";
