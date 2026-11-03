#!/usr/bin/env node
/**
 * Regenerates docs/demo.svg (and docs/demo.zh.svg) from the real CLI output.
 * Run: npm run demo:svg
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const COLORS = {
  31: "#f85149",
  32: "#3fb950",
  33: "#d29922",
  36: "#58a6ff",
  90: "#7d8590",
  91: "#ff7b72",
};
const BOLD = "#e6edf3";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseAnsi(text) {
  const lines = [];
  let cur = { text: "", fill: BOLD, bold: false };
  let line = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\u001b") {
      const m = /^\u001b\[([0-9;]*)m/.exec(text.slice(i));
      if (m) {
        if (cur.text) {
          line.push(cur);
          cur = { text: "", fill: BOLD, bold: false };
        }
        const codes = m[1].split(";").filter(Boolean);
        if (codes.includes("0") || codes.length === 0) {
          cur = { text: "", fill: BOLD, bold: false };
        }
        for (const c of codes) {
          if (c === "1") cur = { ...cur, bold: true };
          if (c === "2") cur = { ...cur, fill: "#7d8590" };
          if (COLORS[Number(c)]) cur = { ...cur, fill: COLORS[Number(c)] };
        }
        i += m[0].length;
        continue;
      }
    }
    if (ch === "\n") {
      if (cur.text) line.push(cur);
      lines.push(line);
      line = [];
      cur = { text: "", fill: BOLD, bold: false };
      i++;
      continue;
    }
    cur = { ...cur, text: cur.text + ch };
    i++;
  }
  if (cur.text) line.push(cur);
  if (line.length) lines.push(line);
  return lines;
}

function measure(segs) {
  let w = 0;
  for (const s of segs) {
    for (const ch of s.text) {
      const cp = ch.codePointAt(0);
      const wide =
        (cp >= 0x1100 && cp <= 0x115f) ||
        (cp >= 0x2e80 && cp <= 0xa4cf) ||
        (cp >= 0x1f300 && cp <= 0x1f64f);
      w += wide ? 13.6 : 8.2;
    }
  }
  return w;
}

function build(lines, title) {
  const lineHeight = 21;
  const top = 74;
  const widest = Math.max(0, ...lines.map(measure));
  const width = Math.max(660, Math.min(980, Math.ceil(widest) + 60));
  const height = top + lines.length * lineHeight + 26;
  const parts = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${esc(title)}">`);
  parts.push(`<rect width="${width}" height="${height}" rx="12" fill="#0d1117" stroke="#30363d"/>`);
  parts.push(`<rect width="${width}" height="38" rx="12" fill="#161b22"/>`);
  parts.push(`<rect y="26" width="${width}" height="12" fill="#161b22"/>`);
  parts.push(`<line x1="0" y1="38" x2="${width}" y2="38" stroke="#30363d"/>`);
  for (let i = 0; i < 3; i++) {
    parts.push(`<circle cx="${22 + i * 18}" cy="19" r="6" fill="${["#ff5f56", "#ffbd2e", "#27c93f"][i]}"/>`);
  }
  parts.push(`<text x="${width / 2}" y="23" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" fill="#7d8590">${esc(title)}</text>`);

  lines.forEach((segs, idx) => {
    const y = top + idx * lineHeight;
    if (segs.length === 0) return;
    parts.push(
      `<text x="30" y="${y}" xml:space="preserve" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13.6">` +
        segs
          .map(
            (s) =>
              `<tspan fill="${s.fill}"${s.bold ? ' font-weight="600"' : ""}>${esc(s.text)}</tspan>`
          )
          .join("") +
        `</text>`
    );
  });

  parts.push("</svg>");
  return parts.join("\n");
}

function generate(lang, file, title) {
  const res = spawnSync(process.execPath, [path.join(ROOT, "dist", "cli.js"), "--diff", "examples/demo.diff", "--lang", lang], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const lines = parseAnsi(res.stdout);
  const svg = build(lines, title);
  fs.writeFileSync(path.join(ROOT, file), svg, "utf8");
  console.log(`wrote ${file} (${lines.length} lines)`);
}

fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
generate("en", "docs/demo.svg", "cheatcheck — catching an agent that deleted its own tests");
generate("zh", "docs/demo.zh.svg", "cheatcheck — 抓到一个删掉自己测试的 agent");
