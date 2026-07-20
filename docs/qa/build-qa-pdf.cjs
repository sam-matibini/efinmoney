/**
 * Build a print-ready HTML from the QA markdown guide, then print via Edge.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const docBase = process.argv[2] || "eFinMoney_Product_System_Documentation";
const mdPath = path.join(root, "qa", `${docBase}.md`);
const htmlPath = path.join(root, "qa", `${docBase}.html`);
const pdfPath = path.join(root, "qa", `${docBase}.pdf`);

let marked;
try {
  marked = require("marked");
} catch {
  console.error("marked not installed");
  process.exit(1);
}

const md = fs.readFileSync(mdPath, "utf8");
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>eFinMoney — Product & System Documentation</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  :root {
    --ink: #1a1f2e;
    --muted: #5a6577;
    --line: #d8dee8;
    --brand: #4f46e5;
    --bg: #f7f8fb;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Calibri, Arial, sans-serif;
    color: var(--ink);
    font-size: 10.5pt;
    line-height: 1.45;
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 28px 48px;
  }
  h1 {
    font-size: 22pt;
    margin: 0 0 8px;
    color: var(--brand);
    border-bottom: 3px solid var(--brand);
    padding-bottom: 10px;
  }
  h2 {
    font-size: 14pt;
    margin: 28px 0 10px;
    color: var(--brand);
    page-break-after: avoid;
  }
  h3 {
    font-size: 11.5pt;
    margin: 18px 0 8px;
    page-break-after: avoid;
  }
  h4 {
    font-size: 10.5pt;
    margin: 14px 0 6px;
  }
  p, li { margin: 6px 0; }
  ul, ol { padding-left: 1.3em; }
  hr {
    border: none;
    border-top: 1px solid var(--line);
    margin: 20px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--line);
    padding: 6px 8px;
    vertical-align: top;
    text-align: left;
  }
  th {
    background: var(--bg);
    font-weight: 600;
  }
  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 9pt;
    background: var(--bg);
    padding: 1px 4px;
    border-radius: 3px;
  }
  strong { font-weight: 600; }
  blockquote {
    margin: 10px 0;
    padding: 8px 12px;
    border-left: 4px solid var(--brand);
    background: var(--bg);
  }
  .cover-meta {
    color: var(--muted);
    font-size: 10pt;
    margin-bottom: 20px;
  }
  @media print {
    body { padding: 0; max-width: none; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;

fs.writeFileSync(htmlPath, html, "utf8");
console.log("Wrote", htmlPath);

const edgeCandidates = [
  process.env["ProgramFiles(x86)"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.ProgramFiles + "\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.ProgramFiles + "\\Google\\Chrome\\Application\\chrome.exe",
];
const browser = edgeCandidates.find((p) => p && fs.existsSync(p));
if (!browser) {
  console.error("No Edge/Chrome found");
  process.exit(1);
}

const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

execFileSync(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ],
  { stdio: "inherit", timeout: 120000 }
);

if (!fs.existsSync(pdfPath)) {
  console.error("PDF was not created");
  process.exit(1);
}
console.log("Wrote", pdfPath, `(${Math.round(fs.statSync(pdfPath).size / 1024)} KB)`);
