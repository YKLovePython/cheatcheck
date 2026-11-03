import { FileDiff, FileStatus } from "./types";
/**
 * A small, dependency-free unified-diff parser.
 *
 * It accepts the output of `git diff`, `git diff --cached`, `git format-patch`
 * and most "paste your diff" sources. It only keeps what cheatcheck needs:
 * which files changed, and which lines were added or removed.
 */
export declare function parseDiff(text: string): FileDiff[];
export interface DiffStats {
    files: number;
    added: number;
    removed: number;
}
export declare function diffStats(files: FileDiff[]): DiffStats;
export declare function statusLabel(s: FileStatus): string;
