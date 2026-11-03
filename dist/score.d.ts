import { Analysis, Config, Verdict } from "./types";
import { FileDiff } from "./types";
export declare function deductionFor(weight: number, count?: number): number;
export declare function verdictFor(score: number): Verdict;
export declare function analyze(input: FileDiff[], cfg: Config): Analysis;
export declare function shouldFail(a: Analysis, cfg: Config): boolean;
