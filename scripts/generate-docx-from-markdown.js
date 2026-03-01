const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} = require("docx");
const { imageSize } = require("image-size");

function headingLevelFromDepth(depth) {
  switch (depth) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

function parseImageLine(line) {
  const trimmed = line.trim();
  const m = trimmed.match(/^!\[(.*?)\]\((?:<)?(.+?)(?:>)?\)$/);
  if (!m) return null;
  return { alt: m[1] || "", rawPath: m[2] || "" };
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/generate-docx-from-markdown.js <input.md> <output.docx>",
    );
  }

  const cwd = process.cwd();
  const mdPath = path.resolve(cwd, inputPath);
  const docxPath = path.resolve(cwd, outputPath);
  const md = fs.readFileSync(mdPath, "utf8");
  const lines = md.split(/\r?\n/);
  const children = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      children.push(new Paragraph({ text: " ", spacing: { after: 120 } }));
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      children.push(
        new Paragraph({
          heading: headingLevelFromDepth(headingMatch[1].length),
          children: [new TextRun(headingMatch[2])],
          spacing: { after: 120 },
        }),
      );
      continue;
    }

    const image = parseImageLine(line);
    if (image) {
      const imagePath = path.resolve(path.dirname(mdPath), image.rawPath);
      if (fs.existsSync(imagePath)) {
        const data = fs.readFileSync(imagePath);
        const size = imageSize(data);
        const srcWidth = size.width || 1200;
        const srcHeight = size.height || 700;
        const maxWidth = 520;
        const width = Math.min(srcWidth, maxWidth);
        const height = Math.round((srcHeight * width) / srcWidth);

        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data,
                transformation: { width, height },
              }),
            ],
            spacing: { after: 120 },
          }),
        );

        if (image.alt) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: image.alt, italics: true })],
              spacing: { after: 160 },
            }),
          );
        }
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun(`[이미지 누락] ${image.rawPath}`)],
          }),
        );
      }
      continue;
    }

    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    if (bulletMatch) {
      children.push(
        new Paragraph({
          text: bulletMatch[1],
          bullet: { level: 0 },
          spacing: { after: 80 },
        }),
      );
      continue;
    }

    children.push(
      new Paragraph({
        text: line,
        spacing: { after: 120 },
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  process.stdout.write(`WROTE ${docxPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
