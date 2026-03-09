const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TableOfContents,
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
  const match = trimmed.match(/^!\[(.*?)\]\((?:<)?(.+?)(?:>)?\)$/);
  if (!match) return null;
  return { alt: match[1] || "", rawPath: match[2] || "" };
}

function buildInlineRuns(text) {
  const runs = [];
  let cursor = 0;

  while (cursor < text.length) {
    if (text.startsWith("**", cursor)) {
      const end = text.indexOf("**", cursor + 2);
      if (end > cursor + 2) {
        runs.push(new TextRun({ text: text.slice(cursor + 2, end), bold: true }));
        cursor = end + 2;
        continue;
      }
    }

    if (text[cursor] === "`") {
      const end = text.indexOf("`", cursor + 1);
      if (end > cursor + 1) {
        runs.push(
          new TextRun({
            text: text.slice(cursor + 1, end),
            font: "Consolas",
            shading: { fill: "EEEEEE" },
          })
        );
        cursor = end + 1;
        continue;
      }
    }

    if (text[cursor] === "*") {
      const end = text.indexOf("*", cursor + 1);
      if (end > cursor + 1) {
        runs.push(new TextRun({ text: text.slice(cursor + 1, end), italics: true }));
        cursor = end + 1;
        continue;
      }
    }

    let next = text.length;
    for (const token of ["**", "`", "*"]) {
      const index = text.indexOf(token, cursor + 1);
      if (index !== -1 && index < next) next = index;
    }
    runs.push(new TextRun(text.slice(cursor, next)));
    cursor = next;
  }

  return runs.length > 0 ? runs : [new TextRun("")];
}

function extractCoverInfo(lines, inputPath) {
  const info = {
    title: path.basename(inputPath, path.extname(inputPath)),
    subtitle: "Slack 운영·보안·오류 추적 총정리",
    metadata: [],
    summary: "",
  };

  let titleFound = false;
  let summaryStarted = false;
  const summaryLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!titleFound) {
      const headingMatch = line.match(/^#\s+(.*)$/);
      if (headingMatch) {
        info.title = headingMatch[1].trim() || info.title;
        titleFound = true;
      }
      continue;
    }

    if (!summaryStarted && /^.+:\s+.+$/.test(line)) {
      info.metadata.push(line);
      continue;
    }

    if (!summaryStarted && line.length === 0) {
      summaryStarted = true;
      continue;
    }

    if (summaryStarted) {
      if (line.length === 0 || line.startsWith("## ")) break;
      summaryLines.push(line);
    }
  }

  info.summary = summaryLines.join(" ").trim();
  return info;
}

function buildCoverChildren(coverInfo) {
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1600, after: 240 },
      children: [new TextRun({ text: coverInfo.title, bold: true, size: 36 * 2 })],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [new TextRun({ text: coverInfo.subtitle, color: "4F81BD", size: 16 * 2 })],
    })
  );

  for (const line of coverInfo.metadata) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: line, color: "666666" })],
      })
    );
  }

  if (coverInfo.summary) {
    children.push(
      new Paragraph({
        spacing: { before: 520, after: 200 },
        children: [new TextRun({ text: "문서 개요", bold: true, size: 15 * 2 })],
      })
    );
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: buildInlineRuns(coverInfo.summary),
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 1200 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Prepared from local Markdown source", italics: true, color: "888888" })],
    })
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function buildTableOfContentsChildren() {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun("목차")],
    }),
    new TableOfContents("목차", {
      hyperlink: true,
      headingStyleRange: "1-3",
      pageNumbersEntryLevelsRange: "1-3",
    }),
    new Paragraph({
      spacing: { before: 160, after: 160 },
      children: [
        new TextRun({
          text: "목차가 비어 보이면 Word에서 문서를 연 뒤 Ctrl+A, F9로 갱신하세요.",
          italics: true,
          color: "777777",
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildMarkdownChildren(lines, mdPath) {
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
          spacing: { before: headingMatch[1].length === 1 ? 240 : 160, after: 120 },
          children: buildInlineRuns(headingMatch[2]),
        })
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
            spacing: { after: 120 },
            children: [
              new ImageRun({
                data,
                transformation: { width, height },
              }),
            ],
          })
        );

        if (image.alt) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 160 },
              children: [new TextRun({ text: image.alt, italics: true })],
            })
          );
        }
      } else {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun(`[이미지 누락] ${image.rawPath}`)],
          })
        );
      }
      continue;
    }

    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    if (bulletMatch) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: buildInlineRuns(bulletMatch[1]),
        })
      );
      continue;
    }

    const numberedMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: `${numberedMatch[1]}. `, bold: true }),
            ...buildInlineRuns(numberedMatch[2]),
          ],
        })
      );
      continue;
    }

    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: buildInlineRuns(line),
      })
    );
  }

  return children;
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/generate-report-docx-from-markdown.js <input.md> <output.docx>"
    );
  }

  const cwd = process.cwd();
  const mdPath = path.resolve(cwd, inputPath);
  const docxPath = path.resolve(cwd, outputPath);
  const markdown = fs.readFileSync(mdPath, "utf8");
  const lines = markdown.split(/\r?\n/);
  const coverInfo = extractCoverInfo(lines, mdPath);

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun("페이지 "),
          new TextRun({ children: [PageNumber.CURRENT] }),
          new TextRun(" / "),
          new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
        ],
      }),
    ],
  });

  const children = [
    ...buildCoverChildren(coverInfo),
    ...buildTableOfContentsChildren(),
    ...buildMarkdownChildren(lines, mdPath),
  ];

  const doc = new Document({
    title: coverInfo.title,
    description: coverInfo.subtitle,
    creator: "OpenAI Codex",
    features: {
      updateFields: true,
    },
    sections: [
      {
        footers: { default: footer },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  process.stdout.write(`WROTE ${docxPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
