import { FileDiff } from "./types";
export declare function isTestFile(path: string): boolean;
export declare function isSnapshotFile(path: string): boolean;
export declare function isCodeFile(path: string): boolean;
export declare function isDocFile(path: string): boolean;
export declare function isNoiseFile(path: string): boolean;
/** Files that count as "the implementation" when judging test coverage of a change. */
export declare function isImplementationFile(path: string): boolean;
export declare function isConfigFile(path: string): boolean;
/** Strip the language-specific test suffix so `foo.test.ts` and `foo_test.go` compare equal. */
export declare function testBasename(path: string): string;
/** `src/auth/token.test.ts` -> `token` */
export declare function moduleBasename(path: string): string;
export declare function filesTouching(files: FileDiff[], pred: (f: FileDiff) => boolean): FileDiff[];
