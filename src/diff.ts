import { FileDiff, FileStatus } from "./types";

/**
 * A small, dependency-free unified-diff parser.
 *
 * It accepts the output of `git diff`, `git diff --cached`, `git format-patch`
 * and most "paste your diff" sources. It only keeps what cheatcheck needs:
 * which files changed, and which lines were added or removed.
 */
export function parseDiff(text: string): FileDiff[] {
  const lines = text.split(/\r?\n/);
  const files: FileDiff[] = [];

  let cur: FileDiff | null = null;
  let inHunk = false;
  let oldLn = 0;
  let newLn = 0;

  const start = (path: string): FileDiff => ({
    path,
    status: "modified",
    added: [],
    removed: [],
  });

  for (const raw of lines) {
    if (raw.startsWith("diff --git ")) {
      if (cur) files.push(cur);
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw);
      cur = start(m ? m[2] : pathFromHeader(raw));
      if (m) cur.oldPath = m[1];
      inHunk = false;
      continue;
    }

    // Some tools emit diffs without the "diff --git" line.
    if (!cur && /^--- (a\/|b\/|\/dev\/null)/.test(raw)) {
      cur = start("");
      inHunk = false;
    }

    if (!cur) continue;

    if (!inHunk) {
      const header = raw;
      if (header.startsWith("new file mode")) {
        cur.status = "added";
        continue;
      }
      if (header.startsWith("deleted file mode")) {
        cur.status = "deleted";
        continue;
      }
      if (header.startsWith("rename from ")) {
        cur.oldPath = header.slice("rename from ".length);
        cur.status = "renamed";
        continue;
      }
      if (header.startsWith("rename to ")) {
        cur.path = header.slice("rename to ".length);
        cur.status = "renamed";
        continue;
      }
      if (header.startsWith("Binary files ") || header.startsWith("GIT binary patch")) {
        cur.status = "binary";
        continue;
      }
      if (header.startsWith("--- ")) {
        const p = header.slice(4).trim();
        if (p !== "/dev/null") cur.oldPath = stripPrefix(p);
        else cur.status = "added";
        continue;
      }
      if (header.startsWith("+++ ")) {
        const p = header.slice(4).trim();
        if (p !== "/dev/null") cur.path = stripPrefix(p);
        else cur.status = "deleted";
        continue;
      }
      if (header.startsWith("index ") || header.startsWith("similarity index") || header.startsWith("dissimilarity index")) {
        continue;
      }
    }

    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (hunk) {
      oldLn = parseInt(hunk[1], 10);
      newLn = parseInt(hunk[3], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    const marker = raw[0];
    if (marker === "+") {
      cur.added.push({ line: newLn, text: raw.slice(1) });
      newLn++;
    } else if (marker === "-") {
      cur.removed.push({ line: oldLn, text: raw.slice(1) });
      oldLn++;
    } else if (marker === " ") {
      oldLn++;
      newLn++;
    } else if (marker === "\\") {
      // "\ No newline at end of file"
    } else if (raw === "") {
      // Trailing whitespace-only line pasted by humans; ignore.
    }
  }

  if (cur) files.push(cur);

  return files.filter((f) => f.path !== "" || f.oldPath !== undefined || (f.path === "" && f.added.length + f.removed.length > 0));
}

function pathFromHeader(raw: string): string {
  const parts = raw.split(" ");
  return parts[parts.length - 1] ?? "unknown";
}

function stripPrefix(p: string): string {
  return p.replace(/^[ab]\//, "");
}

export interface DiffStats {
  files: number;
  added: number;
  removed: number;
}

export function diffStats(files: FileDiff[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const f of files) {
    added += f.added.length;
    removed += f.removed.length;
  }
  return { files: files.length, added, removed };
}

export function statusLabel(s: FileStatus): string {
  switch (s) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "binary":
      return "B";
    default:
      return "M";
  }
}
