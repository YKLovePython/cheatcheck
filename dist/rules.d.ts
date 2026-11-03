import { Config, FileDiff, RuleMeta } from "./types";
export declare const RULES: RuleMeta[];
export declare function ruleById(id: string): RuleMeta | undefined;
export declare function applicableFiles(files: FileDiff[], cfg: Config): FileDiff[];
