// Minimal Markdown -> DOCX converter for docs/DOCUMENTATION.md
// usage: node md2docx.js <input.md> <output.docx>
const fs = require("fs"), path = require("path");
const sizeOf = require("image-size");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, ImageRun, PageBreak, TableOfContents, Footer, PageNumber, LevelFormat,
} = require("docx");

const [, , inFile, outFile] = process.argv;
const baseDir = path.dirname(path.resolve(inFile));
const lines = fs.readFileSync(inFile, "utf8").split(/\r?\n/);
const FONT = "Calibri", MONO = "Consolas";
const CONTENT_W = 9026; // A4 width 11906 - 2*1440 margins (DXA)
const MAX_IMG_W = 600, MAX_IMG_H = 820; // px at 96 dpi

// inline: **bold**, *italic*, `code`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: 19, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONT, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };

function table(rows) {
  const cells = rows.map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  const header = cells[0], body = cells.slice(2);
  const n = header.length;
  // column widths proportional to the longest text in each column (min share)
  const len = header.map((_, i) => Math.max(...[header, ...body].map((r) => (r[i] || "").length), 4));
  const total = len.reduce((a, b) => a + Math.min(b, 60), 0);
  let widths = len.map((l) => Math.max(900, Math.round((Math.min(l, 60) / total) * CONTENT_W)));
  const scale = CONTENT_W / widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => Math.floor(w * scale));
  widths[n - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  const mk = (r, head) => new TableRow({
    tableHeader: head,
    children: r.map((c, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: head ? { fill: "E8E3F7", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: runs(c, { size: 19, bold: head || undefined }) })],
    })),
  });
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    rows: [mk(header, true), ...body.map((r) => mk(r, false))] });
}

function image(rel, alt) {
  let file = path.resolve(baseDir, rel), maxH = MAX_IMG_H;
  const portrait = file.replace(/\.png$/, "_portrait.png");
  if (fs.existsSync(portrait)) { file = portrait; maxH = 840; }
  const buf = fs.readFileSync(file);
  const { width, height } = sizeOf(buf);
  let w = MAX_IMG_W, h = Math.round((height / width) * w);
  if (h > maxH) { h = maxH; w = Math.round((width / height) * h); }
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: "png", data: buf, transformation: { width: w, height: h }, altText: { title: alt, description: alt, name: alt } })] });
}

const children = []; const numberingConfigs = [];
let i = 0, firstH1 = true;
while (i < lines.length) {
  const l = lines[i];
  if (!l.trim()) { i++; continue; }
  if (l.startsWith("# ")) {
    // title page
    children.push(new Paragraph({ spacing: { before: 2400, after: 240 }, alignment: AlignmentType.CENTER, heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: l.slice(2), font: FONT, bold: true, size: 48, color: "4B2A8C" })] }));
    i++; firstH1 = false; continue;
  }
  if (l.startsWith("## ")) {
    if (!children.tocAdded) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "Contents", font: FONT, bold: true, size: 32, color: "4B2A8C" })] }));
      children.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-1" }));
      children.tocAdded = true;
    }
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: runs(l.slice(3)) }));
    i++; continue;
  }
  if (l.startsWith("### ")) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(l.slice(4)) })); i++; continue; }
  if (l.startsWith("```")) {
    i++; const code = [];
    while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
    i++;
    code.forEach((c, k) => children.push(new Paragraph({
      shading: { fill: "F4F4F6", type: ShadingType.CLEAR, color: "auto" },
      spacing: { before: k === 0 ? 120 : 0, after: k === code.length - 1 ? 160 : 0, line: 260 },
      indent: { left: 140, right: 140 },
      children: [new TextRun({ text: c || " ", font: MONO, size: 17 })] })));
    continue;
  }
  if (l.startsWith("|")) {
    const rows = []; while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
    children.push(table(rows)); children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    continue;
  }
  const img = l.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
  if (img) { children.push(image(img[2], img[1])); i++; continue; }
  if (/^\*Figure/.test(l.trim())) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: runs(l.trim().replace(/^\*|\*$/g, ""), { italics: true, size: 19, color: "555555" }) }));
    i++; continue;
  }
  if (/^- /.test(l)) { children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(l.slice(2)) })); i++; continue; }
  const num = l.match(/^(\d+)\. (.*)/);
  if (num) {
    // restart numbering for each list block
    const ref = "num" + i;
    numberingConfigs.push({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] });
    while (i < lines.length && /^\d+\. /.test(lines[i])) {
      children.push(new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(lines[i].replace(/^\d+\. /, "")) })); i++;
    }
    continue;
  }
  children.push(new Paragraph({ spacing: { after: 120 }, children: runs(l) })); i++;
}


numberingConfigs.unshift({ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 540, hanging: 280 } } } }] });

const doc = new Document({
  creator: "MoodTune team", title: "MoodTune – Project Documentation",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", run: { font: FONT, size: 48, bold: true }, paragraph: { spacing: { before: 0, after: 240 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 32, bold: true, color: "4B2A8C" }, paragraph: { spacing: { before: 240, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: "333333" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: numberingConfigs },
  features: { updateFields: true },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "MoodTune – DBMS Level 3 Project  ·  Page ", size: 18, color: "777777" }),
                 new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "777777" })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(outFile, b); console.log("wrote", outFile, b.length, "bytes"); });
