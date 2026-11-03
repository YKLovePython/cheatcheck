export type Severity = "critical" | "high" | "medium" | "low";

export type Verdict = "pass" | "review" | "risky" | "fail";

export type Lang = "en" | "zh";

export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "binary";

export interface DiffLine {
  /** Line number in the file it belongs to (new file for additions, old file for deletions). */
  line: number;
  text: string;
}

export interface FileDiff {
  /** Path after the change (old path for deleted files). */
  path: string;
  oldPath?: string;
  status: FileStatus;
  added: DiffLine[];
  removed: DiffLine[];
}

export interface Message {
  en: string;
  zh: string;
}

export interface RawFinding {
  file: string;
  line?: number;
  /** The offending snippets, already trimmed. */
  evidence: string[];
  message: Message;
  /** How many instances this finding covers (used for scoring). */
  count?: number;
}

export interface Finding extends RawFinding {
  rule: string;
  severity: Severity;
  deduction: number;
  ruleName: Message;
  why: Message;
}

export interface RuleMeta {
  id: string;
  severity: Severity;
  weight: number;
  name: Message;
  why: Message;
  run(files: FileDiff[], cfg: Config): RawFinding[];
}

export interface Config {
  /** Path prefixes to skip entirely. */
  ignore: string[];
  /** Rule ids to disable. */
  ignoreRules: string[];
  /** Fail when the trust score drops below this value. */
  threshold: number;
  /** Treat "review" as a failure too. */
  strict: boolean;
}

export interface Analysis {
  files: number;
  added: number;
  removed: number;
  score: number;
  verdict: Verdict;
  findings: Finding[];
  bySeverity: Record<Severity, number>;
  /** Rule ids that produced at least one finding. */
  triggered: string[];
}
